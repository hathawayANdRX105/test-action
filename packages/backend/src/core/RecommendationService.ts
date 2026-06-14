/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { ChannelFollowingsRepository, FollowingsRepository, MiNote, MutingsRepository, NoteRecommendationsRepository, NotesRepository } from '@/models/_.js';
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
	// Minutes since this note was last delivered to THIS user in a recommended
	// response (null = never delivered in the retained window). Drives the
	// time-recovering de-duplication: recently delivered → strong demotion that
	// fades as the note ages out, so good content can return much later.
	deliveredMinutesAgo: number | null;
};

const INTEREST_TTL = 1000 * 60 * 60 * 24 * 30;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const EXPOSURE_TTL_SECONDS = 60 * 60 * 24 * 7;
// Per-user "already delivered" set retention. After this, a note may be
// recommended to the same user again (time-recovering de-dup).
const DELIVERED_TTL_SECONDS = 60 * 60 * 12;
const DELIVERED_MAX_ITEMS = 600;
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

		@Inject(DI.noteRecommendationsRepository)
		private noteRecommendationsRepository: NoteRecommendationsRepository,

		private readonly timeService: TimeService,
	) {
	}

	/** 候補ノートの管理者上書き(ピン留め・スコア調整)をまとめて取得 */
	@bindThis
	public async getNoteOverrides(noteIds: string[]): Promise<Map<string, { pinned: boolean; scoreBoost: number }>> {
		const result = new Map<string, { pinned: boolean; scoreBoost: number }>();
		if (noteIds.length === 0) return result;
		const rows = await this.noteRecommendationsRepository.findBy({ noteId: In(noteIds) });
		for (const row of rows) {
			result.set(row.noteId, { pinned: row.pinned, scoreBoost: row.scoreBoost });
		}
		return result;
	}

	/** ホーム推薦の最上部に固定する投稿ID(新しくピン留めした順) */
	@bindThis
	public async getPinnedNoteIds(): Promise<string[]> {
		const rows = await this.noteRecommendationsRepository.find({
			select: { noteId: true, pinnedAt: true },
			where: { pinned: true },
			order: { pinnedAt: 'DESC' },
			take: 100,
		});
		return rows.map(row => row.noteId);
	}

	/** 単一投稿の上書き設定を取得 */
	@bindThis
	public async getNoteOverride(noteId: string): Promise<{ pinned: boolean; scoreBoost: number } | null> {
		const row = await this.noteRecommendationsRepository.findOneBy({ noteId });
		return row == null ? null : { pinned: row.pinned, scoreBoost: row.scoreBoost };
	}

	/** 管理者による上書き設定の更新(行が無ければ作成、ピンもブーストも無ければ削除) */
	@bindThis
	public async setNoteOverride(noteId: string, params: { pinned?: boolean; scoreBoost?: number }, adminId: string): Promise<void> {
		const existing = await this.noteRecommendationsRepository.findOneBy({ noteId });
		const pinned = params.pinned ?? existing?.pinned ?? false;
		const scoreBoost = params.scoreBoost ?? existing?.scoreBoost ?? 0;

		// 設定が無効化(ピン無し・ブースト0)されたら行を削除して掃除する
		if (!pinned && scoreBoost === 0) {
			if (existing != null) await this.noteRecommendationsRepository.delete({ noteId });
			return;
		}

		const now = new Date(this.timeService.now);
		const pinnedAt = pinned ? (existing?.pinned ? existing.pinnedAt : now) : null;
		if (existing == null) {
			await this.noteRecommendationsRepository.insert({ noteId, pinned, pinnedAt, scoreBoost, updatedAt: now, updatedBy: adminId });
		} else {
			await this.noteRecommendationsRepository.update({ noteId }, { pinned, pinnedAt, scoreBoost, updatedAt: now, updatedBy: adminId });
		}
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
	 * Record that a batch of notes was delivered to a user in a recommended
	 * response. This drives per-user de-duplication: we stamp each note in a
	 * per-user "delivered" zset (score = delivery time), so the next request can
	 * demote things this user just saw — a demotion that fades as the stamp ages
	 * out of the retention window, letting good content return much later.
	 *
	 * We deliberately DO NOT keep using a global cumulative exposure counter as a
	 * ranking divisor: on a busy instance it inflates ~100x faster than real
	 * engagement (double-counted across every delivery + impression), which
	 * collapsed every note's engagement-rate to ~0 and buried genuinely hot new
	 * posts. Ranking now uses time-decayed hotness instead (see rankCandidates).
	 * Fire-and-forget.
	 */
	@bindThis
	public recordDelivery(userId: string | null, noteIds: string[], now: number): void {
		if (noteIds.length === 0) return;
		const pipeline = this.redisClient.pipeline();
		// Lightweight global tally kept for stats/debugging only (NOT a rate divisor).
		for (const noteId of noteIds) {
			pipeline.zincrby(EXPOSURE_KEY, 1, noteId);
		}
		pipeline.expire(EXPOSURE_KEY, EXPOSURE_TTL_SECONDS, 'NX');
		if (userId != null) {
			const deliveredKey = `recommendation:delivered:${userId}`;
			for (const noteId of noteIds) {
				pipeline.zadd(deliveredKey, now, noteId);
			}
			pipeline.expire(deliveredKey, DELIVERED_TTL_SECONDS);
			// Trim oldest entries so the set can't grow unbounded.
			pipeline.zremrangebyrank(deliveredKey, 0, -(DELIVERED_MAX_ITEMS + 1));
		}
		pipeline.exec().catch(() => { /* best-effort, never block the response */ });
	}

	@bindThis
	public async getNoteExposureCounts(noteIds: string[]): Promise<Map<string, number>> {
		if (noteIds.length === 0) return new Map();

		const scores = await this.redisClient.zmscore(EXPOSURE_KEY, ...noteIds);
		return new Map(noteIds.map((noteId, i) => {
			const count = Number(scores[i] ?? 0);
			return [noteId, Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0];
		}));
	}

	@bindThis
	public async getUserSignals(userId: string | null, notes: MiNote[], now = 0, seed = 0): Promise<Map<string, RecommendationSignal>> {
		const result = new Map<string, RecommendationSignal>();
		if (notes.length === 0) return result;

		const nowMs = now > 0 ? now : 0;
		const ids = notes.map(note => note.id);
		const [hotScores, exposureScores] = await Promise.all([
			this.redisClient.zmscore(HOT_KEY, ...ids),
			this.redisClient.zmscore(EXPOSURE_KEY, ...ids),
		]);
		if (userId == null) {
			// Anonymous: per-request variation comes from a seed mixed into the
			// exploration hash; vary the bucket by note id only (no user/delivery).
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
					explorationScore: this.getExplorationScore(notes[i].id, userId, seed),
					deliveredMinutesAgo: null,
				});
			}
			return result;
		}

		// Per-user delivery timestamps for time-recovering de-duplication.
		const deliveredScores = await this.redisClient.zmscore(`recommendation:delivered:${userId}`, ...ids);

		const [followingAuthorIds, followingChannelIds, mutedAuthorIds] = await Promise.all([
			this.getFollowingAuthorIds(userId),
			this.getFollowingChannelIds(userId),
			this.getMutedAuthorIds(userId),
		]);
		const pipeline = this.redisClient.pipeline();
		const primaryKeywords = notes.map(note => this.getPrimaryKeyword(note) ?? '');
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			pipeline.zscore(`recommendation:profile:${userId}:authors`, note.userId);
			pipeline.zscore(`recommendation:profile:${userId}:channels`, note.channelId ?? '');
			pipeline.zscore(`recommendation:profile:${userId}:keywords`, primaryKeywords[i]);
			pipeline.zscore(`recommendation:profile:${userId}:events`, note.id);
			pipeline.zscore(`recommendation:negative:${userId}:authors`, note.userId);
			pipeline.zscore(`recommendation:negative:${userId}:keywords`, primaryKeywords[i]);
			pipeline.exists(`recommendation:seen:${userId}:${note.id}`);
		}
		const rows = await pipeline.exec();
		for (let i = 0; i < notes.length; i++) {
			const note = notes[i];
			result.set(note.id, {
				authorScore: String(rows?.[i * 7]?.[1] ?? '0'),
				channelScore: String(rows?.[i * 7 + 1]?.[1] ?? '0'),
				keywordScore: String(rows?.[i * 7 + 2]?.[1] ?? '0'),
				eventScore: String(rows?.[i * 7 + 3]?.[1] ?? '0'),
				socialAuthorScore: followingAuthorIds.has(note.userId) ? 12 : mutedAuthorIds.has(note.userId) ? -36 : 0,
				socialChannelScore: note.channelId != null && followingChannelIds.has(note.channelId) ? 10 : 0,
				negativeAuthorScore: String(rows?.[i * 7 + 4]?.[1] ?? '0'),
				negativeKeywordScore: String(rows?.[i * 7 + 5]?.[1] ?? '0'),
				hotScore: String(hotScores[i] ?? '0'),
				exposureCount: Number(exposureScores[i] ?? 0),
				seen: Number(rows?.[i * 7 + 6]?.[1] ?? 0) > 0,
				explorationScore: this.getExplorationScore(note.id, userId, seed),
				deliveredMinutesAgo: this.minutesSince(deliveredScores[i], nowMs),
			});
		}
		return result;
	}

	private minutesSince(stamp: string | number | null | undefined, nowMs: number): number | null {
		if (stamp == null || nowMs <= 0) return null;
		const t = Number(stamp);
		if (!Number.isFinite(t) || t <= 0) return null;
		return Math.max(0, (nowMs - t) / (1000 * 60));
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
		for (const tag of note.tags) {
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

	private getExplorationScore(noteId: string, userId: string | null, seed = 0): number {
		// Per-request shuffle: mix in a caller-supplied seed and a fine (5-min)
		// time bucket so consecutive refreshes reorder the exploration picks,
		// instead of being identical for a whole hour (the old behaviour that
		// made the feed feel static/repetitive).
		const bucket = Math.floor(this.timeService.now / (1000 * 60 * 5));
		const key = `${noteId}:${userId ?? 'anon'}:${bucket}:${seed}`;
		let hash = 2166136261;
		for (let i = 0; i < key.length; i++) {
			hash ^= key.charCodeAt(i);
			hash = Math.imul(hash, 16777619);
		}
		return ((hash >>> 0) % 1000) / 1000;
	}
}
