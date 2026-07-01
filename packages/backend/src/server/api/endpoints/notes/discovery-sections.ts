/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { ChannelsRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { QueryService } from '@/core/QueryService.js';
import { SearchTrendService } from '@/core/SearchTrendService.js';
import { IdService } from '@/core/IdService.js';
import { RecommendationService } from '@/core/RecommendationService.js';
import { deriveSqlTerms, type RecommendationConfig } from '@/core/RecommendationConfig.js';
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';

const DISCOVERY_WINDOW = 1000 * 60 * 60 * 24 * 7;
const DISCOVERY_FRESH_PRIORITY_HOURS = 48;
// 候補プールを limit より大きく取り、その中から上位偏重の重み付きランダムで選ぶことで
// 「万年不変」を解消しつつ品質を保つ。
const POOL_MULTIPLIER = 4;
// 構造的な低品質シグナル(調整対象外):キー羅列・注册送・裸の招待リンク 等。
const STRUCTURAL_DISCOVERY_PATTERN = '签到|打卡|限时密钥|限时\\s*key|私\\s*key|tp-[a-z0-9_-]{16,}|sk-[a-z0-9_-]{12,}|白嫖|注册送|倍率|号池|强不强|偷着乐|点\\s*star|点\\s*start|买不了吃亏|买不了上当|[?&]aff[=_-]|/(register|signup|invite|ref)\\?';

// 管理者設定のキーワードを Postgres POSIX 正規表現の選択肢に変換(メタ文字エスケープ)。
function escapeForPgRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 発見セクションから除外する低品質テキストパターン(構造的 + 管理者設定の demote キーワード)。
function buildDiscoveryLowValuePattern(demoteKeywords: string[]): string {
	const words = demoteKeywords
		.map(w => w.trim())
		.filter(w => w.length > 0)
		.map(escapeForPgRegex);
	return words.length > 0 ? `${STRUCTURAL_DISCOVERY_PATTERN}|${words.join('|')}` : STRUCTURAL_DISCOVERY_PATTERN;
}

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			trends: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					popularSearches: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
					recentTerms: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
					hashtags: { type: 'array', optional: false, nullable: false, items: { type: 'string', optional: false, nullable: false } },
				},
			},
			coverNotes: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'Note' },
			},
			hotNotes: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'Note' },
			},
			tutorialNotes: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'Note' },
			},
			channels: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'Channel' },
			},
			users: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'object', optional: false, nullable: false, ref: 'User' },
			},
		},
	},

	limit: {
		duration: 1000,
		max: 3,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 10, default: 6 },
		// 'all' = 不过滤(默认,保持向后兼容);'local' = 只看本站用户(userHost IS NULL);
		// 'global' = 只看远程联邦用户(userHost IS NOT NULL)
		scope: { type: 'string', enum: ['all', 'local', 'global'], default: 'all' },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private noteEntityService: NoteEntityService,
		private channelEntityService: ChannelEntityService,
		private userEntityService: UserEntityService,
		private queryService: QueryService,
		private searchTrendService: SearchTrendService,
		private idService: IdService,
		private recommendationService: RecommendationService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sinceId = this.idService.gen(this.timeService.now - DISCOVERY_WINDOW);
			// 管理者が調整可能な推薦設定(低品質/広告/bug 語の除外に使う)
			const config = await this.recommendationService.getRecommendationConfig();
			const scope = ps.scope as 'all' | 'local' | 'global';
			const [trends, coverNotes, hotNotes, tutorialNotes, channels, users] = await Promise.all([
				this.searchTrendService.getTrends(ps.limit),
				this.getCoverNotes(sinceId, ps.limit, me, config, scope),
				this.getHotNotes(sinceId, ps.limit, me, config, scope),
				this.getTutorialNotes(sinceId, ps.limit, me, config, scope),
				this.getChannels(ps.limit, me),
				this.getUsers(ps.limit, me),
			]);

			return {
				trends,
				coverNotes,
				hotNotes,
				tutorialNotes,
				channels,
				users,
			};
		});
	}

	// 上位偏重の重み付きランダム抽出。スコア順の候補プールから count 件を選び、
	// 毎回の更新で並びと顔ぶれが変わるようにする(上位ほど選ばれやすい)。
	private pickWeighted<T>(pool: T[], count: number): T[] {
		if (pool.length <= count) return pool;
		const items = pool.map((item, i) => ({ item, weight: Math.pow(pool.length - i, 1.6) }));
		const picked: T[] = [];
		while (picked.length < count && items.length > 0) {
			const total = items.reduce((s, e) => s + e.weight, 0);
			let r = Math.random() * total;
			let idx = items.length - 1;
			for (let i = 0; i < items.length; i++) {
				r -= items[i].weight;
				if (r <= 0) { idx = i; break; }
			}
			picked.push(items[idx].item);
			items.splice(idx, 1);
		}
		return picked;
	}

	private baseNotesQuery(sinceId: string, me: Parameters<QueryService['generateVisibilityQuery']>[1], config: RecommendationConfig, scope: 'all' | 'local' | 'global' = 'all') {
		const sqlTerms = deriveSqlTerms(config);
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id > :sinceId', { sinceId })
			.andWhere('note.visibility = \'public\'')
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.leftJoinAndSelect('note.channel', 'channel');
		query
			.andWhere('LOWER(COALESCE(note.text, \'\')) !~ :discoveryLowValuePattern')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags IS NULL');
				qb.orWhere('NOT (note.tags && CAST(:discoveryLowValueTags AS varchar[]))');
			}))
			.setParameter('discoveryLowValuePattern', buildDiscoveryLowValuePattern(sqlTerms.demoteKeywords))
			.setParameter('discoveryLowValueTags', sqlTerms.lowValueTags.length > 0 ? sqlTerms.lowValueTags : ['__never_match_sentinel_zzqx__']);
		// scope 过滤:userHost 空 = 本站用户,非空 = 联邦用户
		if (scope === 'local') {
			query.andWhere('note.userHost IS NULL');
		} else if (scope === 'global') {
			query.andWhere('note.userHost IS NOT NULL');
		}
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
		return query;
	}

	private async getCoverNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1], config: RecommendationConfig, scope: 'all' | 'local' | 'global' = 'all') {
		const fresh48hId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * DISCOVERY_FRESH_PRIORITY_HOURS);
		const fresh3dId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 3);
		const coverScore = `(
			note."repliesCount" * 4
			+ note."renoteCount" * 3
			+ note."clippedCount" * 4
			+ CASE WHEN note.id > :fresh48hId THEN 46 ELSE -34 END
			+ CASE WHEN note.id > :fresh3dId THEN 12 ELSE -18 END
		)`;
		const query = this.baseNotesQuery(sinceId, me, config, scope)
			.andWhere('note.fileIds != \'{}\'')
			.andWhere('user.isBot = FALSE')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.id > :fresh3dId');
				qb.orWhere('note."repliesCount" + note."renoteCount" + note."clippedCount" >= 2');
				qb.orWhere('note.id = ANY(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[]))');
			}))
			.addSelect(coverScore, 'discovery_cover_score')
			.orderBy('discovery_cover_score', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.setParameter('fresh48hId', fresh48hId)
			.setParameter('fresh3dId', fresh3dId)
			.limit(limit * POOL_MULTIPLIER);
		return this.noteEntityService.packMany(this.pickWeighted(await query.getMany(), limit), me);
	}

	private async getHotNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1], config: RecommendationConfig, scope: 'all' | 'local' | 'global' = 'all') {
		const fresh48hId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * DISCOVERY_FRESH_PRIORITY_HOURS);
		const fresh3dId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 3);
		const hotScore = `(
			note."repliesCount" * 5
			+ note."renoteCount" * 4
			+ note."clippedCount" * 5
			+ CASE WHEN note."channelId" IS NOT NULL THEN 8 ELSE 0 END
			+ CASE WHEN note.id > :fresh48hId THEN 52 ELSE -38 END
			+ CASE WHEN note.id > :fresh3dId THEN 12 ELSE -18 END
			+ CASE WHEN LOWER(COALESCE(note.text, '')) ~ '(教程|指南|配置|部署|使用方法|怎么用|如何|说明|公告|更新|讨论|分享|经验|科普|ai|claude|codex|gpt)' THEN 12 ELSE 0 END
		)`;
		const query = this.baseNotesQuery(sinceId, me, config, scope)
			.andWhere('user.isBot = FALSE')
			.andWhere('LENGTH(COALESCE(note.text, \'\')) >= 20')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.id > :fresh48hId');
				qb.orWhere('note."repliesCount" > 0');
				qb.orWhere('note."renoteCount" > 0');
				qb.orWhere('note."clippedCount" > 0');
				qb.orWhere('note."channelId" IS NOT NULL');
			}))
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.id > :fresh3dId');
				qb.orWhere('note."repliesCount" + note."renoteCount" + note."clippedCount" >= 2');
				qb.orWhere('note.id = ANY(COALESCE(channel."pinnedNoteIds", ARRAY[]::varchar[]))');
			}))
			.addSelect(hotScore, 'discovery_hot_score')
			.orderBy('discovery_hot_score', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.setParameter('fresh48hId', fresh48hId)
			.setParameter('fresh3dId', fresh3dId)
			.limit(limit * POOL_MULTIPLIER);
		return this.noteEntityService.packMany(this.pickWeighted(await query.getMany(), limit), me);
	}

	private async getTutorialNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1], config: RecommendationConfig, scope: 'all' | 'local' | 'global' = 'all') {
		const fresh48hId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * DISCOVERY_FRESH_PRIORITY_HOURS);
		const fresh3dId = this.idService.gen(this.timeService.now - 1000 * 60 * 60 * 24 * 3);
		const tutorialScore = `(
			note."repliesCount" * 4
			+ note."renoteCount" * 3
			+ note."clippedCount" * 4
			+ CASE WHEN note."channelId" IS NOT NULL THEN 10 ELSE 0 END
			+ CASE WHEN note.id > :fresh48hId THEN 46 ELSE -36 END
			+ CASE WHEN note.id > :fresh3dId THEN 12 ELSE -18 END
			+ CASE WHEN LENGTH(COALESCE(note.text, '')) >= 80 THEN 10 ELSE 0 END
		)`;
		const query = this.baseNotesQuery(sinceId, me, config, scope)
			.andWhere('user.isBot = FALSE')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:tutorialTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :tutorialPattern');
			}))
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.id > :fresh3dId');
				qb.orWhere('note."repliesCount" + note."renoteCount" + note."clippedCount" >= 2');
				qb.orWhere('LENGTH(COALESCE(note.text, \'\')) >= 120');
			}))
			.setParameter('tutorialTags', ['教程', 'AI', 'ai', 'Token', 'token', '资源', '指南', '讨论', '分享', '经验'])
			.setParameter('tutorialPattern', '教程|指南|配置|部署|api|claude|codex|ai|gpt|token|资源|讨论|分享|经验|科普')
			.addSelect(tutorialScore, 'discovery_tutorial_score')
			.orderBy('discovery_tutorial_score', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.setParameter('fresh48hId', fresh48hId)
			.setParameter('fresh3dId', fresh3dId)
			.limit(limit * POOL_MULTIPLIER);
		return this.noteEntityService.packMany(this.pickWeighted(await query.getMany(), limit), me);
	}

	private async getChannels(limit: number, me: Parameters<ChannelEntityService['packMany']>[1]) {
		const channelScore = `(
			LEAST(channel."notesCount", 500) * 0.35
			+ LEAST(channel."usersCount", 200) * 1.6
			+ CASE WHEN channel."lastNotedAt" > now() - interval '48 hours' THEN 45 ELSE 0 END
			+ CASE WHEN channel."lastNotedAt" > now() - interval '7 days' THEN 20 ELSE -20 END
			+ cardinality(channel."pinnedNoteIds") * 6
		)`;
		const channels = await this.channelsRepository.createQueryBuilder('channel')
			.where('channel.isArchived = FALSE')
			.andWhere('channel.isSensitive = FALSE')
			.andWhere('channel."notesCount" > 0')
			.andWhere('channel.name !~* :lowValueChannelPattern')
			.addSelect(channelScore, 'discovery_channel_score')
			.orderBy('discovery_channel_score', 'DESC')
			.setParameter('lowValueChannelPattern', '^(Key|key|白嫖|签到|打卡)$')
			.addOrderBy('channel.lastNotedAt', 'DESC', 'NULLS LAST')
			.limit(limit * POOL_MULTIPLIER)
			.getMany();
		return this.channelEntityService.packMany(this.pickWeighted(channels, limit), me);
	}

	private async getUsers(limit: number, me: Parameters<UserEntityService['packMany']>[1]) {
		const userScore = `(
			LEAST("user"."followersCount", 500) * 1.0
			+ LEAST("user"."notesCount", 300) * 0.2
			+ CASE WHEN "user"."updatedAt" > now() - interval '14 days' THEN 40 ELSE 0 END
			+ CASE WHEN "user"."updatedAt" > now() - interval '60 days' THEN 15 ELSE -25 END
		)`;
		const query = this.usersRepository.createQueryBuilder('user')
			.where('user.host IS NULL')
			.andWhere('user.isSuspended = FALSE')
			.andWhere('user.isDeleted = FALSE')
			.andWhere('user.isBot = FALSE')
			.andWhere('user.notesCount >= 3');
		if (me) {
			// 自分自身と、すでにフォロー済みのユーザーは「おすすめ」から除外する
			// ("user" は予約語なので、生サブクエリ内では必ずクォートする)
			query.andWhere('"user"."id" != :meId', { meId: me.id });
			query.andWhere('NOT EXISTS (SELECT 1 FROM "following" f WHERE f."followerId" = :meId AND f."followeeId" = "user"."id")', { meId: me.id });
		}
		const users = await query
			.addSelect(userScore, 'discovery_user_score')
			.orderBy('discovery_user_score', 'DESC')
			.addOrderBy('"user"."followersCount"', 'DESC')
			.addOrderBy('"user"."notesCount"', 'DESC')
			.limit(limit * POOL_MULTIPLIER)
			.getMany();
		return this.userEntityService.packMany(this.pickWeighted(users, limit), me);
	}
}
