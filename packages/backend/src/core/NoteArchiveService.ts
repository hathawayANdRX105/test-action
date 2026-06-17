/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NoteArchivesRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiNote } from '@/models/Note.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';

// 帖子删除归档：仅当「管理/审核删除」（deleter !== 作者）且为本地帖时写入快照。
@Injectable()
export class NoteArchiveService {
	constructor(
		@Inject(DI.noteArchivesRepository)
		private noteArchivesRepository: NoteArchivesRepository,

		private idService: IdService,
		private readonly timeService: TimeService,
	) {}

	// 管理/审核删除本地帖时快照归档。失败不应阻断删除主流程。
	@bindThis
	public async archiveOnModerationDelete(note: MiNote, author: MiUser, deleter: MiUser, reason?: string | null): Promise<void> {
		if (note.userHost != null) return; // 仅本地帖

		try {
			await this.noteArchivesRepository.insert({
				noteId: note.id,
				userId: note.userId,
				username: author.username,
				userHost: author.host,
				text: note.text,
				cw: note.cw,
				visibility: note.visibility,
				fileIds: note.fileIds,
				files: null,
				replyId: note.replyId,
				renoteId: note.renoteId,
				channelId: note.channelId,
				tags: note.tags,
				ip: note.ip,
				fingerprint: note.fingerprint,
				noteCreatedAt: this.idService.parse(note.id).date,
				deletedAt: this.timeService.date,
				deletedById: deleter.id,
				deletedByUsername: deleter.username,
				reason: reason ?? null,
				raw: {
					id: note.id,
					userId: note.userId,
					text: note.text,
					cw: note.cw,
					visibility: note.visibility,
					localOnly: note.localOnly,
					reactionAcceptance: note.reactionAcceptance,
					fileIds: note.fileIds,
					visibleUserIds: note.visibleUserIds,
					replyId: note.replyId,
					renoteId: note.renoteId,
					channelId: note.channelId,
					threadId: note.threadId,
					tags: note.tags,
					emojis: note.emojis,
					mentions: note.mentions,
					hasPoll: note.hasPoll,
				},
			} as any); // eslint-disable-line @typescript-eslint/no-explicit-any -- jsonb 快照字段绕过 TypeORM DeepPartial 限制
		} catch {
			// 归档失败不影响删除主流程
		}
	}
}
