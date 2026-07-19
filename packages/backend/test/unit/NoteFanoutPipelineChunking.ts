/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import { NoteEditService } from '@/core/NoteEditService.js';
import type { MiNote } from '@/models/Note.js';

const FANOUT_PIPELINE_CHUNK_SIZE = 30_000;

type PipelineCommand = [string, ...unknown[]];

type SizeLimitedPipeline = {
	readonly length: number;
	lpush: (...args: unknown[]) => SizeLimitedPipeline;
	ltrim: (...args: unknown[]) => SizeLimitedPipeline;
	exec: () => Promise<[Error | null, unknown][]>;
};

function createSizeLimitedRedis(options?: {
	maxCommands?: number;
	failOnExecCall?: number;
}) {
	const maxCommands = options?.maxCommands ?? FANOUT_PIPELINE_CHUNK_SIZE;
	const failOnExecCall = options?.failOnExecCall;
	const execSizes: number[] = [];
	const allCommands: PipelineCommand[] = [];
	let pipelineCreations = 0;
	let execCalls = 0;

	const redisForTimelines = {
		pipeline: jest.fn((): SizeLimitedPipeline => {
			pipelineCreations += 1;
			const commands: PipelineCommand[] = [];
			const pipeline: SizeLimitedPipeline = {
				get length() {
					return commands.length;
				},
				lpush: (...args: unknown[]) => {
					commands.push(['lpush', ...args]);
					return pipeline;
				},
				ltrim: (...args: unknown[]) => {
					commands.push(['ltrim', ...args]);
					return pipeline;
				},
				exec: async () => {
					execCalls += 1;
					if (commands.length > maxCommands) {
						throw new Error(`pipeline too large: ${commands.length} > ${maxCommands}`);
					}
					if (failOnExecCall != null && execCalls === failOnExecCall) {
						throw new Error(`forced exec failure #${failOnExecCall}`);
					}
					execSizes.push(commands.length);
					allCommands.push(...commands);
					return commands.map(() => [null, 1] as [Error | null, unknown]);
				},
			};
			return pipeline;
		}),
	};

	return {
		redisForTimelines,
		get execSizes() { return execSizes; },
		get allCommands() { return allCommands; },
		get pipelineCreations() { return pipelineCreations; },
		get execCalls() { return execCalls; },
	};
}

function baseNote(overrides: Partial<MiNote> = {}): MiNote {
	return {
		id: 'note1',
		updatedAt: null,
		replyId: null,
		reply: null,
		renoteId: null,
		renote: null,
		threadId: null,
		text: 'hello',
		name: null,
		cw: null,
		userId: 'author',
		user: null,
		localOnly: false,
		reactionAcceptance: null,
		renoteCount: 0,
		repliesCount: 0,
		clippedCount: 0,
		reactions: {},
		visibility: 'public',
		uri: null,
		url: null,
		fileIds: [],
		attachedFileTypes: [],
		visibleUserIds: [],
		mentions: [],
		mentionedRemoteUsers: '',
		reactionAndUserPairCache: [],
		emojis: [],
		tags: [],
		hasPoll: false,
		channelId: null,
		channel: null,
		userHost: null,
		userInstance: null,
		replyUserId: null,
		replyUserHost: null,
		replyUserInstance: null,
		renoteUserId: null,
		renoteUserHost: null,
		renoteUserInstance: null,
		processErrors: [],
		mandatoryCW: null,
		...overrides,
	} as MiNote;
}

function createHarness(Service: typeof NoteCreateService | typeof NoteEditService, options?: {
	followerCount?: number;
	channelFollowerCount?: number;
	fileIds?: string[];
	channelId?: string | null;
	maxCommands?: number;
	failOnExecCall?: number;
	noopPush?: boolean;
}) {
	const followerCount = options?.followerCount ?? 0;
	const channelFollowerCount = options?.channelFollowerCount ?? 0;
	const redis = createSizeLimitedRedis({
		maxCommands: options?.maxCommands,
		failOnExecCall: options?.failOnExecCall,
	});

	const followings = Array.from({ length: followerCount }, (_, i) => ({
		followerId: `f${i}`,
		withReplies: true,
	}));
	const channelFollowings = Array.from({ length: channelFollowerCount }, (_, i) => ({
		followerId: `cf${i}`,
	}));

	const fanoutTimelineService = {
		push: jest.fn(async (tl: string, id: string, _maxlen: number, pipeline: SizeLimitedPipeline) => {
			if (options?.noopPush) return;
			// Deterministic 1 command per push (no random ltrim).
			pipeline.lpush('list:' + tl, id);
		}),
	};

	const service = Object.create(Service.prototype) as InstanceType<typeof Service>;
	Object.assign(service, {
		meta: {
			enableFanoutTimeline: true,
			perUserHomeTimelineCacheMax: 1000,
			perUserListTimelineCacheMax: 1000,
			perLocalUserUserTimelineCacheMax: 300,
			perRemoteUserUserTimelineCacheMax: 100,
		},
		config: {
			perChannelMaxNoteCacheCount: 100,
		},
		redisForTimelines: redis.redisForTimelines,
		fanoutTimelineService,
		followingsRepository: {
			find: jest.fn(async () => followings),
		},
		channelFollowingsRepository: {
			find: jest.fn(async () => channelFollowings),
		},
		cacheService: {
			userListMembershipsCache: {
				fetch: jest.fn(async () => new Map()),
			},
		},
		notesRepository: {
			findOne: jest.fn(async () => null),
		},
	});

	const note = baseNote({
		fileIds: options?.fileIds ?? [],
		channelId: options?.channelId ?? null,
	});
	const user = { id: 'author', host: null as string | null };

	const pushToTl = (Reflect.get(service, 'pushToTl') as (note: MiNote, user: { id: string; host: string | null }) => Promise<void>).bind(service);

	return { redis, fanoutTimelineService, note, user, pushToTl };
}

