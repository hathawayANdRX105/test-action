/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { NotesRepository, UsersRepository, UserIpsRepository, UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserSuspendService } from '@/core/UserSuspendService.js';
import { NoteDeleteService } from '@/core/NoteDeleteService.js';
import { RoleService } from '@/core/RoleService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

const MAX_DELETE_PER_USER = 1000;
const MAX_DELETE_TOTAL = 5000;

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:note',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			bannedUserIds: { type: 'array', optional: false, nullable: false, items: { type: 'string' } },
			deletedNoteCount: { type: 'integer', optional: false, nullable: false },
			skippedModerators: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		ip: { type: 'string', nullable: true, default: null },
		fingerprint: { type: 'string', nullable: true, default: null },
		userIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, nullable: true, default: null },
		deleteNotes: { type: 'boolean', default: true },
		reason: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.userIpsRepository)
		private userIpsRepository: UserIpsRepository,

		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,

		private userSuspendService: UserSuspendService,
		private noteDeleteService: NoteDeleteService,
		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 1) 汇集目标 userId
			const idSet = new Set<string>(ps.userIds ?? []);
			if (ps.fingerprint) {
				const rows = await this.userFingerprintsRepository.createQueryBuilder('ufp')
					.select('DISTINCT ufp.userId', 'userId')
					.where('ufp.fingerprint = :fp', { fp: ps.fingerprint })
					.getRawMany() as { userId: string }[];
				for (const r of rows) idSet.add(r.userId);
			}
			if (ps.ip) {
				const rows = await this.userIpsRepository.createQueryBuilder('uip')
					.select('DISTINCT uip.userId', 'userId')
					.where('uip.ip = :ip', { ip: ps.ip })
					.getRawMany() as { userId: string }[];
				for (const r of rows) idSet.add(r.userId);
			}

			const userIds = [...idSet];
			if (userIds.length === 0) {
				return { bannedUserIds: [], deletedNoteCount: 0, skippedModerators: 0 };
			}

			const users = await this.usersRepository.findBy({ id: In(userIds) });

			const bannedUserIds: string[] = [];
			let deletedNoteCount = 0;
			let skippedModerators = 0;

			for (const user of users) {
				// 保护管理员/审核员
				if (await this.roleService.isModerator(user)) {
					skippedModerators++;
					continue;
				}

				if (!user.isSuspended) {
					await this.userSuspendService.suspend(user, me);
				}
				bannedUserIds.push(user.id);

				if (ps.deleteNotes && deletedNoteCount < MAX_DELETE_TOTAL) {
					const notes = await this.notesRepository.createQueryBuilder('note')
						.where('note.userId = :userId', { userId: user.id })
						.andWhere('note.userHost IS NULL')
						.orderBy('note.id', 'DESC')
						.limit(MAX_DELETE_PER_USER)
						.getMany();
					for (const note of notes) {
						if (deletedNoteCount >= MAX_DELETE_TOTAL) break;
						await this.noteDeleteService.delete(user, note, me, false, ps.reason ?? '紧急封禁（IP/指纹关联）');
						deletedNoteCount++;
					}
				}
			}

			await this.moderationLogService.log(me, 'emergencyBanByFingerprint', {
				ip: ps.ip ?? null,
				fingerprint: ps.fingerprint ?? null,
				bannedUserIds,
				deletedNoteCount,
				reason: ps.reason ?? null,
			});

			return { bannedUserIds, deletedNoteCount, skippedModerators };
		});
	}
}
