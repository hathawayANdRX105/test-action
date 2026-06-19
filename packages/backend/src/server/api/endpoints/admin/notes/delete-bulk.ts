/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Brackets } from 'typeorm';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { IdService } from '@/core/IdService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

const MAX_FILTER_DELETE = 1000;

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:note',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			deletedCount: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 显式 id 列表
		noteIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, nullable: true, default: null },
		// 或按筛选条件批量删除（仅本地帖，最多 1000 条）
		filter: {
			type: 'object',
			nullable: true,
			default: null,
			properties: {
				search: { type: 'string', nullable: true },
				userId: { type: 'string', format: 'misskey:id', nullable: true },
				username: { type: 'string', nullable: true },
				query: { type: 'string', nullable: true },
				// 帖子来源,与 admin/notes/list 一致;默认 'local' 保持向后兼容
				scope: { type: 'string', enum: ['local', 'remote', 'all'] },
				host: { type: 'string', nullable: true },
				visibility: { type: 'string', enum: ['all', 'public', 'home', 'followers', 'specified'] },
				withFiles: { type: 'boolean' },
				repliesOnly: { type: 'boolean' },
				renotesOnly: { type: 'boolean' },
				ip: { type: 'string', nullable: true },
				fingerprint: { type: 'string', nullable: true },
				reportedOnly: { type: 'boolean' },
				sinceDate: { type: 'string', nullable: true },
				untilDate: { type: 'string', nullable: true },
			},
		},
		reason: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteDeleteService: NoteDeleteService,
		private moderationLogService: ModerationLogService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.notesRepository.createQueryBuilder('note')
				.innerJoinAndSelect('note.user', 'user');

			// 显式 noteIds:不强制 scope,可混合本地/远程(管理员的选中行更直接)
			// filter 模式:按 filter.scope(默认 local) + 可选 host 限定范围
			if (ps.noteIds && ps.noteIds.length > 0) {
				query.andWhere('note.id IN (:...noteIds)', { noteIds: ps.noteIds });
			} else if (ps.filter) {
				const f = ps.filter;
				const scope = f.scope ?? 'local';
				if (scope === 'local') {
					query.andWhere('note.userHost IS NULL');
				} else if (scope === 'remote') {
					query.andWhere('note.userHost IS NOT NULL');
					if (f.host) query.andWhere('note.userHost = :host', { host: f.host.toLowerCase() });
				} else if (f.host) {
					query.andWhere('note.userHost = :host', { host: f.host.toLowerCase() });
				}
				if (f.search) {
					const s = f.search.trim();
					query.andWhere(new Brackets(qb => {
						qb.orWhere('note.text ILIKE :s', { s: '%' + sqlLikeEscape(s) + '%' })
							.orWhere('user.usernameLower ILIKE :su', { su: '%' + sqlLikeEscape(s.toLowerCase()) + '%' })
							.orWhere('note.id = :sid', { sid: s })
							.orWhere('note.ip = :sip', { sip: s })
							.orWhere('note.fingerprint = :sfp', { sfp: s });
					}));
				}
				if (f.userId) query.andWhere('note.userId = :userId', { userId: f.userId });
				if (f.username) query.andWhere('user.usernameLower like :username', { username: sqlLikeEscape(f.username.toLowerCase()) + '%' });
				if (f.query) query.andWhere('note.text ILIKE :q', { q: '%' + sqlLikeEscape(f.query) + '%' });
				if (f.visibility && f.visibility !== 'all') query.andWhere('note.visibility = :vis', { vis: f.visibility });
				if (f.withFiles) query.andWhere('note.fileIds != \'{}\'');
				if (f.repliesOnly) query.andWhere('note.replyId IS NOT NULL');
				if (f.renotesOnly) query.andWhere('note.renoteId IS NOT NULL');
				if (f.ip) query.andWhere('note.ip = :ip', { ip: f.ip });
				if (f.fingerprint) query.andWhere('note.fingerprint = :fp', { fp: f.fingerprint });
				if (f.reportedOnly) query.andWhere('note.userId IN (SELECT "targetUserId" FROM "abuse_user_report" WHERE "resolved" = false)');
				if (f.sinceDate) query.andWhere('note.id >= :sinceId', { sinceId: this.idService.gen(new Date(f.sinceDate).getTime()) });
				if (f.untilDate) query.andWhere('note.id <= :untilId', { untilId: this.idService.gen(new Date(f.untilDate).getTime()) });
				query.limit(MAX_FILTER_DELETE);
			} else {
				return { deletedCount: 0 };
			}

			const notes = await query.getMany();

			let deleted = 0;
			for (const note of notes) {
				if (!note.user) continue;
				await this.noteDeleteService.delete(note.user, note, me, false, ps.reason ?? null);
				deleted++;
			}

			await this.moderationLogService.log(me, 'deleteNotesBulk', {
				count: deleted,
				noteIds: notes.slice(0, 100).map(n => n.id),
				reason: ps.reason ?? null,
				byFilter: ps.noteIds == null,
			});

			return { deletedCount: deleted };
		});
	}
}