describe('Note fanout pipeline chunking', () => {
	describe.each([
		['NoteCreateService', NoteCreateService],
		['NoteEditService', NoteEditService],
	] as const)('%s', (_name, Service) => {
		test('chunks when command count exceeds 30000 and delivers every command', async () => {
			// N+3 (self HTL + userTimeline + localTimeline) > 30000 with plain 1-cmd pushes
			const followerCount = 30_001;
			const { redis, pushToTl, note, user, fanoutTimelineService } = createHarness(Service, { followerCount });

			await expect(pushToTl(note, user)).resolves.toBeUndefined();

			expect(redis.execCalls).toBeGreaterThan(1);
			expect(redis.execSizes.every(size => size <= FANOUT_PIPELINE_CHUNK_SIZE)).toBe(true);
			expect(redis.execSizes.reduce((a, b) => a + b, 0)).toBe(redis.allCommands.length);
			// followers + self home + userTimeline + localTimeline
			expect(fanoutTimelineService.push).toHaveBeenCalledTimes(followerCount + 3);
			expect(redis.allCommands).toHaveLength(followerCount + 3);
			expect(redis.allCommands.every(([cmd]) => cmd === 'lpush')).toBe(true);
		});

		test('keeps a single exec for small fanout', async () => {
			const followerCount = 10;
			const { redis, pushToTl, note, user } = createHarness(Service, { followerCount });

			await expect(pushToTl(note, user)).resolves.toBeUndefined();

			// flush() recreates an empty pipeline after a successful exec; only one exec runs.
			expect(redis.execCalls).toBe(1);
			expect(redis.execSizes).toEqual([followerCount + 3]);
		});

		test('skips exec when pipeline stays empty', async () => {
			const { redis, pushToTl, note, user, fanoutTimelineService } = createHarness(Service, {
				followerCount: 1,
				noopPush: true,
			});

			await expect(pushToTl(note, user)).resolves.toBeUndefined();

			expect(fanoutTimelineService.push).toHaveBeenCalled();
			expect(redis.execCalls).toBe(0);
			expect(redis.pipelineCreations).toBe(1);
		});

		test('propagates first-chunk exec failure and runs no later chunks', async () => {
			const followerCount = 30_001;
			const { redis, pushToTl, note, user } = createHarness(Service, {
				followerCount,
				failOnExecCall: 1,
			});

			await expect(pushToTl(note, user)).rejects.toThrow('forced exec failure #1');
			expect(redis.execCalls).toBe(1);
			// one initial pipeline; failure prevents further pipeline() after flush
			expect(redis.pipelineCreations).toBe(1);
		});

		test('propagates middle-chunk exec failure and does not run later chunks', async () => {
			const followerCount = 60_001; // needs at least 3 chunks of 30k
			const { redis, pushToTl, note, user } = createHarness(Service, {
				followerCount,
				failOnExecCall: 2,
			});

			await expect(pushToTl(note, user)).rejects.toThrow('forced exec failure #2');
			expect(redis.execCalls).toBe(2);
			expect(redis.execSizes).toEqual([FANOUT_PIPELINE_CHUNK_SIZE]); // only first succeeded
			// pipelines: initial + after first flush; second exec fails before third pipeline
			expect(redis.pipelineCreations).toBe(2);
		});

		test('propagates final-chunk exec failure after prior chunks succeed', async () => {
			const followerCount = 30_001;
			const { redis, pushToTl, note, user } = createHarness(Service, {
				followerCount,
				failOnExecCall: 2,
			});

			await expect(pushToTl(note, user)).rejects.toThrow('forced exec failure #2');
			expect(redis.execCalls).toBe(2);
			expect(redis.execSizes).toEqual([FANOUT_PIPELINE_CHUNK_SIZE]);
			expect(redis.pipelineCreations).toBe(2);
		});

		test('chunks channel fanout by command count including file timeline doubles', async () => {
			const channelFollowerCount = 15_001; // 2 base + 15001*2 home(+files) = 30004 cmds
			const { redis, pushToTl, note, user, fanoutTimelineService } = createHarness(Service, {
				channelFollowerCount,
				channelId: 'channel1',
				fileIds: ['file1'],
			});

			await expect(pushToTl(note, user)).resolves.toBeUndefined();

			expect(redis.execCalls).toBeGreaterThan(1);
			expect(redis.execSizes.every(size => size <= FANOUT_PIPELINE_CHUNK_SIZE)).toBe(true);
			// channelTimeline + userTimelineWithChannel + per follower home + homeWithFiles
			expect(fanoutTimelineService.push).toHaveBeenCalledTimes(2 + channelFollowerCount * 2);
			expect(redis.allCommands).toHaveLength(2 + channelFollowerCount * 2);
		});
	});

	test('size-limit mock rejects an unchunked oversized single exec', async () => {
		// Documents pre-fix behavior: one pipeline holding >30k commands fails on exec.
		const redis = createSizeLimitedRedis({ maxCommands: FANOUT_PIPELINE_CHUNK_SIZE });
		const pipeline = redis.redisForTimelines.pipeline();
		for (let i = 0; i < FANOUT_PIPELINE_CHUNK_SIZE + 1; i++) {
			pipeline.lpush(`list:homeTimeline:f${i}`, 'note1');
		}
		await expect(pipeline.exec()).rejects.toThrow(/pipeline too large/);
	});
});
