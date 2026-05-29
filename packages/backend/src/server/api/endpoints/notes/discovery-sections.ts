/*
 * SPDX-FileCopyrightText: hhhl contributors
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
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';

const DISCOVERY_WINDOW = 1000 * 60 * 60 * 24 * 14;

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
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const sinceId = this.idService.gen(this.timeService.now - DISCOVERY_WINDOW);
			const [trends, coverNotes, hotNotes, tutorialNotes, channels, users] = await Promise.all([
				this.searchTrendService.getTrends(ps.limit),
				this.getCoverNotes(sinceId, ps.limit, me),
				this.getHotNotes(sinceId, ps.limit, me),
				this.getTutorialNotes(sinceId, ps.limit, me),
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

	private baseNotesQuery(sinceId: string, me: Parameters<QueryService['generateVisibilityQuery']>[1]) {
		const query = this.notesRepository.createQueryBuilder('note')
			.where('note.id > :sinceId', { sinceId })
			.andWhere('note.visibility = \'public\'')
			.innerJoinAndSelect('note.user', 'user')
			.leftJoinAndSelect('note.reply', 'reply')
			.leftJoinAndSelect('note.renote', 'renote')
			.leftJoinAndSelect('reply.user', 'replyUser')
			.leftJoinAndSelect('renote.user', 'renoteUser')
			.leftJoinAndSelect('note.channel', 'channel');
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

	private async getCoverNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1]) {
		const query = this.baseNotesQuery(sinceId, me)
			.andWhere('note.fileIds != \'{}\'')
			.andWhere('user.isBot = FALSE')
			.orderBy('(note."repliesCount" * 5 + note."renoteCount" * 4 + note."clippedCount" * 5)', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.limit(limit);
		return this.noteEntityService.packMany(await query.getMany(), me);
	}

	private async getHotNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1]) {
		const query = this.baseNotesQuery(sinceId, me)
			.andWhere('user.isBot = FALSE')
			.andWhere('LENGTH(COALESCE(note.text, \'\')) >= 8')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note."repliesCount" > 0');
				qb.orWhere('note."renoteCount" > 0');
				qb.orWhere('note."clippedCount" > 0');
				qb.orWhere('note."channelId" IS NOT NULL');
			}))
			.orderBy('(note."repliesCount" * 5 + note."renoteCount" * 4 + note."clippedCount" * 5 + CASE WHEN note."channelId" IS NOT NULL THEN 4 ELSE 0 END)', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.limit(limit);
		return this.noteEntityService.packMany(await query.getMany(), me);
	}

	private async getTutorialNotes(sinceId: string, limit: number, me: Parameters<NoteEntityService['packMany']>[1]) {
		const query = this.baseNotesQuery(sinceId, me)
			.andWhere('user.isBot = FALSE')
			.andWhere(new Brackets(qb => {
				qb.orWhere('note.tags && CAST(:tutorialTags AS varchar[])');
				qb.orWhere('LOWER(COALESCE(note.text, \'\')) ~ :tutorialPattern');
			}))
			.setParameter('tutorialTags', ['教程', 'AI', 'ai', 'Token', 'token', 'Key', 'key', '资源'])
			.setParameter('tutorialPattern', '教程|指南|配置|部署|api|claude|codex|ai|token|key|资源')
			.orderBy('(note."repliesCount" * 5 + note."renoteCount" * 4 + note."clippedCount" * 5 + CASE WHEN note."channelId" IS NOT NULL THEN 8 ELSE 0 END)', 'DESC')
			.addOrderBy('note.id', 'DESC')
			.limit(limit);
		return this.noteEntityService.packMany(await query.getMany(), me);
	}

	private async getChannels(limit: number, me: Parameters<ChannelEntityService['packMany']>[1]) {
		const channels = await this.channelsRepository.createQueryBuilder('channel')
			.where('channel.isArchived = FALSE')
			.andWhere('channel.isSensitive = FALSE')
			.andWhere('channel."notesCount" > 0')
			.orderBy('channel."notesCount"', 'DESC')
			.addOrderBy('channel.lastNotedAt', 'DESC', 'NULLS LAST')
			.limit(limit)
			.getMany();
		return this.channelEntityService.packMany(channels, me);
	}

	private async getUsers(limit: number, me: Parameters<UserEntityService['packMany']>[1]) {
		const users = await this.usersRepository.createQueryBuilder('user')
			.where('user.host IS NULL')
			.andWhere('user.isSuspended = FALSE')
			.andWhere('user.isDeleted = FALSE')
			.andWhere('user.isBot = FALSE')
			.orderBy('"user"."followersCount"', 'DESC')
			.addOrderBy('"user"."notesCount"', 'DESC')
			.limit(limit)
			.getMany();
		return this.userEntityService.packMany(users, me);
	}
}
