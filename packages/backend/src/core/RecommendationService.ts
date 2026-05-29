/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiNote, NotesRepository } from '@/models/_.js';
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
	seen: boolean;
	explorationScore: number;
};

const INTEREST_TTL = 1000 * 60 * 60 * 24 * 30;
const SEEN_TTL_SECONDS = 60 * 60 * 24 * 14;
const EVENT_TTL_SECONDS = 60 * 60 * 24 * 7;
const MAX_PROFILE_ITEMS = 160;
const LOW_VALUE_TERMS = new Set(['签到', '打卡']);
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
		pipeline.zincrby('recommendation:hot:notes', eventScore, feedback.noteId);
		pipeline.hincrbyfloat(aggregateKey, feedback.event, eventScore);
		pipeline.expire(aggregateKey, EVENT_TTL_SECONDS, 'NX');
		pipeline.expire('recommendation:hot:notes', EVENT_TTL_SECONDS, 'NX');

		if (userId != null) {
			pipeline.set(`recommendation:seen:${userId}:${feedback.noteId}`, '1', 'EX', SEEN_TTL_SECONDS);
			this.addInterestUpdates(pipeline, userId, note, eventScore);
		}

		await pipeline.exec();
	}

	@bindThis
	public async getUserSignals(userId: string | null, notes: MiNote[]): Promise<Map<string, RecommendationSignal>> {
		const result = new Map<string, RecommendationSignal>();
		if (notes.length === 0) return result;

		const ids = notes.map(note => note.id);
		let hotScores: (string | null)[] = [];
		if (userId == null) {
			hotScores = await this.redisClient.zmscore('recommendation:hot:notes', ...ids);
		} else {
			const pipeline = this.redisClient.pipeline();
			for (const note of notes) {
				pipeline.zscore(`recommendation:profile:${userId}:authors`, note.userId);
				pipeline.zscore(`recommendation:profile:${userId}:channels`, note.channelId ?? '');
				pipeline.zscore(`recommendation:profile:${userId}:keywords`, this.getPrimaryKeyword(note) ?? '');
				pipeline.exists(`recommendation:seen:${userId}:${note.id}`);
			}
			const rows = await pipeline.exec();
			for (let i = 0; i < notes.length; i++) {
				result.set(notes[i].id, {
					authorScore: String(rows?.[i * 4]?.[1] ?? '0'),
					channelScore: String(rows?.[i * 4 + 1]?.[1] ?? '0'),
					keywordScore: String(rows?.[i * 4 + 2]?.[1] ?? '0'),
					seen: Number(rows?.[i * 4 + 3]?.[1] ?? 0) > 0,
					explorationScore: this.getExplorationScore(notes[i].id, userId),
				});
			}
			return result;
		}

		for (let i = 0; i < notes.length; i++) {
			result.set(notes[i].id, {
				authorScore: '0',
				channelScore: '0',
				keywordScore: String(hotScores[i] ?? '0'),
				seen: false,
				explorationScore: this.getExplorationScore(notes[i].id, userId),
			});
		}
		return result;
	}

	private addInterestUpdates(pipeline: Redis.ChainableCommander, userId: string, note: MiNote, score: number): void {
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
