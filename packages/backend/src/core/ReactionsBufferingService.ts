/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { TimeService } from '@/global/TimeService.js';
import type { MiNote } from '@/models/Note.js';
import { bindThis } from '@/decorators.js';
import type { MiUser, NotesRepository } from '@/models/_.js';
import type { Config } from '@/config.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';
import { InternalEventService, InternalEventTypes } from '@/global/InternalEventService.js';
import type { OnApplicationShutdown } from '@nestjs/common';

const REDIS_DELTA_PREFIX = 'reactionsBufferDeltas';
const REDIS_PAIR_PREFIX = 'reactionsBufferPairs';
// Tombstones so create() reseed from stale DB pair cache cannot resurrect deletes.
const REDIS_DELETED_PREFIX = 'reactionsBufferDeleted';

// Atomic create: SISMEMBER each bounded currentPairs member (no SMEMBERS / bulk ZREM).
const CREATE_REACTION_BUFFER_SCRIPT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], 1)
for i = 5, #ARGV do
	local m = ARGV[i]
	if redis.call('SISMEMBER', KEYS[3], m) == 0 then
		redis.call('ZADD', KEYS[2], i - 5, m)
	end
end
redis.call('SREM', KEYS[3], ARGV[2])
redis.call('ZADD', KEYS[2], tonumber(ARGV[3]), ARGV[2])
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -(tonumber(ARGV[4]) + 1))
return 1
`;

// Atomic delete: delta -1, remove pair, add tombstone.
const DELETE_REACTION_BUFFER_SCRIPT = `
redis.call('HINCRBY', KEYS[1], ARGV[1], -1)
redis.call('ZREM', KEYS[2], ARGV[2])
redis.call('SADD', KEYS[3], ARGV[2])
return 1
`;

// Bake snapshot: DEL only delta + pairs; keep deleted set as fence until SQL succeeds.
const BAKE_NOTE_REACTION_BUFFER_SCRIPT = `
local deltas = redis.call('HGETALL', KEYS[1])
local pairs = redis.call('ZRANGE', KEYS[2], 0, -1)
local deleted = redis.call('SMEMBERS', KEYS[3])
redis.call('DEL', KEYS[1], KEYS[2])
return {deltas, pairs, deleted}
`;

@Injectable()
export class ReactionsBufferingService implements OnApplicationShutdown {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		@Inject(DI.redisForReactions)
		private redisForReactions: Redis.Redis, // TODO: 専用のRedisインスタンスにする

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private readonly timeService: TimeService,
		private readonly internalEventService: InternalEventService,
	) {
		this.internalEventService.on('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	private async onMetaUpdated(body: InternalEventTypes['metaUpdated']): Promise<void> {
		// リアクションバッファリングが有効→無効になったら即bake
		if (body.before.enableReactionsBuffering && !body.after.enableReactionsBuffering) {
			await this.bake();
		}
	}

	@bindThis
	public async create(noteId: MiNote['id'], userId: MiUser['id'], reaction: string, currentPairs: string[]): Promise<void> {
		const pair = `${userId}/${reaction}`;
		await this.redisForReactions.eval(
			CREATE_REACTION_BUFFER_SCRIPT,
			3,
			`${REDIS_DELTA_PREFIX}:${noteId}`,
			`${REDIS_PAIR_PREFIX}:${noteId}`,
			`${REDIS_DELETED_PREFIX}:${noteId}`,
			reaction,
			pair,
			String(this.timeService.now),
			String(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX),
			...currentPairs,
		);
	}

	@bindThis
	public async delete(noteId: MiNote['id'], userId: MiUser['id'], reaction: string): Promise<void> {
		const pair = `${userId}/${reaction}`;
		await this.redisForReactions.eval(
			DELETE_REACTION_BUFFER_SCRIPT,
			3,
			`${REDIS_DELTA_PREFIX}:${noteId}`,
			`${REDIS_PAIR_PREFIX}:${noteId}`,
			`${REDIS_DELETED_PREFIX}:${noteId}`,
			reaction,
			pair,
		);
	}

	@bindThis
	public async get(noteId: MiNote['id']): Promise<{
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}> {
		const pipeline = this.redisForReactions.pipeline();
		pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
		pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
		pipeline.smembers(`${REDIS_DELETED_PREFIX}:${noteId}`);
		const results = await pipeline.exec();

		const resultDeltas = results![0][1] as Record<string, string>;
		const resultPairs = results![1][1] as string[];
		const resultDeleted = results![2][1] as string[];
		const deleted = new Set(resultDeleted);

		const deltas = {} as Record<string, number>;
		for (const [name, count] of Object.entries(resultDeltas)) {
			deltas[name] = parseInt(count);
		}

		const pairs = resultPairs
			.filter(x => !deleted.has(x))
			.map(x => x.split('/') as [MiUser['id'], string]);

		return {
			deltas,
			pairs,
		};
	}

	@bindThis
	public async getMany(noteIds: MiNote['id'][]): Promise<Map<MiNote['id'], {
		deltas: Record<string, number>;
		pairs: ([MiUser['id'], string])[];
	}>> {
		const map = new Map<MiNote['id'], {
			deltas: Record<string, number>;
			pairs: ([MiUser['id'], string])[];
		}>();

		const pipeline = this.redisForReactions.pipeline();
		for (const noteId of noteIds) {
			pipeline.hgetall(`${REDIS_DELTA_PREFIX}:${noteId}`);
			pipeline.zrange(`${REDIS_PAIR_PREFIX}:${noteId}`, 0, -1);
			pipeline.smembers(`${REDIS_DELETED_PREFIX}:${noteId}`);
		}
		const results = await pipeline.exec();

		const opsForEachNotes = 3;
		for (let i = 0; i < noteIds.length; i++) {
			const noteId = noteIds[i];
			const resultDeltas = results![i * opsForEachNotes][1] as Record<string, string>;
			const resultPairs = results![i * opsForEachNotes + 1][1] as string[];
			const resultDeleted = results![i * opsForEachNotes + 2][1] as string[];
			const deleted = new Set(resultDeleted);

			const deltas = {} as Record<string, number>;
			for (const [name, count] of Object.entries(resultDeltas)) {
				deltas[name] = parseInt(count);
			}

			const pairs = resultPairs
				.filter(x => !deleted.has(x))
				.map(x => x.split('/') as [MiUser['id'], string]);

			map.set(noteId, {
				deltas,
				pairs,
			});
		}

		return map;
	}

	// TODO: scanは重い可能性があるので、別途 bufferedNoteIds を直接Redis上に持っておいてもいいかもしれない
	@bindThis
	public async bake(): Promise<void> {
		const bufferedNoteIds: string[] = [];
		let cursor = '0';
		do {
			// https://github.com/redis/ioredis#transparent-key-prefixing
			const result = await this.redisForReactions.scan(
				cursor,
				'MATCH',
				`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:*`,
				'COUNT',
				'1000');

			cursor = result[0];
			bufferedNoteIds.push(...result[1].map(x => x.replace(`${this.config.redis.prefix}:${REDIS_DELTA_PREFIX}:`, '')));
		} while (cursor !== '0');

		// TODO: SQL一個にまとめたい
		for (const noteId of bufferedNoteIds) {
			const raw = await this.redisForReactions.eval(
				BAKE_NOTE_REACTION_BUFFER_SCRIPT,
				3,
				`${REDIS_DELTA_PREFIX}:${noteId}`,
				`${REDIS_PAIR_PREFIX}:${noteId}`,
				`${REDIS_DELETED_PREFIX}:${noteId}`,
			) as [string[], string[], string[]];

			const flatDeltas = raw[0] ?? [];
			const resultPairs = raw[1] ?? [];
			const resultDeleted = raw[2] ?? [];
			const deleted = new Set(resultDeleted);

			const deltas = {} as Record<string, number>;
			for (let i = 0; i < flatDeltas.length; i += 2) {
				deltas[flatDeltas[i]] = parseInt(flatDeltas[i + 1]);
			}

			const pairs = resultPairs.filter(x => !deleted.has(x));

			const sql = Object.entries(deltas)
				.map(([reaction, count]) =>
					// Keep bake counts non-negative; convertLegacyReactions already drops <=0 for API.
					`jsonb_set("reactions", '{${reaction}}', (GREATEST(0, COALESCE("reactions"->>'${reaction}', '0')::int + ${count}))::text::jsonb)`)
				.join(' || ');

			// Empty snapshot: leave any remaining fence members; do not blank-wipe deleted.
			if (!sql && pairs.length === 0) continue;

			await this.notesRepository.createQueryBuilder().update()
				.set({
					reactions: () => sql || `"reactions"`,
					reactionAndUserPairCache: pairs,
				})
				.where('id = :id', { id: noteId })
				.execute();

			// Release only this bake's snapshot tombstones; concurrent post-snap deletes stay fenced.
			if (resultDeleted.length > 0) {
				await this.redisForReactions.srem(`${REDIS_DELETED_PREFIX}:${noteId}`, ...resultDeleted);
			}
		}
	}

	@bindThis
	public mergeReactions(src: MiNote['reactions'], delta: Record<string, number>): MiNote['reactions'] {
		const reactions = { ...src };
		for (const [name, count] of Object.entries(delta)) {
			if (reactions[name] != null) {
				reactions[name] += count;
			} else {
				reactions[name] = count;
			}
			if (reactions[name] < 0) {
				reactions[name] = 0;
			}
		}
		return reactions;
	}

	@bindThis
	public dispose(): void {
		this.internalEventService.off('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
