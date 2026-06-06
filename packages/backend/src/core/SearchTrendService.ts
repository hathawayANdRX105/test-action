/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { MiMeta, NotesRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { normalizeForSearch } from '@/misc/normalize-for-search.js';
import { UtilityService } from '@/core/UtilityService.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';

export type SearchTrends = {
	popularSearches: string[];
	recentTerms: string[];
	hashtags: string[];
};

const SEARCH_WINDOW_MS = 1000 * 60 * 60;
const SEARCH_WINDOW_TTL_SEC = 60 * 60 * 24 * 3;
const SEARCH_MIN_SCORE = 2;
const POST_TERMS_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
const LOW_VALUE_TERMS = new Set(['签到', '打卡']);

@Injectable()
export class SearchTrendService {
	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.meta)
		private meta: MiMeta,

	@Inject(DI.notesRepository)
	private notesRepository: NotesRepository,

	private idService: IdService,
	private utilityService: UtilityService,
	private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async recordSearchQuery(rawQuery: string): Promise<void> {
		const query = this.normalizeTerm(rawQuery);
		if (query == null) return;

		const currentWindow = this.getCurrentSearchWindow();
		const day = this.getCurrentUtcDay();
		const redisPipeline = this.redisClient.pipeline();
		for (const key of [`searchTrend:hour:${currentWindow}`, `searchTrend:day:${day}`]) {
			redisPipeline.zincrby(key, 1, query);
			redisPipeline.expire(key, SEARCH_WINDOW_TTL_SEC, 'NX');
		}
		await redisPipeline.exec();
	}

	@bindThis
	public async getTrends(limit: number): Promise<SearchTrends> {
		const [popularSearches, recentTerms, hashtags] = await Promise.all([
			this.getPopularSearches(limit),
			this.getRecentContentTerms(limit),
			this.getRecentHashtags(limit),
		]);

		return { popularSearches, recentTerms, hashtags };
	}

	private async getPopularSearches(limit: number): Promise<string[]> {
		const currentWindow = this.getCurrentSearchWindow();
		const previousWindow = currentWindow - 1;
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.zrange(`searchTrend:hour:${currentWindow}`, 0, limit * 4, 'REV', 'WITHSCORES');
		redisPipeline.zrange(`searchTrend:hour:${previousWindow}`, 0, limit * 4, 'REV', 'WITHSCORES');
		redisPipeline.zrange(`searchTrend:day:${this.getCurrentUtcDay()}`, 0, limit * 4, 'REV', 'WITHSCORES');

		const result = await redisPipeline.exec();
		if (result == null) return [];

		const ranking = new Map<string, number>();
		for (const [i, row] of result.entries()) {
			const values = (row[1] ?? []) as string[];
			const weight = i === 0 ? 2 : i === 1 ? 1 : 0.5;
			for (let j = 0; j < values.length; j += 2) {
				const term = values[j];
				const score = Number.parseFloat(values[j + 1] ?? '0') * weight;
				if (score <= 0 || this.normalizeTerm(term) == null) continue;
				ranking.set(term, (ranking.get(term) ?? 0) + score);
			}
		}

		return [...ranking.entries()]
			.filter(([, score]) => score >= SEARCH_MIN_SCORE)
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([term]) => term);
	}

	private async getRecentHashtags(limit: number): Promise<string[]> {
		const notes = await this.notesRepository.createQueryBuilder('note')
			.select(['note.tags'])
			.where('note.id > :sinceId', { sinceId: this.idService.gen(this.timeService.now - POST_TERMS_WINDOW_MS) })
			.andWhere('note.visibility = \'public\'')
			.andWhere('note.userHost IS NULL')
			.andWhere('array_length(note.tags, 1) IS NOT NULL')
			.limit(300)
			.getMany();

		const counts = new Map<string, number>();
		for (const note of notes) {
			for (const rawTag of note.tags ?? []) {
				const tag = this.normalizeTerm(rawTag);
				if (tag == null) continue;
				counts.set(tag, (counts.get(tag) ?? 0) + 1);
			}
		}

		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([term]) => term);
	}

	private async getRecentContentTerms(limit: number): Promise<string[]> {
		const notes = await this.notesRepository.createQueryBuilder('note')
			.select(['note.text', 'note.cw', 'note.tags'])
			.where('note.id > :sinceId', { sinceId: this.idService.gen(this.timeService.now - POST_TERMS_WINDOW_MS) })
			.andWhere('note.visibility = \'public\'')
			.andWhere('note.userHost IS NULL')
			.andWhere('note.text IS NOT NULL')
			.limit(500)
			.getMany();

		const counts = new Map<string, number>();
		for (const note of notes) {
			for (const term of this.extractTerms(`${note.cw ?? ''}\n${note.text ?? ''}`, note.tags ?? [])) {
				counts.set(term, (counts.get(term) ?? 0) + 1);
			}
		}

		return [...counts.entries()]
			.filter(([, count]) => count >= 2)
			.sort((a, b) => b[1] - a[1])
			.slice(0, limit)
			.map(([term]) => term);
	}

	private extractTerms(text: string, tags: string[]): string[] {
		const terms = new Set<string>();
		for (const tag of tags) {
			const normalized = this.normalizeTerm(tag);
			if (normalized != null) terms.add(normalized);
		}

		for (const match of text.matchAll(/[\p{Script=Han}]{2,8}|[A-Za-z][A-Za-z0-9_]{2,24}/gu)) {
			const normalized = this.normalizeTerm(match[0]);
			if (normalized != null) terms.add(normalized);
		}

		return [...terms].slice(0, 12);
	}

	private normalizeTerm(rawTerm: string): string | null {
		const term = normalizeForSearch(rawTerm.replace(/^#/, '').trim()).slice(0, 40);
		if (term.length < 2) return null;
		if (LOW_VALUE_TERMS.has(term)) return null;
		if (/^https?:\/\//i.test(term)) return null;
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(term)) return null;
		if (this.meta.hiddenTags.map(t => normalizeForSearch(t)).includes(term)) return null;
		if (this.utilityService.isKeyWordIncluded(term, this.meta.sensitiveWords)) return null;
		return term;
	}

	private getCurrentSearchWindow(): number {
		return Math.floor(this.timeService.now / SEARCH_WINDOW_MS);
	}

	private getCurrentUtcDay(): string {
		return new Date(this.timeService.now).toISOString().slice(0, 10).replaceAll('-', '');
	}
}
