/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { ChannelFollowingsRepository, FollowingsRepository, MiNote, MutingsRepository, NotesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { TimeService } from '@/global/TimeService.js';

export const recommendationEventTypes = ['impression', 'click', 'expand', 'dwell', 'react', 'renote', 'reply', 'clip'] as const;
export type RecommendationEventType = typeof recommendationEventTypes[number];

export type RecommendationFeedback = {
	noteId: string;
	event: RecommendationEventType;
	dwellMs?: number;
};

export type RecommendationSignal = {
	authorScore: string;
	channelScore: string;
	keywordScore: string;
	eventScore: string;
	socialAuthorScore: number;
	socialChannelScore: number;
	negativeAuthorScore: string;
	negativeKeywordScore: string;
	hotScore: string;
	exposureCount: number;
	seen: boolean;
	explorationScore: number;
};

const INTEREST_TTL = 1000 * 60 * 60 * 24 * 30;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const EXPOSURE_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_PROFILE_ITEMS = 160;
const EXPOSURE_KEY = 'recommendation:exposure:notes';
const HOT_KEY = 'recommendation:hot:notes';
const LOW_VALUE_TERMS = new Set(['签到', '打卡', '水贴', '路过', '测试']);
const EVENT_WEIGHTS: Record<RecommendationEventType, number> = {
	impression: 0.05,
	click: 1.2,
	expand: 1.6,
	dwell: 0.8,
	react: 3.4,
	renote: 4.2,
	reply: 4.8,
	clip: 5,
};

@Injectable()
export class RecommendationService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.followingsRepository)
		private followingsRepository: FollowingsRepository,

		@Inject(DI.channelFollowingsRepository)
		private channelFollowingsRepository: ChannelFollowingsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async recordFeedback(userId: string | null, feedback: RecommendationFeedback): Promise<void> {
		const note = await this.notesRepository.findOne({
			where: { id: feedback.noteId },
			relations: { user: true, channel: true },
		});
		if (note == null) return;

		const eventScore = this.getEventScore(feedback);
		const aggregateKey = `recommendation:note:${feedback.noteId}:events`;
		const pipeline = this.redisClient.pipeline();
		pipeline.zincrby(HOT_KEY, eventScore, feedback.noteId);
		pipeline.hincrbyfloat(aggregateKey, feedback.event, eventScore);
		pipeline.expire(aggregateKey, EVENT_TTL_SECONDS, 'NX');
		pipeline.expire(HOT_KEY, EVENT_TTL_SECONDS, 'NX');

		// Track how many times this note has actually been surfaced to a viewer.
		// Visibility impressions are the closest proxy to "served to an audience"
		// and feed the traffic-pool / engagement-rate ranking.
		if (feedback.event === 'impression') {
			pipeline.zincrby(EXPOSURE_KEY, 1, feedback.noteId);
			pipeline.expire(EXPOSURE_KEY, EXPOSURE_TTL_SECONDS, 'NX');
		}

		if (userId != null) {
			pipeline.set(`recommendation:seen:${userId}:${feedback.noteId}`, '1', 'EX', SEEN_TTL_SECONDS);
			this.addInterestUpdates(pipeline, userId, note, eventScore, feedback.event);
		}

		await pipeline.exec();
	}

	/**
	 * Record that a batch of notes was served in a recommended response.
	 * This is the "delivery" side of the traffic pool: every note that gets
	 * surfaced accrues exposure, so ranking can divide engagement by exposure
	 * (engagement rate) instead of rewarding absolute counts. Fire-and-forget.
	 */
	@bindThis
	public recordExposure(noteIds: string[]): void {
		if (noteIds.length === 0) return;
		const pipeline = this.redisClient.pipeline();
		for (const noteId of noteIds) {
			pipeline.zincrby(EXPOSURE_KEY, 1, noteId);
		}
		pipeline.expire(EXPOSURE_KEY, EXPOSURE_TTL_SECONDS, 'NX');
		pipeline.exec().catch(() => { /* best-effort, never block the response */ });
	}

	@bindThis
	public async getUserSignals(userId: string | null, notes: MiNote[]): Promise<Map<string, RecommendationSignal>> {
		const result = new Map<string, RecommendationSignal>();
		if (notes.length === 0) return result;

		const ids = notes.map(note => note.id);
		const [hotScores, exposureScores] = await Promise.all([
			this.redisClient.zmscore(HOT_KEY, ...ids),
			this.redisClient.zmscore(EXPOSURE_KEY, ...ids),
		]);
		if (userId == null) {
			for (let i = 0; i < notes.length; i++) {
				result.set(notes[i].id, {
					authorScore: '0',
					channelScore: '0',
					keywordScore: '0',
					eventScore: '0',
					socialAuthorScore: 0,
					socialChannelScore: 0,
					negativeAuthorScore: '0',
					negativeKeywordScore: '0',
					hotScore: String(hotScores[i] ?? '0'),
					exposureCount: Number(exposureScores[i] ?? 0),
					seen: false,
					explorationScore: this.getExplorationScore(notes[i].id, userId),
				});
			}
			return result;
		}

		const [followingAuthorIds, followingChannelIds, mutedAuthorIds] = await Promise.all([
			this.getFollowingAuthorIds(userId),
			this.getFollowingChannelIds(userId),
			this.getMutedAuthorIds(userId),
		]);
		const pipeline = this.redisClient.pipeline();
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			pipeline.zscore(`recommendation:profile:${userId}:authors`, note.userId);
			pipeline.zscore(`recommendation:profile:${userId}:channels`, note.channelId ?? '');
			pipeline.zscore(`recommendation:profile:${userId}:keywords`, this.getPrimaryKeyword(note) ?? '');
			pipeline.zscore(`recommendation:profile:${userId}:events`, note.id);
			pipeline.zscore(`recommendation:negative:${userId}:authors`, note.userId);
			pipeline.zscore(`recommendation:negative:${userId}:keywords`, this.getPrimaryKeyword(note) ?? '');
			pipeline.exists(`recommendation:seen:${userId}:${note.id}`);
		}
		const rows = await pipeline.exec();
		for (let i = 0; i < notes.length; i++) {
			result.set(notes[i].id, {
				authorScore: String(rows?.[i * 7]?.[1] ?? '0'),
				channelScore: String(rows?.[i * 7 + 1]?.[1] ?? '0'),
				keywordScore: String(rows?.[i * 7 + 2]?.[1] ?? '0'),
				eventScore: String(rows?.[i * 7 + 3]?.[1] ?? '0'),
				socialAuthorScore: followingAuthorIds.has(notes[i].userId) ? 12 : mutedAuthorIds.has(notes[i].userId) ? -36 : 0,
				socialChannelScore: notes[i].channelId != null && followingChannelIds.has(notes[i].channelId) ? 10 : 0,
				negativeAuthorScore: String(rows?.[i * 7 + 4]?.[1] ?? '0'),
				negativeKeywordScore: String(rows?.[i * 7 + 5]?.[1] ?? '0'),
				hotScore: String(hotScores[i] ?? '0'),
				exposureCount: Number(exposureScores[i] ?? 0),
				seen: Number(rows?.[i * 7 + 6]?.[1] ?? 0) > 0,
				explorationScore: this.getExplorationScore(notes[i].id, userId),
			});
		}
		return result;
	}

	private addInterestUpdates(pipeline: Redis.ChainableCommander, userId: string, note: MiNote, score: number, event: RecommendationEventType): void {
		if (event === 'impression') return;
		if (event === 'dwell' && score < 0.6) {
			this.bumpInterest(pipeline, `recommendation:negative:${userId}:authors`, note.userId, 0.25);
			for (const keyword of this.extractKeywords(note).slice(0, 4)) {
				this.bumpInterest(pipeline, `recommendation:negative:${userId}:keywords`, keyword, 0.2);
			}
			return;
		}

		this.bumpInterest(pipeline, `recommendation:profile:${userId}:events`, note.id, score);
		this.bumpInterest(pipeline, `recommendation:profile:${userId}:authors`, note.userId, score * 0.55);
		if (note.channelId != null) this.bumpInterest(pipeline, `recommendation:profile:${userId}:channels`, note.channelId, score * 0.8);
		for (const keyword of this.extractKeywords(note)) {
			this.bumpInterest(pipeline, `recommendation:profile:${userId}:keywords`, keyword, score);
		}
	}

	private bumpInterest(pipeline: Redis.ChainableCommander, key: string, member: string, score: number): void {
		if (!member) return;
		pipeline.zincrby(key, score, member);
		pipeline.expire(key, Math.floor(INTEREST_TTL / 1000), 'NX');
		pipeline.zremrangebyrank(key, 0, -(MAX_PROFILE_ITEMS + 1));
	}

	private getEventScore(feedback: RecommendationFeedback): number {
		if (feedback.event !== 'dwell') return EVENT_WEIGHTS[feedback.event];
		if (feedback.dwellMs == null || feedback.dwellMs < 1200) return 0.25;
		if (feedback.dwellMs > 20000) return 2.2;
		return 0.6 + feedback.dwellMs / 10000;
	}

	private async getFollowingAuthorIds(userId: string): Promise<Set<string>> {
		const followings = await this.followingsRepository.find({
			where: { followerId: userId },
			select: { followeeId: true },
			take: 500,
		});
		return new Set(followings.map(following => following.followeeId));
	}

	private async getFollowingChannelIds(userId: string): Promise<Set<string>> {
		const followings = await this.channelFollowingsRepository.find({
			where: { followerId: userId },
			select: { followeeId: true },
			take: 500,
		});
		return new Set(followings.map(following => following.followeeId));
	}

	private async getMutedAuthorIds(userId: string): Promise<Set<string>> {
		const mutings = await this.mutingsRepository.find({
			where: { muterId: userId },
			select: { muteeId: true },
			take: 500,
		});
		return new Set(mutings.map(muting => muting.muteeId));
	}

	private extractKeywords(note: MiNote): string[] {
		const terms = new Set<string>();
		for (const tag of note.tags ?? []) {
			const normalized = this.normalizeTerm(tag);
			if (normalized != null) terms.add(normalized);
		}
		for (const match of `${note.cw ?? ''}\n${note.text ?? ''}`.matchAll(/[\p{Script=Han}]{2,8}|[A-Za-z][A-Za-z0-9_]{2,24}/gu)) {
			const normalized = this.normalizeTerm(match[0]);
			if (normalized != null) terms.add(normalized);
		}
		return [...terms].slice(0, 12);
	}

	private getPrimaryKeyword(note: MiNote): string | null {
		return this.extractKeywords(note)[0] ?? null;
	}

	private normalizeTerm(rawTerm: string): string | null {
		const term = normalizeForSearch(rawTerm.replace(/^#/, '').trim()).slice(0, 40);
		if (term.length < 2) return null;
		if (LOW_VALUE_TERMS.has(term)) return null;
		if (/^https?:\/\//i.test(term)) return null;
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term)) return null;
		return term;
	}

	private getExplorationScore(noteId: string, userId: string | null): number {
		const key = `${noteId}:${userId ?? 'anon'}:${Math.floor(this.timeService.now / (1000 * 60 * 60))}`;
		let hash = 2166136261;
		for (let i = 0; i < key.length; i++) {
			hash ^= key.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return ((hash >>> 0) % 1000) / 1000;
	}
}
