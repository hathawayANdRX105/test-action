/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserService } from '@/core/UserService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { RecommendationService } from '@/core/RecommendationService.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

const scopeValues = ['local', 'social', 'global', 'mixed'] as const;
type RecommendationScope = typeof scopeValues[number];
const surfaceValues = ['home', 'explore'] as const;
const categoryValues = ['forYou', 'trending', 'messages', 'sports', 'entertainment', 'tutorials', 'resources'] as const;
const sortValues = ['personalized', 'latestReply'] as const;
const rankModeValues = ['personalized', 'trending'] as const;
type RecommendationSurface = typeof surfaceValues[number];
type RecommendationCategory = typeof categoryValues[number];
type RecommendationSort = typeof sortValues[number];
type RecommendationRankMode = typeof rankModeValues[number];
const CANDIDATE_WINDOW = 1000 * 60 * 60 * 24 * 14;
const LOW_VALUE_TAGS = ['签到', '打卡', '水贴'];
const QUALITY_TAGS = ['教程', 'ai', 'AI', '资源', '公告', 'Bug', 'bug'];
const EXPLORE_SLOT_RATIO = 0.26;
// Traffic-pool / engagement-rate tuning.
const EXPOSURE_FLOOR = 12; // min divisor so a note still in its initial pool doesn't blow up its rate
const COLD_START_POOL = 120; // exposures below this still receive a guaranteed-delivery boost
const COLD_START_BOOST = 26; // strength of the cold-start boost at zero exposure (decays to 0 at COLD_START_POOL)
const RATE_WEIGHT = 28; // weight applied to engagement rate in the final score
const STARVED_RATE_THRESHOLD = 0.05; // below this rate after a fair shot, a note is treated as low-value (灌水)
const FRESH_POOL_MULTIPLIER = 10;

