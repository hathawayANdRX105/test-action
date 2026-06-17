/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NoteArchivesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:note',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		username: { type: 'string', nullable: true, default: null },
		query: { type: 'string', nullable: true, default: null },
		deletedById: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		sinceDate: { type: 'string', nullable: true, default: null },
		untilDate: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteArchivesRepository)
		private noteArchivesRepository: NoteArchivesRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const query = this.noteArchivesRepository.createQueryBuilder('a');

			if (ps.username) query.andWhere('a.username ILIKE :u', { u: sqlLikeEscape(ps.username) + '%' });
			if (ps.query) query.andWhere('a.text ILIKE :q', { q: '%' + sqlLikeEscape(ps.query) + '%' });
			if (ps.deletedById) query.andWhere('a.deletedById = :d', { d: ps.deletedById });
			if (ps.sinceDate) query.andWhere('a.deletedAt >= :since', { since: new Date(ps.sinceDate) });
			if (ps.untilDate) query.andWhere('a.deletedAt <= :until', { until: new Date(ps.untilDate) });

			query.orderBy('a.deletedAt', 'DESC');
			query.limit(ps.limit);
			query.offset(ps.offset);

			const rows = await query.getMany();

			return rows.map(r => ({
				id: r.id,
				noteId: r.noteId,
				userId: r.userId,
				username: r.username,
				userHost: r.userHost,
				text: r.text,
				cw: r.cw,
				visibility: r.visibility,
				fileIds: r.fileIds,
				files: r.files ?? null,
				replyId: r.replyId,
				renoteId: r.renoteId,
				channelId: r.channelId,
				tags: r.tags,
				ip: r.ip,
				fingerprint: r.fingerprint,
				noteCreatedAt: r.noteCreatedAt.toISOString(),
				deletedAt: r.deletedAt.toISOString(),
				deletedById: r.deletedById,
				deletedByUsername: r.deletedByUsername,
				reason: r.reason,
			}));
		});
	}
}
