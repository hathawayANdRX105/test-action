/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { IdService } from '@/core/IdService.js';

// 单次批量删除上限,与 delete-bulk 一致
const MAX_DELETE_PER_CALL = 1000;

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
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
		host: { type: 'string', minLength: 1 },
		// 仅删过去 N 天内的帖子;0 或不传 = 全部(受 MAX_DELETE_PER_CALL 限制)
		sinceDays: { type: 'integer', minimum: 0, maximum: 3650, nullable: true, default: null },
		reason: { type: 'string', nullable: true, default: null },
	},
	required: ['host'],
} as const;

// 按主机批量删除该实例推送过来的本地副本。
// 安全语义:仅删除本站数据库里的远程帖副本,不向上游发 AP Delete(NoteDeleteService:122 已限定)。
// 删除走 NoteDeleteService.delete → 自动归档(NoteArchiveService 现已支持远程) + modlog(deleteNote)。
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
			const host = ps.host.toLowerCase();

			const query = this.notesRepository.createQueryBuilder('note')
				.innerJoinAndSelect('note.user', 'user')
				.where('note.userHost = :host', { host });

			if (ps.sinceDays && ps.sinceDays > 0) {
				const sinceId = this.idService.gen(Date.now() - ps.sinceDays * 86_400_000);
				query.andWhere('note.id >= :sinceId', { sinceId });
			}

			query.limit(MAX_DELETE_PER_CALL);

			const notes = await query.getMany();

			let deleted = 0;
			for (const note of notes) {
				if (!note.user) continue;
				await this.noteDeleteService.delete(note.user, note, me, false, ps.reason ?? null);
				deleted++;
			}

			await this.moderationLogService.log(me, 'deleteRemoteNotesByHost', {
				host,
				sinceDays: ps.sinceDays ?? null,
				count: deleted,
				reason: ps.reason ?? null,
			});

			return { deletedCount: deleted };
		});
	}
}
