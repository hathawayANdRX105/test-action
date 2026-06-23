/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { MiNote } from '@/models/Note.js';
import type { NoteArchivesRepository, NotesRepository, UsersRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { SearchService } from '@/core/SearchService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:note',

	errors: {
		noSuchArchive: {
			message: 'No such archived note.',
			code: 'NO_SUCH_ARCHIVE',
			id: 'b2c3d4e5-0001-4a1b-9c2d-0e1f2a3b4c5d',
		},
		alreadyExists: {
			message: 'A note with that id already exists.',
			code: 'NOTE_ALREADY_EXISTS',
			id: 'b2c3d4e5-0002-4a1b-9c2d-0e1f2a3b4c5d',
		},
		userGone: {
			message: 'The author no longer exists.',
			code: 'AUTHOR_GONE',
			id: 'b2c3d4e5-0003-4a1b-9c2d-0e1f2a3b4c5d',
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			restoredNoteId: { type: 'string', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// note_archive.id 是 PrimaryGeneratedColumn(实际 PG bigserial),
		// 前端从 admin/notes/archived-list 拿到的会是 JSON number,所以两种都接,
		// 内部统一成 string 交给 TypeORM(PG 隐式 cast 没问题)
		id: { anyOf: [{ type: 'string' }, { type: 'integer' }] },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteArchivesRepository)
		private noteArchivesRepository: NoteArchivesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private searchService: SearchService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const archiveId = typeof ps.id === 'number' ? String(ps.id) : ps.id;
			const archive = await this.noteArchivesRepository.findOneBy({ id: archiveId });
			if (archive == null) throw new ApiError(meta.errors.noSuchArchive);

			const exists = await this.notesRepository.countBy({ id: archive.noteId });
			if (exists > 0) throw new ApiError(meta.errors.alreadyExists);

			const author = await this.usersRepository.findOneBy({ id: archive.userId });
			if (author == null) throw new ApiError(meta.errors.userGone);

			const raw = (archive.raw ?? {}) as Record<string, any>;

			// 尽力恢复：用快照重建本地帖（保留原 id 与 reply/renote/channel 关系）。
			// 注意：不重新联邦投递、投票/反应不可恢复；用于本地内容找回。
			const reply = archive.replyId ? await this.notesRepository.findOneBy({ id: archive.replyId }) : null;
			const renote = archive.renoteId ? await this.notesRepository.findOneBy({ id: archive.renoteId }) : null;

			const note = new MiNote({
				id: archive.noteId,
				updatedAt: null,
				userId: archive.userId,
				// 远程帖恢复时保留原 host(归档时已存入);本地帖 archive.userHost 本来就是 null
				userHost: archive.userHost,
				text: archive.text,
				cw: archive.cw,
				name: raw.name ?? null,
				visibility: archive.visibility as MiNote['visibility'],
				localOnly: raw.localOnly ?? false,
				reactionAcceptance: raw.reactionAcceptance ?? null,
				visibleUserIds: raw.visibleUserIds ?? [],
				fileIds: archive.fileIds ?? [],
				attachedFileTypes: [],
				mentions: raw.mentions ?? [],
				mentionedRemoteUsers: '[]',
				emojis: raw.emojis ?? [],
				tags: archive.tags ?? [],
				hasPoll: false,
				threadId: raw.threadId ?? null,
				channelId: archive.channelId,
				replyId: archive.replyId,
				renoteId: archive.renoteId,
				replyUserId: reply?.userId ?? null,
				replyUserHost: reply?.userHost ?? null,
				renoteUserId: renote?.userId ?? null,
				renoteUserHost: renote?.userHost ?? null,
				reactions: {},
				reactionAndUserPairCache: [],
				renoteCount: 0,
				repliesCount: 0,
				clippedCount: 0,
				ip: archive.ip,
				fingerprint: archive.fingerprint,
			});

			await this.notesRepository.insert(note);
			// notesCount 是本地用户的字段;远程作者不在本站,跳过自增
			if (archive.userHost == null) {
				await this.usersRepository.increment({ id: archive.userId }, 'notesCount', 1);
			}
			await this.searchService.indexNote(note).catch(() => { /* best-effort */ });
			await this.noteArchivesRepository.delete({ id: archiveId });

			await this.moderationLogService.log(me, 'restoreNote', {
				noteId: archive.noteId,
				userId: archive.userId,
			});

			return { restoredNoteId: archive.noteId };
		});
	}
}
