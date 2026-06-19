/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { QueryService } from '@/core/QueryService.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { IdService } from '@/core/IdService.js';
import { MiLocalUser } from '@/models/User.js';

export const meta = {
	tags: ['users', 'channels', 'notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				channel: {
					type: 'object',
					optional: false, nullable: false,
					ref: 'Channel',
				},
				notesCount: {
					type: 'integer',
					optional: false, nullable: false,
				},
				latestNotedAt: {
					type: 'string',
					optional: false, nullable: false,
					format: 'date-time',
				},
				category: {
					type: 'string',
					optional: false, nullable: true,
				},
			},
		},
	},

	limit: {
		type: 'bucket',
		size: 20,
		dripRate: 250,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 100 },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private queryService: QueryService,
		private channelEntityService: ChannelEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const rows = await this.getUserNoteChannels(ps.userId, ps.limit, me);
			if (rows.length === 0) return [];

			const channels = await this.channelEntityService.packMany(rows.map(row => row.channelId), me);
			const channelById = new Map(channels.map(channel => [channel.id, channel]));

			return rows.map(row => {
				const channel = channelById.get(row.channelId);
				if (channel == null) return null;

				return {
					channel,
					notesCount: Number(row.notesCount),
					latestNotedAt: this.idService.parse(row.latestNoteId).date.toISOString(),
					category: channel.category ?? null,
				};
			}).filter((row): row is NonNullable<typeof row> => row != null);
		});
	}

	private async getUserNoteChannels(userId: string, limit: number, me: MiLocalUser | null) {
		const isSelf = me?.id === userId;
		const query = this.notesRepository.createQueryBuilder('note')
			.select('note.channelId', 'channelId')
			.addSelect('COUNT(note.id)', 'notesCount')
			.addSelect('MAX(note.id)', 'latestNoteId')
			.innerJoin('note.user', 'user')
			.innerJoin('note.channel', 'channel')
			.where('note.userId = :userId', { userId })
			.andWhere('note.channelId IS NOT NULL')
			.groupBy('note.channelId')
			.orderBy('MAX(note.id)', 'DESC')
			.limit(limit);

		this.queryService.generateVisibilityQuery(query, me);
		this.queryService.generateBlockedHostQueryForNote(query, true);
		this.queryService.generateSuspendedUserQueryForNote(query, true);
		this.queryService.generateSilencedUserQueryForNotes(query, me, true);
		if (me) {
			this.queryService.generateMutedUserQueryForNotes(query, me, true);
			this.queryService.generateBlockedUserQueryForNotes(query, me);
			this.queryService.generateMutedNoteThreadQuery(query, me);
		}

		if (!isSelf) {
			query.andWhere('channel.isSensitive = false');
		}

		return await query.getRawMany<{ channelId: string, notesCount: string, latestNoteId: string }>();
	}
}
