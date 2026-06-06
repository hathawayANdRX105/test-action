/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';

export type FanoutTimelineName = (
	// home timeline
	| `homeTimeline:${string}`
	| `homeTimelineWithFiles:${string}` // only notes with files are included
	// local timeline
	| `localTimeline` // replies are not included
	| `localTimelineWithFiles` // only non-reply notes with files are included
	| `localTimelineWithReplies` // only replies are included
	| `localTimelineWithReplyTo:${string}` // Only replies to specific local user are included. Parameter is reply user id.

	// antenna
	| `antennaTimeline:${string}`

	// user timeline
	| `userTimeline:${string}` // replies are not included
	| `userTimelineWithFiles:${string}` // only non-reply notes with files are included
	| `userTimelineWithReplies:${string}` // only replies are included
	| `userTimelineWithChannel:${string}` // only channel notes are included, replies are included

	// user list timelines
	| `userListTimeline:${string}`
	| `userListTimelineWithFiles:${string}` // only notes with files are included

	// channel timelines
	| `channelTimeline:${string}` // replies are included

	// role timelines
	| `roleTimeline:${string}` // any notes are included
);

const DEFAULT_TIMELINE_READ_LIMIT = 100;
const TIMELINE_SCAN_CHUNK_SIZE = 200;

@Injectable()
export class FanoutTimelineService {
	constructor(
		@Inject(DI.redisForTimelines)
		private redisForTimelines: Redis.Redis,

		private idService: IdService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async push(tl: FanoutTimelineName, id: string, maxlen: number, pipeline: Redis.ChainableCommander) {
		const createdAt = this.idService.parse(id).date.getTime();

		// リモートから遅れて届いた(もしくは後から追加された)投稿日時が古い投稿が追加されるとページネーション時に問題を引き起こすため、
		// 3分以内に投稿されたものでない場合、Redisにある最古のIDより新しい場合のみ追加する
		if (createdAt > this.timeService.now - 1000 * 60 * 3) {
			pipeline.lpush('list:' + tl, id);

			// TODO this needs a platform service for mocking
			if (Math.random() < 0.1) { // 10%の確率でトリム
				pipeline.ltrim('list:' + tl, 0, maxlen - 1);
			}
		} else {
			// 末尾のIDを取得
			const lastId = await this.redisForTimelines.lindex('list:' + tl, -1);
			{
				if (lastId == null || (createdAt > this.idService.parse(lastId).date.getTime())) {
					pipeline.lpush('list:' + tl, id);
				}
			}
		}
	}

	@bindThis
	public get(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null, limit = DEFAULT_TIMELINE_READ_LIMIT) {
		return this.getWindowed(name, untilId, sinceId, limit);
	}

	@bindThis
	public getMulti(name: FanoutTimelineName[], untilId?: string | null, sinceId?: string | null, limit = DEFAULT_TIMELINE_READ_LIMIT): Promise<string[][]> {
		return Promise.all(name.map(n => this.getWindowed(n, untilId, sinceId, limit)));
	}

	private async getWindowed(name: FanoutTimelineName, untilId?: string | null, sinceId?: string | null, limit = DEFAULT_TIMELINE_READ_LIMIT): Promise<string[]> {
		const normalizedLimit = Math.max(1, Math.trunc(limit));
		const listKey = 'list:' + name;
		if (sinceId != null && untilId == null) {
			return this.getSinceWindow(listKey, sinceId, normalizedLimit);
		}

		return this.getDescendingWindow(listKey, untilId, sinceId, normalizedLimit);
	}

	private async getSinceWindow(listKey: string, sinceId: string, limit: number): Promise<string[]> {
		const length = await this.redisForTimelines.llen(listKey);
		if (length <= 0) return [];

		const boundary = await this.findFirstIndexWhere(listKey, length, id => id <= sinceId);
		if (boundary <= 0) return [];

		const start = Math.max(0, boundary - limit);
		const ids = await this.redisForTimelines.lrange(listKey, start, boundary - 1);
		return ids
			.filter(id => id > sinceId)
			.sort((a, b) => a < b ? -1 : 1);
	}

	private async getDescendingWindow(listKey: string, untilId: string | null | undefined, sinceId: string | null | undefined, limit: number): Promise<string[]> {
		const length = untilId == null ? null : await this.redisForTimelines.llen(listKey);
		let offset = 0;
		if (untilId != null) {
			if (length == null || length <= 0) return [];
			offset = await this.findFirstIndexWhere(listKey, length, id => id < untilId);
		}

		const results: string[] = [];
		const seen = new Set<string>();

		for (; results.length < limit; offset += TIMELINE_SCAN_CHUNK_SIZE) {
			const ids = await this.redisForTimelines.lrange(listKey, offset, offset + TIMELINE_SCAN_CHUNK_SIZE - 1);
			if (ids.length === 0) break;

			for (const id of ids) {
				if (untilId != null && id >= untilId) continue;
				if (sinceId != null && id <= sinceId) {
					break;
				}
				if (seen.has(id)) continue;

				seen.add(id);
				results.push(id);
				if (results.length >= limit) break;
			}

			if (ids.length < TIMELINE_SCAN_CHUNK_SIZE) break;
		}

		return results;
	}

	private async findFirstIndexWhere(listKey: string, length: number, predicate: (id: string) => boolean): Promise<number> {
		let low = 0;
		let high = length;

		while (low < high) {
			const middle = Math.floor((low + high) / 2);
			const id = await this.redisForTimelines.lindex(listKey, middle);
			if (id == null || predicate(id)) {
				high = middle;
			} else {
				low = middle + 1;
			}
		}

		return low;
	}

	@bindThis
	public purge(name: FanoutTimelineName) {
		return this.redisForTimelines.del('list:' + name);
	}
}
