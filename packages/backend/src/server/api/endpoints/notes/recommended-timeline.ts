/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets, In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { MiNote, NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { UserService } from '@/core/UserService.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { RecommendationService } from '@/core/RecommendationService.js';
import { containsKeyword, deriveSqlTerms, hasAnyTag, type RecommendationConfig } from '@/core/RecommendationConfig.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '../../error.js';

const scopeValues = ['local', 'social', 'global', 'mixed'] as const;
type RecommendationScope = typeof scopeValues[number];
const surfaceValues = ['home', 'explore'] as const;
const categoryValues = ['forYou', 'trending', 'messages', 'sports', 'entertainment', 'games', 'tutorials', 'resources'] as const;
const sortValues = ['personalized', 'latestReply'] as const;
const rankModeValues = ['personalized', 'trending'] as const;
type RecommendationSurface = typeof surfaceValues[number];
type RecommendationCategory = typeof categoryValues[number];
type RecommendationSort = typeof sortValues[number];
type RecommendationRankMode = typeof rankModeValues[number];
const CANDIDATE_WINDOW = 1000 * 60 * 60 * 24 * 7;
// 当 offset 深(用户已经滑过几百条)或者 sort 不是个性化时,把窗口往前延一档,
// 让长尾滚动还能继续吃到数据,而不是 7 天范围吃光后突然"到头"。
const CANDIDATE_WINDOW_DEEP = 1000 * 60 * 60 * 24 * 30;  // 30 天
const CANDIDATE_WINDOW_FALLBACK = 1000 * 60 * 60 * 24 * 180; // 6 个月,真兜底
const FRESH_PRIORITY_HOURS = 48;
const OLD_CONTENT_HOURS = 72;
const OLD_CONTENT_MAX_SCORE = 58;
const LOW_VALUE_CHANNEL_NAME_PATTERN = '^(Key|白嫖|签到|打卡)$';

// 管理者が設定したキーワード配列を Postgres POSIX 正規表現(~ 用)に変換する。
// 正規表現メタ文字はエスケープし、空配列のときはどのテキストにも一致しないセンチネルを返す。
function buildPgKeywordPattern(keywords: string[]): string {
	if (keywords.length === 0) return '__never_match_sentinel_zzqx__';
	return '(' + keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
}
const EXPLORE_SLOT_RATIO = 0.25;
// Time-decayed hotness model (replaces the old exposure-divided engagement rate,
// which collapsed to ~0 because the global exposure counter inflated ~100x faster
// than engagement on a busy instance — burying genuinely hot new posts).
const HOT_HALF_LIFE_HOURS = 12; // engagement+hotness decays by half every 12h so 48h content leads
const HOTNESS_WEIGHT = 36; // weight of the time-decayed hotness in the final score
const COLD_START_HOURS = 12; // posts younger than this get a guaranteed-delivery boost (age-based, not exposure-based)
const COLD_START_BOOST = 18; // strength of the cold-start boost at age 0 (decays to 0 at COLD_START_HOURS)
const FRESH_POOL_MULTIPLIER = 5;
// De-duplication: a note delivered to this user within this many minutes is
// demoted; the penalty fades linearly to 0 as it approaches the window edge,
// so good content returns later (time-recovering de-dup, per user request).
const DEDUP_WINDOW_MINUTES = 360; // 6h: within this, a just-seen note is suppressed
const DEDUP_MAX_PENALTY = 90; // strength of the demotion for a just-now-delivered note (must outweigh hotness so the feed visibly rotates)
// Random jitter to break ties / add variation between refreshes (kept small so it
// only reorders near-equal scores, never lets junk leap to the top).
const JITTER_AMPLITUDE = 6;
// Author-level anti-flood: accounts that post a lot but earn almost no engagement per
// post are spammers (e.g. grok/doubao/WindSurf — none flagged isBot, so withBots can't
// catch them). Their notes get a frequency-scaled penalty so they can't dominate by volume.
const AUTHOR_FLOOD_MIN_POSTS = 15; // below this post count an author is never treated as a flooder
const AUTHOR_FLOOD_RATE_THRESHOLD = 0.8; // engagement-per-post below this + high volume = flood
const AUTHOR_FLOOD_MAX_PENALTY = 46; // cap on the per-note flood penalty
const AUTHOR_WINDOW = 1000 * 60 * 60 * 24 * 7; // window for measuring author posting frequency

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
		// offset 之前上限 1000,实际推荐窗口又是 7 天 ~ 1k 帖子,用户滑到 ~500 就硬撞顶。
		// 抬到 10000,配合下面按 sort 拉长 CANDIDATE_WINDOW,长尾滑动也能继续拿到数据。
		offset: { type: 'integer', minimum: 0, maximum: 10000, default: 0 },
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

			// 管理者が調整可能な推薦設定(降权/加点する語と重み)。SQL の事前スコアと JS の精スコア両方で使う。
			const recConfig = await this.recommendationService.getRecommendationConfig();
			const sqlTerms = deriveSqlTerms(recConfig);
			const qualityKeywordPattern = buildPgKeywordPattern(sqlTerms.qualityKeywords);

			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate) : null);
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate) : null);
			// sort 不在"个性化"时窗口直接拉到 30 天;offset>500 时不管什么 sort 都用 30 天 →
			// offset>2000 时(真长尾)用 6 个月。这样用户滑多久都不会突然"没有更多了"。
			const sortValue = ps.sort as RecommendationSort;
			const deepOffset = ps.offset > 500;
			const veryDeepOffset = ps.offset > 2000;
			const window = veryDeepOffset ? CANDIDATE_WINDOW_FALLBACK
				: (deepOffset || sortValue !== 'personalized') ? CANDIDATE_WINDOW_DEEP
				: CANDIDATE_WINDOW;
			const rankingSinceId = this.idService.gen(this.timeService.now - window);
			const floorSinceId = sinceId && sinceId > rankingSinceId ? sinceId : rankingSinceId;

			const query = this.notesRepository.createQueryBuilder('note')
				.andWhere('note.id > :rankingSinceId', { rankingSinceId: floorSinceId })
				.andWhere('note.visibility = \'public\'')
				.innerJoinAndSelect('note.user', 'user')
				.leftJoinAndSelect('note.reply', 'reply')
				.leftJoinAndSelect('note.renote', 'renote')
				.leftJoinAndSelect('reply.user', 'replyUser')
				.leftJoinAndSelect('renote.user', 'renoteUser')
				.leftJoinAndSelect('note.channel', 'channel')
				.andWhere(new Brackets(qb => qb
					.orWhere('note.replyId IS NULL')
					.orWhere('reply.id IS NOT NULL AND replyUser.id IS NOT NULL')))
				.andWhere(new Brackets(qb => qb
					.orWhere('note.renoteId IS NULL')
					.orWhere('renote.id IS NOT NULL AND renoteUser.id IS NOT NULL')));

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
							WHEN note.id > :fresh24hId THEN 1.55
							WHEN note.id > :fresh48hId THEN 1.2
							WHEN note.id > :fresh3dId THEN 0.72
							WHEN note.id > :fresh7dId THEN 0.35
							ELSE 0.12
						END
						+ CASE WHEN note."fileIds" != '{}' THEN 4 ELSE 0 END
						+ CASE WHEN note."channelId" IS NOT NULL THEN :channelBoost ELSE 0 END
						+ CASE WHEN note."channelId" IS NOT NULL AND note.id = ANY(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[])) THEN 18 ELSE 0 END
						+ CASE WHEN channel."isSensitive" = TRUE THEN -18 ELSE 0 END
						+ CASE WHEN channel.name ~* :lowValueChannelNamePattern THEN -40 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:qualityTags AS varchar[]) THEN 20 ELSE 0 END
						+ CASE WHEN LENGTH(COALESCE(note.text, '')) >= 80 THEN 12 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(教程|指南|配置|部署|使用方法|怎么|如何|说明|公告|更新|修复|bug|问题|讨论|求助|ai|claude|codex|gpt)' THEN 20 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(token|key|资源)' AND LOWER(COALESCE(note.text, '')) ~ '(教程|指南|配置|部署|使用方法|说明|讨论|问题|怎么|如何|求助)' THEN 12 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(邀请|注册送|注册送|倍率|白嫖|来蹬|轻蹬|随便用|限时密钥|限时 key|私key|私 key|号池)' THEN -40 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:keyTags AS varchar[]) AND LOWER(COALESCE(note.text, '')) !~ '(教程|指南|配置|部署|使用方法|说明|讨论|问题|怎么|如何|求助)' THEN -34 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:bugTags AS varchar[]) AND note."fileIds" = '{}' AND note."repliesCount" < 2 THEN -6 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(tp-[a-z0-9_-]{16,}|api[_ -]?key|密钥)' THEN -42 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(sk-[a-z0-9_-]{12,})' THEN -38 ELSE 0 END
						+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '^(sk-[a-z0-9_-]+\\s*)+$' THEN -64 ELSE 0 END
						+ CASE WHEN note."renoteId" IS NOT NULL AND note.text IS NULL THEN -8 ELSE 0 END
						+ CASE WHEN LENGTH(COALESCE(note.text, '')) < 8 THEN -20 ELSE 0 END
						+ CASE WHEN LENGTH(COALESCE(note.text, '')) < 20 THEN -14 ELSE 0 END
						+ CASE WHEN note.tags && CAST(:lowValueTags AS varchar[]) THEN -28 ELSE 0 END
						+ CASE WHEN COALESCE(note.text, '') LIKE '%签到%' AND LENGTH(COALESCE(note.text, '')) < 60 THEN -34 ELSE 0 END
						+ CASE WHEN COALESCE(note.text, '') LIKE '%打卡%' AND LENGTH(COALESCE(note.text, '')) < 60 THEN -28 ELSE 0 END
						+ CASE WHEN note.id < :fresh48hId THEN -12 ELSE 0 END
						+ CASE
							WHEN note.id < :fresh3dId
								AND (
									LEAST(
										COALESCE((
											SELECT SUM((value)::int)
											FROM jsonb_each_text(note.reactions)
										), 0),
										40
									)
									+ note."repliesCount" * 2
									+ note."renoteCount" * 2
									+ note."clippedCount" * 3
								) < 3
								AND note.id <> ALL(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[]))
								AND NOT (
									note.tags && CAST(:qualityTags AS varchar[])
									OR LOWER(COALESCE(note.text, '')) ~ :qualityKeywordPattern
								)
							THEN -45
							WHEN note.id < :fresh3dId
								AND (
									LEAST(
										COALESCE((
											SELECT SUM((value)::int)
											FROM jsonb_each_text(note.reactions)
										), 0),
										40
									)
									+ note."repliesCount" * 2
									+ note."renoteCount" * 2
									+ note."clippedCount" * 3
								) < 3
								AND note.id <> ALL(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[]))
								AND NOT (
									note.tags && CAST(:qualityTags AS varchar[])
									OR LOWER(COALESCE(note.text, '')) ~ :qualityKeywordPattern
								)
							THEN -45
							ELSE 0
						END
					)
				`, 'recommendation_score')
				.setParameter('lowValueTags', sqlTerms.lowValueTags)
				.setParameter('qualityTags', sqlTerms.qualityTags)
				.setParameter('qualityKeywordPattern', qualityKeywordPattern)
				.setParameter('keyTags', ['Key', 'key', 'Token', 'token'])
				.setParameter('bugTags', ['Bug', 'bug'])
				.setParameter('lowValueChannelNamePattern', LOW_VALUE_CHANNEL_NAME_PATTERN)
				.setParameter('channelBoost', surface === 'explore' ? 14 : 10)
				.setParameter('fresh24hId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24))
				.setParameter('fresh48hId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * FRESH_PRIORITY_HOURS))
				.setParameter('fresh3dId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 3))
				.setParameter('fresh7dId', this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 7));

			let candidates: Awaited<ReturnType<typeof query.getMany>>;
			if (sort === 'latestReply') {
				// "Latest replies": order strictly by most-recent-reply time.
				// getMany() does NOT preserve the SQL ORDER BY when the query has
				// leftJoinAndSelect relations (TypeORM hydration reorders rows), so we
				// fetch the candidate window, then compute each note's sort key with a
				// dedicated bulk query (newest public reply id, or the note's own id when
				// it has no replies) and sort in JS — deterministic, no raw-alias guessing.
				const fetched = this.filterPackableCandidates(await query
					.orderBy('note.id', 'DESC')
					.offset(ps.offset)
					.limit(recommendationLimit)
					.getMany());
				const sortKeyById = new Map<string, string>(fetched.map(n => [n.id, n.id]));
				if (fetched.length > 0) {
					// Raw parameterised query with explicit column aliases — avoids any
					// ambiguity in how the query builder names aggregate raw columns.
					const replyRows = await this.notesRepository.query(
						'SELECT "replyId" AS reply_id, MAX("id") AS max_id FROM note WHERE "replyId" = ANY($1) AND visibility = \'public\' GROUP BY "replyId"',
						[fetched.map(n => n.id)],
					) as { reply_id: string; max_id: string }[];
					for (const row of replyRows) {
						// sort key = newest reply id when it's newer than the note's own id
						const own = sortKeyById.get(row.reply_id) ?? row.reply_id;
						sortKeyById.set(row.reply_id, row.max_id > own ? row.max_id : own);
					}
				}
				candidates = [...fetched].sort((a, b) => {
					const ka = sortKeyById.get(a.id) ?? a.id;
					const kb = sortKeyById.get(b.id) ?? b.id;
					return ka < kb ? 1 : ka > kb ? -1 : 0;
				});
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
				const [scoredRaw, freshRaw] = await Promise.all([scoredQuery.getMany(), freshQuery.getMany()]);
				const scored = this.filterPackableCandidates(scoredRaw);
				const fresh = this.filterPackableCandidates(freshRaw);
				const merged = new Map<string, typeof scored[number]>();
				for (const note of scored) merged.set(note.id, note);
				for (const note of fresh) merged.set(note.id, note);
				candidates = [...merged.values()];
			}

			let notes: typeof candidates;
			if (sort === 'latestReply') {
				// 「最新回复」是"看全部"的原始时间线，不做任何推荐侧调整：
				// 不重排、不做防灌水/低质过滤、不做每作者·每频道上限、不去重。
				// candidates 已按最近回复时间倒序，且只经过必要的安全过滤(可见性/封禁/拉黑/静音)，
				// 这里直接取前 limit 条返回，保证所有人发的内容(含低互动/疑似广告)都能按时间出现。
				// (推荐流的筛选只作用于 forYou，由 /admin/recommendation 控制。)
				notes = candidates.slice(0, ps.limit);
			} else {
				const now = this.timeService.now;
				// Per-request seed: varies the exploration shuffle between refreshes so
				// the feed isn't identical each time (combined with offset for paging).
				const requestSeed = (Math.floor(now / (1000 * 30)) + ps.offset) % 100000;
				const [signals, authorFlood, overrides, sentiments] = await Promise.all([
					this.recommendationService.getUserSignals(me?.id ?? null, candidates, now, requestSeed),
					this.getAuthorFloodScores(candidates),
					this.recommendationService.getNoteOverrides(candidates.map(c => c.id)),
					recConfig.sentiment.enabled ? this.recommendationService.getNoteSentiments(candidates.map(c => c.id)) : Promise.resolve(null),
				]);
				const effectiveRankMode = category === 'trending' ? 'trending' : rankMode;
				notes = this.diversify(this.rankCandidates(candidates, signals, authorFlood, category, sort, effectiveRankMode, now, recConfig, overrides, sentiments), ps.limit, recConfig, now);
			}

			// 管理者がホーム推薦に固定したノートを最上部に注入する(ホーム・先頭ページのみ)
			if (surface === 'home' && ps.offset === 0) {
				notes = await this.prependPinnedNotes(notes, candidates);
			}

			// Record delivery per-user so the next request can de-duplicate (time-recovering).
			this.recommendationService.recordDelivery(me?.id ?? null, notes.map(note => note.id), this.timeService.now);
			return await this.noteEntityService.packMany(notes, me);
		});
	}

	private filterPackableCandidates<T extends MiNote>(notes: readonly (T | null | undefined)[]): T[] {
		return notes.filter((note): note is T => {
			if (note == null || note.userId == null) return false;
			if (note.replyId != null && (note.reply == null || note.reply.userId == null)) return false;
			if (note.renoteId != null && (note.renote == null || note.renote.userId == null)) return false;
			if (note.renote != null && this.isPureRenote(note.renote) && note.renote.renote == null) return false;
			return true;
		});
	}

	private isPureRenote(note: MiNote): boolean {
		return note.renoteId != null
			&& note.replyId == null
			&& note.text == null
			&& note.cw == null
			&& note.fileIds.length === 0
			&& !note.hasPoll;
	}

	private applyScope(query: ReturnType<NotesRepository['createQueryBuilder']>, scope: RecommendationScope, meId: string | null): void {
		// 频道帖子默认不进推荐/最新回复时间线;只有频道主"置顶"的帖子(channel.pinnedNoteIds)
		// 才算被频道主主动推上首页 —— 这是我们用现有 pinnedNoteIds 语义当"是否推送到首页"的开关,
		// 不引入新 DB 字段。注意 channel 表在 line 166 已 leftJoin 进来,这里直接引用即可。
		const channelGate = `(note."channelId" IS NULL OR (note."channelId" IS NOT NULL AND note.id = ANY(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[]))))`;

		if (scope === 'local') {
			query.andWhere('note.userHost IS NULL');
			query.andWhere(channelGate);
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
					.orWhere(channelGate)));
			query.setParameters({ meId });
			return;
		}

		if (scope === 'social') {
			query.andWhere('note.userHost IS NULL');
			query.andWhere(channelGate);
			return;
		}

		query.andWhere(new Brackets(qb => {
			qb.orWhere(new Brackets(qbb => qbb
				.andWhere('note.userHost IS NULL')
				.andWhere(channelGate)));
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
			query.setParameter('categorySportsPattern', '运动|体育|赛事|比赛|球队|足球|篮球|网球|跑步|健身|训练|sports?|football|basketball|tennis|fitness|workout|match|team');
		} else if (category === 'entertainment') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:categoryEntertainmentTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryEntertainmentPattern');
			}));
			query.setParameter('categoryEntertainmentTags', ['娱乐', '电影', '音乐', '动漫', '动画', '漫画', '综艺', '追剧', '明星', 'Entertainment', 'entertainment']);
			query.setParameter('categoryEntertainmentPattern', '娱乐|电影|音乐|动漫|动画|漫画|综艺|追剧|明星|剧集|影院|演唱会|movie|film|music|anime|comic|show|entertainment|concert');
		} else if (category === 'games') {
			query.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:categoryGameTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :categoryGamePattern');
			}));
			query.setParameter('categoryGameTags', [
				'游戏', '我的世界', '电竞', '手游', '主机', '单机', '网游', '开黑', 'Minecraft', 'minecraft',
				'Apex', 'apex', 'ApexLegends', 'apexlegends', 'LOL', 'lol', 'LeagueOfLegends', 'leagueoflegends',
				'GTA', 'gta', 'GTA5', 'gta5', 'GTAV', 'gtav', 'GTAOnline', 'gtaonline', 'Steam', 'steam',
				'PCGaming', 'pcgaming', 'GameDev', 'gamedev', 'Gaming', 'gaming', 'Esports', 'esports',
			]);
			query.setParameter('categoryGamePattern', '游戏|我的世界|麦块|方块|服务器|电竞|开黑|手游|主机|单机|网游|minecraft|mine.?craft|mc服务器|apex|apex\\s*legends|league\\s*of\\s*legends|\\blol\\b|riot\\s*games|valorant|gta\\s*5?|gtav|gta\\s*online|rockstar|steam|pc\\s*gaming|playstation|xbox|nintendo|switch|fortnite|roblox|counter\\s*strike|\\bcs2\\b|dota\\s*2|overwatch|game\\s*dev|gamedev|indie\\s*games?|gaming|videogames?|esports?');
		}
	}

	/**
	 * Per-author flood penalty: for every author appearing in the candidate set,
	 * count their posts and total weighted engagement over the recent window, then
	 * derive a penalty for high-volume / low-engagement-per-post accounts. This
	 * catches spam accounts that are NOT flagged isBot (so withBots can't filter
	 * them) but flood the instance with near-zero-value posts. Computed in one
	 * grouped query over the candidate authors.
	 */
	private async getAuthorFloodScores(notes: { userId: string }[]): Promise<Map<string, number>> {
		const penalties = new Map<string, number>();
		const authorIds = [...new Set(notes.map(note => note.userId))];
		if (authorIds.length === 0) return penalties;

		const windowSinceId = this.idService.gen(this.timeService.now - AUTHOR_WINDOW);
		const rows = await this.notesRepository.createQueryBuilder('note')
			.select('note.userId', 'userId')
			.addSelect('COUNT(*)', 'posts')
			.addSelect(`SUM(
				COALESCE((SELECT SUM((value)::int) FROM jsonb_each_text(note.reactions)), 0)
				+ note."renoteCount" * 2
				+ note."repliesCount" * 2
				+ note."clippedCount" * 3
			)`, 'engage')
			.where('note.userId IN (:...authorIds)', { authorIds })
			.andWhere('note.id > :windowSinceId', { windowSinceId })
			.groupBy('note.userId')
			.getRawMany<{ userId: string; posts: string; engage: string | null }>();

		for (const row of rows) {
			const posts = Number(row.posts);
			if (posts < AUTHOR_FLOOD_MIN_POSTS) continue;
			const engage = Number(row.engage ?? 0);
			const engagementRate = engage / Math.max(posts, 1);
			if (engagementRate >= AUTHOR_FLOOD_RATE_THRESHOLD) continue;
			// The more they post past the threshold, the harder they are demoted (capped).
			penalties.set(row.userId, Math.min(AUTHOR_FLOOD_MAX_PENALTY, (posts - (AUTHOR_FLOOD_MIN_POSTS - 1)) * 1.5));
		}
		return penalties;
	}

	private rankCandidates<T extends { id: string; userId: string; text: string | null; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[]; tags?: string[]; channelId?: string | null; channel?: { pinnedNoteIds?: string[]; name?: string | null } | null; user?: { id: string; followersCount?: number; avatarId?: string | null; isBot?: boolean } | null }>(
		notes: T[],
		signals: Awaited<ReturnType<RecommendationService['getUserSignals']>>,
		authorFlood: Map<string, number>,
		category: RecommendationCategory,
		sort: RecommendationSort,
		rankMode: RecommendationRankMode,
		now: number,
		config: RecommendationConfig,
		overrides?: Map<string, { pinned: boolean; scoreBoost: number }>,
		sentiments?: Map<string, { score: number; label: string; magnitude: number }> | null,
	): T[] {
		return notes
			.map((note, index) => {
				const signal = signals.get(note.id);
				const reactionCount = Object.values(note.reactions ?? {}).reduce((acc, value) => acc + Number(value), 0);
				// Absolute engagement value (capped).
				const engagementValue =
					Math.min(reactionCount, 40) * 0.6 +
					Math.min(note.renoteCount ?? 0, 30) * 0.8 +
					Math.min(note.repliesCount ?? 0, 30) * 0.9 +
					Math.min(note.clippedCount ?? 0, 20) * 1.1 +
					((note.fileIds?.length ?? 0) > 0 ? 2.5 : 0);
				const hotScore = Math.min(Number(signal?.hotScore ?? 0), 42);
				// Age-based time decay. The global exposure counter is no longer used as
				// a divisor (it inflated ~100x faster than engagement and collapsed every
				// rate to ~0). Instead, a note's hotness = its real engagement + behaviour
				// hotness, decayed by age so fresh content leads and old content yields.
				const ageHours = Math.max(0, (now - this.idService.parse(note.id).date.getTime()) / (1000 * 60 * 60));
				const freshnessDecay = Math.exp(-ageHours / HOT_HALF_LIFE_HOURS);
				const hotnessScore = (engagementValue + hotScore) * freshnessDecay;
				// Quality gate: obvious 灌水 (short text w/o media, or flagged by
				// getLowValuePenalty) only gets a fraction of the cold-start boost.
				const lowValuePenalty = this.getLowValuePenalty(note, config);
				const compactLen = (note.text ?? '').replace(/\s+/g, '').length;
				const hasMedia = (note.fileIds?.length ?? 0) > 0;
				const qualityScore = this.getQualityScore(note, config);
				const isPinnedInChannel = note.channel?.pinnedNoteIds?.includes(note.id) ?? false;
				const oldContentPenalty = ageHours >= FRESH_PRIORITY_HOURS
					? Math.min(42, (ageHours - FRESH_PRIORITY_HOURS) * 0.75)
					: 0;
				const qualifiesForPool = lowValuePenalty < 18 && (compactLen >= 20 || hasMedia || qualityScore > 0);
				// Traffic-pool guarantee, now AGE-based (exposure is unreliable): every
				// genuine new post (< COLD_START_HOURS old) gets a decaying delivery boost
				// so it reaches an initial audience. Pure 灌水 gets only 0.15x.
				const coldStartBoost = ageHours < COLD_START_HOURS
					? COLD_START_BOOST * (1 - ageHours / COLD_START_HOURS) * (qualifiesForPool ? 1 : 0.15)
					: 0;
				// Personalised interest from the user's behaviour profile (TikTok-style).
				const interestScore =
					Math.min(Number(signal?.authorScore ?? 0), 28) * 0.5 +
					Math.min(Number(signal?.channelScore ?? 0), 34) * 0.66 +
					Math.min(Number(signal?.keywordScore ?? 0), 40) * 0.82 +
					Math.min(Number(signal?.eventScore ?? 0), 26) * 0.4;
				const socialScore = (signal?.socialAuthorScore ?? 0) + (signal?.socialChannelScore ?? 0);
				const negativeScore =
					Math.min(Number(signal?.negativeAuthorScore ?? 0), 18) * 1.15 +
					Math.min(Number(signal?.negativeKeywordScore ?? 0), 18) * 0.8;
				// Time-recovering de-duplication: a note this user was shown recently is
				// demoted, and the demotion fades linearly to 0 across DEDUP_WINDOW_MINUTES
				// — so the feed doesn't repeat, yet good content can return much later.
				const deliveredMinutesAgo = signal?.deliveredMinutesAgo ?? null;
				const dedupPenalty = (deliveredMinutesAgo != null && deliveredMinutesAgo < DEDUP_WINDOW_MINUTES)
					? DEDUP_MAX_PENALTY * (1 - deliveredMinutesAgo / DEDUP_WINDOW_MINUTES)
					: 0;
				// Legacy seen flag (frontend impression) — keep a light demotion on top.
				const seenPenalty = signal?.seen ? -10 + Math.min(engagementValue, 12) * 0.5 : 0;
				const exploreBoost = (signal?.explorationScore ?? 0) * (rankMode === 'trending' ? 2.2 : 13);
				// Small per-request jitter (hash-based via explorationScore) to break ties
				// and add visible variation between refreshes.
				const jitter = ((signal?.explorationScore ?? 0) - 0.5) * 2 * JITTER_AMPLITUDE;
				const recencyTieBreak = Math.max(0, notes.length - index) / Math.max(notes.length, 1);
				const personalizedScore = rankMode === 'trending' ? 0 : interestScore + socialScore;
				// Author-level anti-flood: high-volume / low-engagement spam accounts.
				const floodPenalty = authorFlood.get(note.userId) ?? 0;
				const latestReplyBoost = sort === 'latestReply' ? recencyTieBreak * 8 : 0;
				// 真実ユーザー加点: アカウント年齢・フォロワー・プロフィール充実度で信頼度を算出。
				// 捨て垢/水軍(新規・無フォロワー・bot)を下げ、本物の活発なユーザーの投稿を優先する。
				const author = note.user;
				let authorTrust = 0;
				if (author != null) {
					const accountAgeDays = Math.max(0, (now - this.idService.parse(author.id).date.getTime()) / (1000 * 60 * 60 * 24));
					if (accountAgeDays < 1) authorTrust -= 8;
					else if (accountAgeDays >= 30) authorTrust += 6;
					else if (accountAgeDays >= 7) authorTrust += 3;
					authorTrust += Math.min(Number(author.followersCount ?? 0), 100) / 100 * 8;
					if (author.avatarId != null) authorTrust += 2;
					if (author.isBot === true) authorTrust -= 6;
				}
				// チャンネル投稿への一律加点(管理者が調整可)。チャンネル内容を推薦に出やすくする。
				const channelBoost = note.channelId != null ? config.channelBoost : 0;
				// 感情分析: 有効時、負面は降权(主)、正面は軽い加点。閾値(neutralBand)内は中立で無調整。
				let sentimentAdj = 0;
				if (config.sentiment.enabled && sentiments != null) {
					const s = sentiments.get(note.id);
					if (s != null) {
						if (s.score < -config.sentiment.neutralBand) sentimentAdj = config.sentiment.negativePenalty;
						else if (s.score > config.sentiment.neutralBand) sentimentAdj = config.sentiment.positiveBoost;
					}
				}
				let score = hotnessScore * HOTNESS_WEIGHT / 42
					+ coldStartBoost
					+ qualityScore
					+ personalizedScore
					+ seenPenalty
					+ exploreBoost
					+ jitter
					+ channelBoost
					+ sentimentAdj
					+ latestReplyBoost
					+ recencyTieBreak
					+ authorTrust
					- dedupPenalty
					- negativeScore
					- lowValuePenalty
					- oldContentPenalty
					- floodPenalty;
				if (ageHours >= OLD_CONTENT_HOURS && !isPinnedInChannel) {
					score = Math.min(score, OLD_CONTENT_MAX_SCORE);
				}
				// 管理者による手動スコア調整(閾値)を最後に加算する
				const override = overrides?.get(note.id);
				if (override != null) score += override.scoreBoost;
				return {
					note,
					score,
					exploreScore: signal?.explorationScore ?? 0,
				};
			})
			.sort((a, b) => b.score - a.score)
			.map(entry => entry.note);
	}

	private diversify<T extends { id: string; userId: string; text: string | null; channelId?: string | null; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[]; tags?: string[]; channel?: { pinnedNoteIds?: string[]; name?: string | null } | null }>(notes: T[], limit: number, config: RecommendationConfig, now = this.timeService.now): T[] {
		const selected: T[] = [];
		const authorCounts = new Map<string, number>();
		const channelCounts = new Map<string, number>();
		const seenText = new Set<string>();
		const exploreSlots = Math.max(1, Math.floor(limit * EXPLORE_SLOT_RATIO));

		for (const note of notes) {
			const ageHours = Math.max(0, (now - this.idService.parse(note.id).date.getTime()) / (1000 * 60 * 60));
			const isPinnedInChannel = note.channel?.pinnedNoteIds?.includes(note.id) ?? false;
			if (ageHours >= 24 * 7 && !isPinnedInChannel) continue;
			if (ageHours >= OLD_CONTENT_HOURS && !isPinnedInChannel && !this.hasOldContentQuality(note, config)) continue;
			if (this.getLowValuePenalty(note, config) >= config.excludeThreshold && !this.hasStrongEngagement(note)) continue;
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
			const ageHours = Math.max(0, (now - this.idService.parse(note.id).date.getTime()) / (1000 * 60 * 60));
			const isPinnedInChannel = note.channel?.pinnedNoteIds?.includes(note.id) ?? false;
			if (ageHours >= 24 * 7 && !isPinnedInChannel) continue;
			if (ageHours >= OLD_CONTENT_HOURS && !isPinnedInChannel && !this.hasOldContentQuality(note, config)) continue;
			if (this.getLowValuePenalty(note, config) >= config.excludeThreshold && !this.hasStrongEngagement(note)) continue;
			if ((limit - selected.length) > exploreSlots && selected.length >= Math.max(limit - exploreSlots, 0)) continue;
			selected.push(note);
		}

		return selected;
	}

	private hasStrongEngagement(note: { repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number> }): boolean {
		return this.getEngagementScore(note) >= 10;
	}

	private hasOldContentQuality(note: { text: string | null; tags?: string[]; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[] }, config: RecommendationConfig): boolean {
		return this.getEngagementScore(note) >= 6 || this.getQualityScore(note, config) >= 18;
	}

	private getEngagementScore(note: { repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number> }): number {
		const reactionCount = Object.values(note.reactions ?? {}).reduce((acc, value) => acc + Number(value), 0);
		return reactionCount + (note.repliesCount ?? 0) * 2 + (note.renoteCount ?? 0) * 2 + (note.clippedCount ?? 0) * 3;
	}

	private getQualityScore(note: { text: string | null; tags?: string[]; channelId?: string | null; fileIds?: string[] }, config: RecommendationConfig): number {
		const text = (note.text ?? '').trim();
		const lower = text.toLowerCase();
		let score = 0;
		// ----- 管理者が調整可能な加点(boost ルール) -----
		if (config.enabled) {
			for (const rule of config.rules) {
				if (!rule.enabled || rule.kind !== 'boost') continue;
				const hit = rule.match === 'tag' ? hasAnyTag(note.tags, rule.terms) : containsKeyword(text, rule.terms);
				if (hit) score += rule.weight;
			}
		}
		// ----- 内蔵の構造的加点 -----
		if (/(token|key|资源)/i.test(lower) && /(教程|指南|配置|部署|使用方法|说明|讨论|怎么用|如何)/i.test(text)) score += 10;
		if (text.replace(/\s+/g, '').length >= 80) score += 10;
		if ((note.fileIds?.length ?? 0) > 0) score += 4;
		if (note.channelId != null) score += 6;
		return score;
	}

	private getLowValuePenalty(note: { text: string | null; tags?: string[]; repliesCount?: number; renoteCount?: number; clippedCount?: number; reactions?: Record<string, number>; fileIds?: string[]; channel?: { name?: string | null } | null }, config: RecommendationConfig): number {
		const text = (note.text ?? '').trim();
		const compactText = text.replace(/\s+/g, '');
		const engagement = this.getEngagementScore(note);
		const hasQualityContext = this.getQualityScore(note, config) > 0;
		let penalty = 0;
		// ===== 内蔵の構造的ルール(調整対象外:極端に短い・連投・キー羅列・裸リンク 等) =====
		if (compactText.length < 6 && (note.fileIds?.length ?? 0) === 0) penalty += 42;
		if (compactText.length < 18 && engagement === 0 && (note.fileIds?.length ?? 0) === 0) penalty += 30;
		if (/^(签到|打卡|水|路过|测试|1|11|111|。|，|哈)+$/i.test(compactText)) penalty += 50;
		if (/^(.)\1{5,}$/.test(compactText)) penalty += 24;
		if (/(邀请|注册送|倍率|白嫖|来蹬|轻蹬|随便用|限时密钥|限时\s*key|私\s*key|号池)/i.test(text)) penalty += 38;
		if (/(tp-[a-z0-9_-]{16,}|api[_ -]?key|密钥)/i.test(text)) penalty += 38;
		if (/sk-[a-z0-9_-]{12,}/i.test(text)) penalty += hasQualityContext ? 18 : 46;
		if (/^(sk-[a-z0-9_-]+\s*)+$/i.test(compactText)) penalty += 70;
		if (/^https?:\/\/\S+$/i.test(text)) penalty += 26;
		if (/https?:\/\/\S+/i.test(text) && compactText.length < 90 && !hasQualityContext) penalty += 18;
		if (/https?:\/\/\S+/i.test(text) && /(强不强|偷着乐|点\s*star|点\s*start|买不了吃亏|买不了上当|推荐.*机场)/i.test(text)) penalty += 34;
		if (note.channel?.name != null && new RegExp(LOW_VALUE_CHANNEL_NAME_PATTERN, 'i').test(note.channel.name)) penalty += 42;

		// ===== 管理者が調整可能なルール(demote ルール。語/タグ/重みは管理画面で変更可) =====
		if (config.enabled) {
			for (const rule of config.rules) {
				if (!rule.enabled || rule.kind !== 'demote') continue;
				// exemptWithQuality: 良質な文脈がある投稿は降权を免除(広告語などの誤爆防止)
				if (rule.exemptWithQuality && hasQualityContext) continue;
				const hit = rule.match === 'tag' ? hasAnyTag(note.tags, rule.terms) : containsKeyword(text, rule.terms);
				if (hit) penalty += rule.weight;
			}
		}
		return penalty;
	}

	// 管理者がピン留めしたノートを最上部に並べる。候補(7日窓)外でも単独取得し、重複は除去する。
	private async prependPinnedNotes(notes: MiNote[], candidates: MiNote[]): Promise<MiNote[]> {
		const pinnedIds = await this.recommendationService.getPinnedNoteIds();
		if (pinnedIds.length === 0) return notes;
		const byId = new Map<string, MiNote>(candidates.map(c => [c.id, c]));
		const missingIds = pinnedIds.filter(id => !byId.has(id));
		if (missingIds.length > 0) {
			const fetched = this.filterPackableCandidates(await this.notesRepository.find({
				where: { id: In(missingIds), visibility: 'public' },
				relations: { user: true, reply: { user: true }, renote: { user: true }, channel: true },
			}));
			for (const note of fetched) byId.set(note.id, note);
		}
		const ordered = pinnedIds.map(id => byId.get(id)).filter((note): note is MiNote => note != null);
		const pinnedSet = new Set(ordered.map(note => note.id));
		return [...ordered, ...notes.filter(note => !pinnedSet.has(note.id))];
	}
}