export const meta = {
	tags: ['notes'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		ltlDisabled: {
			message: 'Local timeline has been disabled.',
			code: 'LTL_DISABLED',
			id: '45a6eb02-7695-4393-b023-dd3be9aaaefd',
		},
		gtlDisabled: {
			message: 'Global timeline has been disabled.',
			code: 'GTL_DISABLED',
			id: '0332fc13-6ab2-4427-ae80-a9fadffd1a6b',
		},
	},

	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		scope: { type: 'string', enum: scopeValues, default: 'mixed' },
		surface: { type: 'string', enum: surfaceValues, default: 'home' },
		category: { type: 'string', enum: categoryValues, default: 'forYou' },
		sort: { type: 'string', enum: sortValues, default: 'personalized' },
		rankMode: { type: 'string', enum: rankModeValues, default: 'personalized' },
		withFiles: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withBots: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', minimum: 0, maximum: 1000, default: 0 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private idService: IdService,
		private userService: UserService,
		private recommendationService: RecommendationService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const policies = await this.roleService.getUserPolicies(me ? me.id : null);
			if (['local', 'social', 'mixed'].includes(ps.scope) && !policies.ltlAvailable) {
				throw new ApiError(meta.errors.ltlDisabled);
			}
			if (['global', 'mixed'].includes(ps.scope) && !policies.gtlAvailable) {
				throw new ApiError(meta.errors.gtlDisabled);
			}

			if (me) {
				this.userService.markUserActive(me);
			}

			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate) : null);
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate) : null);
			const rankingSinceId = this.idService.gen(this.timeService.now - CANDIDATE_WINDOW);
			const floorSinceId = sinceId && sinceId > rankingSinceId ? sinceId : rankingSinceId;

			const query = this.notesRepository.createQueryBuilder('note')
				.andWhere('note.id > :rankingSinceId', { rankingSinceId: floorSinceId })
				.andWhere('note.visibility = \'public\'')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel');

			if (untilId) query.andWhere('note.id < :untilId', { untilId });
			if (sinceId) query.andWhere('note.id > :sinceId', { sinceId });

			this.applyScope(query, ps.scope as RecommendationScope, me?.id ?? null);
			this.queryService.generateExcludedRepliesQueryForNotes(query, me);
			this.queryService.generateVisibilityQuery(query, me);
			this.queryService.generateReplyTargetVisibilityQuery(query, me);
			this.queryService.generateBlockedHostQueryForNote(query);
			this.queryService.generateSuspendedUserQueryForNote(query);
			this.queryService.generateSilencedUserQueryForNotes(query, me);
			if (me) {
				this.queryService.generateMutedUserQueryForNotes(query, me);
				this.queryService.generateBlockedUserQueryForNotes(query, me);
				this.queryService.generateMutedNoteThreadQuery(query, me);
			}

			if (ps.withFiles) {
				query.andWhere('note.fileIds != \'{}\'');
			}

			if (!ps.withBots) query.andWhere('user.isBot = FALSE');

			if (!ps.withRenotes) {
				this.queryService.generateExcludedRenotesQueryForNotes(query);
			} else if (me) {
				this.queryService.generateMutedUserRenotesQueryForNotes(query, me);
			}

			const surface = ps.surface as RecommendationSurface;
			const category = ps.category as RecommendationCategory;
			const sort = ps.sort as RecommendationSort;
			const rankMode = ps.rankMode as RecommendationRankMode;
			this.applyCategory(query, category);
			const recommendationLimit = Math.min(ps.limit * (sort === 'latestReply' ? 12 : surface === 'explore' ? 12 : 14), 420);

			query
				.addSelect(`
					(
						(
							LEAST(
								COALESCE((
									SELECT SUM((value)::int)
									FROM jsonb_each_text(note.reactions)
								), 0),
								40
							) * 3 +
							LEAST(note."renoteCount", 30) * 4 +
							LEAST(note."repliesCount", 30) * 5 +
							LEAST(note."clippedCount", 20) * 5 +
							LEAST("user"."followersCount", 5000) / 500
						)
						* CASE
							WHEN note.id > :fresh24hId THEN 1.4
							WHEN note.id > :fresh3dId THEN 1
							WHEN note.id > :fresh7dId THEN 0.65
							ELSE 0.35
						END
						+ CASE WHEN note."fileIds" != '{}' THEN 6 ELSE 0 END
						+ CASE WHEN note."channelId" IS NOT NULL THEN :channelBoost ELSE 0 END
						+ CASE WHEN channel."isSensitive" = TRUE THEN -18 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:qualityTags AS varchar[]) THEN 14 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(教程|指南|配置|部署|使用方法|怎么|如何|说明|公告|更新|修复|bug|问题|讨论|ai|claude|codex)' THEN 14 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(token|key|资源)' AND LOWER(COALESCE(note.text, '')) ~ '(教程|指南|配置|部署|使用方法|说明|讨论|问题|怎么|如何)' THEN 10 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(邀请|注册送|注册送|倍率|白嫖|来蹬|轻蹬|随便用|限时密钥|限时 key|私key|私 key)' THEN -18 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:keyTags AS varchar[]) AND LOWER(COALESCE(note.text, '')) !~ '(教程|指南|配置|部署|使用方法|说明|讨论|问题|怎么|如何)' THEN -16 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:bugTags AS varchar[]) AND note."fileIds" = '{}' AND note."repliesCount" < 2 THEN -9 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(tp-[a-z0-9_-]{16,}|api[_ -]?key|密钥)' THEN -18 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(sk-[a-z0-9_-]{12,})' THEN -10 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '^(sk-[a-z0-9_-]+\\s*)+$' THEN -26 ELSE 0 END
						+ CASE WHEN note."renoteId" IS NOT NULL AND note.text IS NULL THEN -8 ELSE 0 END
						+ CASE WHEN LENGTH(COALESCE(note.text, '')) < 8 THEN -9 ELSE 0 END
						+ CASE WHEN LENGTH(COALESCE(note.text, '')) < 20 THEN -7 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:lowValueTags AS varchar[]) THEN -14 ELSE 0 END
						+ CASE WHEN COALESCE(note.text, '') LIKE '%签到%' AND LENGTH(COALESCE(note.text, '')) < 40 THEN -14 ELSE 0 END
						+ CASE WHEN COALESCE(note.text, '') LIKE '%打卡%' AND LENGTH(COALESCE(note.text, '')) < 40 THEN -10 ELSE 0 END
					)
				`, 'recommendation_score')
				.setParameter('lowValueTags', LOW_VALUE_TAGS)
				.setParameter('qualityTags', QUALITY_TAGS)
				.setParameter('keyTags', ['Key', 'key', 'Token', 'token'])
				.setParameter('bugTags', ['Bug', 'bug'])
				.setParameter('channelBoost', surface === 'explore' ? 10 : 7)
				.setParameter('fresh24hId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24))
				.setParameter('fresh3dId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 3))
				.setParameter('fresh7dId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 7));

			let candidates: Awaited<ReturnType<typeof query.getMany>>;
			if (sort === 'latestReply') {
				candidates = await query
					.addSelect(`
						COALESCE((
							SELECT reply_sort.id
							FROM note reply_sort
							WHERE reply_sort."replyId" = note.id
								AND reply_sort.visibility = 'public'
							ORDER BY reply_sort.id DESC
							LIMIT 1
						), note.id)
					`, 'latest_reply_sort_id')
					.orderBy('latest_reply_sort_id', 'DESC')
					.addOrderBy('note.id', 'DESC')
					.offset(ps.offset)
					.limit(recommendationLimit)
					.getMany();
			} else {
				// Two-path candidate set: the top-scored notes PLUS the freshest notes,
				// merged by id. The fresh path guarantees zero-engagement new posts enter
				// the traffic pool instead of being crowded out by already-popular notes.
				const scoredQuery = query.clone()
					.orderBy('recommendation_score', 'DESC')
					.addOrderBy('note.id', 'DESC')
					.offset(ps.offset)
					.limit(recommendationLimit);
				const freshQuery = query.clone()
					.orderBy('note.id', 'DESC')
					.limit(Math.min(Math.ceil(ps.limit * FRESH_POOL_MULTIPLIER), 220));
				const underExposedQuery = query.clone()
					.orderBy('note.id', 'DESC')
					.limit(Math.min(Math.ceil(ps.limit * 12), 260));
				const [scored, fresh, underExposed] = await Promise.all([scoredQuery.getMany(), freshQuery.getMany(), underExposedQuery.getMany()]);
				const merged = new Map<string, typeof scored[number]>();
				for (const note of scored) merged.set(note.id, note);
				for (const note of fresh) merged.set(note.id, note);
				for (const note of underExposed) merged.set(note.id, note);
				candidates = [...merged.values()];
			}

			const signals = await this.recommendationService.getUserSignals(me?.id ?? null, candidates);
			const effectiveRankMode = category === 'trending' ? 'trending' : rankMode;
			const notes = this.diversify(this.rankCandidates(candidates, signals, category, sort, effectiveRankMode), ps.limit);
			// Record delivery so engagement can be divided by exposure next time round.
			this.recommendationService.recordExposure(notes.map(note => note.id));
			return await this.noteEntityService.packMany(notes, me);
		});
	}

	private applyScope(query: ReturnType<NotesRepository['createQueryBuilder']>, scope: RecommendationScope, meId: string | null): void {
		if (scope === 'local') {
			query.andWhere('note.userHost IS NULL');
			return;
		}

		if (scope === 'global') {
			query.andWhere('note.userHost IS NOT NULL');
			query.andWhere('note.channelId IS NULL');
			return;
		}

		if (scope === 'social' && meId != null) {
			query
				.andWhere(new Brackets(qb => this.queryService
					.orFollowingUser(qb, ':meId', 'note.userId')
					.orWhere(':meId = note.userId')
					.orWhere(new Brackets(qbb => qbb
						.andWhere('note.userHost IS NULL')
						.andWhere('note.channelId IS NULL')))))
				.andWhere(new Brackets(qb => this.queryService
					.orFollowingChannel(qb, ':meId', 'note.channelId')
					.orWhere('note.channelId IS NULL')));
			query.setParameters({ meId });
			return;
		}

		if (scope === 'social') {
			query.andWhere('note.userHost IS NULL');
			return;
		}

		query.andWhere(new Brackets(qb => {
			qb.orWhere('note.userHost IS NULL');
			qb.orWhere(new Brackets(qbb => qbb
				.andWhere('note.userHost IS NOT NULL')
				.andWhere('note.channelId IS NULL')));
		}));
	}

	private applyCategory(query: ReturnType<NotesRepository['createQueryBuilder']>, category: RecommendationCategory): void {
		if (category === 'tutorials') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:categoryTutorialTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryTutorialPattern');
			}));
			query.setParameter('categoryTutorialTags', ['教程', 'AI', 'ai', 'Token', 'token', 'Key', 'key', '资源']);
			query.setParameter('categoryTutorialPattern', '教程|指南|配置|部署|api|claude|codex|ai|token|key|资源');
		} else if (category === 'resources') {
			query.andWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryResourcePattern');
			query.setParameter('categoryResourcePattern', 'key|token|api|claude|codex|资源|网盘|链接|下载');
		} else if (category === 'messages') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note."repliesCount" > 0');
				qb.orWhere('note.tags && CAST(:categoryMessageTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryMessagePattern');
			}));
			query.setParameter('categoryMessageTags', ['公告', 'Bug', 'bug', '讨论', '问题', '更新', '社区']);
			query.setParameter('categoryMessagePattern', '公告|讨论|问题|bug|更新|社区|通知|反馈|announcement|discussion|issue|update|community|notice|feedback');
		} else if (category === 'sports') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:categorySportsTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categorySportsPattern');
			}));
			query.setParameter('categorySportsTags', ['运动', '体育', '赛事', '比赛', '球队', '足球', '篮球', '网球', '跑步', '健身', 'Sports', 'sports']);
			query.setParameter('categorySportsPattern', '运动|体育|赛事|比赛|球队|足球|篮球|网球|跑步|健身|训练|sports?|football|basketball|tennis|fitness|workout|match|game|team');
		} else if (category === 'entertainment') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:categoryEntertainmentTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryEntertainmentPattern');
			}));
			query.setParameter('categoryEntertainmentTags', ['娱乐', '电影', '音乐', '游戏', '动漫', '动画', '漫画', '综艺', '追剧', '明星', 'Entertainment', 'entertainment']);
			query.setParameter('categoryEntertainmentPattern', '娱乐|电影|音乐|游戏|动漫|动画|漫画|综艺|追剧|明星|剧集|影院|演唱会|movie|film|music|game|anime|comic|show|entertainment|concert');
		}
	}

	private rankCandidates<T extends { id: string; userId: string; text: string | null; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[]; tags?: string[]; channelId?: string | null }>(
		notes: T[],
		signals: Awaited<ReturnType<RecommendationService['getUserSignals']>>,
		category: RecommendationCategory,
		sort: RecommendationSort,
		rankMode: RecommendationRankMode,
	): T[] {
		return notes
			.map((note, index) => {
				const signal = signals.get(note.id);
				const reactionCount = Object.values(note.reactions ?? {}).reduce((acc, value) => acc + Number(value), 0);
				// Absolute engagement value (capped) — the numerator of the rate.
				const engagementValue =
					Math.min(reactionCount, 40) * 0.6 +
					Math.min(note.renoteCount ?? 0, 30) * 0.8 +
					Math.min(note.repliesCount ?? 0, 30) * 0.9 +
					Math.min(note.clippedCount ?? 0, 20) * 1.1 +
					((note.fileIds?.length ?? 0) > 0 ? 2.5 : 0);
				const hotScore = Math.min(Number(signal?.hotScore ?? 0), 42);
				const exposureCount = Math.max(0, signal?.exposureCount ?? 0);
				// Engagement RATE, not absolute counts: a fresh post with a little
				// engagement from a small audience can outrank an old post with many
				// reactions but huge exposure. This is the core anti-"rich-get-richer" lever.
				const engagementRate = (engagementValue + hotScore * 0.9) / Math.max(exposureCount, EXPOSURE_FLOOR);
				// Traffic-pool guarantee: under-exposed notes get a decaying boost so
				// every new post is delivered to an initial audience before ranking
				// settles. Fades to 0 once the note has been surfaced COLD_START_POOL times.
				const coldStartBoost = exposureCount < COLD_START_POOL
					? COLD_START_BOOST * (1 - exposureCount / COLD_START_POOL)
					: 0;
				const interestScore =
					Math.min(Number(signal?.authorScore ?? 0), 26) * 0.42 +
					Math.min(Number(signal?.channelScore ?? 0), 32) * 0.58 +
					Math.min(Number(signal?.keywordScore ?? 0), 38) * 0.72 +
					Math.min(Number(signal?.eventScore ?? 0), 24) * 0.34;
				const socialScore = (signal?.socialAuthorScore ?? 0) + (signal?.socialChannelScore ?? 0);
				const negativeScore =
					Math.min(Number(signal?.negativeAuthorScore ?? 0), 18) * 1.15 +
					Math.min(Number(signal?.negativeKeywordScore ?? 0), 18) * 0.8;
				const seenPenalty = signal?.seen ? -28 : 0;
				const exploreBoost = (signal?.explorationScore ?? 0) * (rankMode === 'trending' ? 2.2 : 8.5);
				const recencyTieBreak = Math.max(0, notes.length - index) / Math.max(notes.length, 1);
				const personalizedScore = rankMode === 'trending' ? 0 : interestScore + socialScore;
				// Demote notes that have already had a fair shot (plenty of exposure) but
				// almost no engagement — this is where 灌水/low-value posts naturally settle,
				// without relying on hardcoded keyword blacklists.
				const lowValuePenalty = this.getLowValuePenalty(note);
				const starvedPenalty = exposureCount > COLD_START_POOL && engagementRate < STARVED_RATE_THRESHOLD ? -22 : 0;
				const latestReplyBoost = sort === 'latestReply' ? recencyTieBreak * 8 : 0;
				return {
					note,
					score: engagementRate * RATE_WEIGHT + coldStartBoost + personalizedScore + seenPenalty + exploreBoost + latestReplyBoost + recencyTieBreak + starvedPenalty - negativeScore - lowValuePenalty,
					exploreScore: signal?.explorationScore ?? 0,
				};
			})
			.sort((a, b) => b.score - a.score)
			.map(entry => entry.note);
	}

	private diversify<T extends { id: string; userId: string; text: string | null; channelId?: string | null }>(notes: T[], limit: number): T[] {
		const selected: T[] = [];
		const authorCounts = new Map<string, number>();
		const channelCounts = new Map<string, number>();
		const seenText = new Set<string>();
		const exploreSlots = Math.max(1, Math.floor(limit * EXPLORE_SLOT_RATIO));
		const explorationPool = notes.slice(Math.min(limit, notes.length));

		for (const note of notes) {
			const authorCount = authorCounts.get(note.userId) ?? 0;
			if (authorCount >= 2) continue;
			if (note.channelId != null && (channelCounts.get(note.channelId) ?? 0) >= 2) continue;

			const textKey = (note.text ?? '').replace(/\s+/g, '').slice(0, 80);
			if (textKey.length >= 8 && seenText.has(textKey)) continue;

			selected.push(note);
			authorCounts.set(note.userId, authorCount + 1);
			if (note.channelId != null) channelCounts.set(note.channelId, (channelCounts.get(note.channelId) ?? 0) + 1);
			if (textKey.length >= 8) seenText.add(textKey);
			if (selected.length >= limit) break;
		}

		for (const note of notes) {
			if (selected.length >= limit) break;
			if (selected.some(item => item.id === note.id)) continue;
			if ((limit - selected.length) > exploreSlots && selected.length >= Math.max(limit - exploreSlots, 0)) continue;
			selected.push(note);
		}

		return selected;
	}

	private getLowValuePenalty(note: { text: string | null; tags?: string[]; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[] }): number {
		const text = (note.text ?? '').trim();
		const compactText = text.replace(/\s+/g, '');
		const reactionCount = Object.values(note.reactions ?? {}).reduce((acc, value) => acc + Number(value), 0);
		const engagement = reactionCount + (note.repliesCount ?? 0) + (note.renoteCount ?? 0) + (note.clippedCount ?? 0);
		let penalty = 0;
		if (compactText.length < 6 && (note.fileIds?.length ?? 0) === 0) penalty += 28;
		if (compactText.length < 14 && engagement === 0 && (note.fileIds?.length ?? 0) === 0) penalty += 16;
		if (/^(签到|打卡|水|路过|测试|1|11|111|。|，|哈)+$/i.test(compactText)) penalty += 34;
		if ((note.tags ?? []).some(tag => LOW_VALUE_TAGS.includes(tag))) penalty += 18;
		if (/^(.)\1{5,}$/.test(compactText)) penalty += 24;
		return penalty;
	}
}
