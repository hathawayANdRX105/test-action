/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { NotesRepository, UsersRepository, UserIpsRepository, UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

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
			properties: {
				userId: { type: 'string', optional: false, nullable: false },
				username: { type: 'string', optional: false, nullable: true },
				host: { type: 'string', optional: false, nullable: true },
				isSuspended: { type: 'boolean', optional: false, nullable: false },
				localNotesCount: { type: 'integer', optional: false, nullable: false },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		ip: { type: 'string', nullable: true, default: null },
		fingerprint: { type: 'string', nullable: true, default: null },
	},
	anyOf: [
		{ required: ['ip'] },
		{ required: ['fingerprint'] },
	],
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
	) {
		super(meta, paramDef, async (ps) => {
			// 1) 找出共享该 IP / 指纹的全部 userId
			let userIds: string[] = [];
			if (ps.fingerprint) {
				const rows = await this.userFingerprintsRepository.createQueryBuilder('ufp')
					.select('DISTINCT ufp.userId', 'userId')
					.where('ufp.fingerprint = :fp', { fp: ps.fingerprint })
					.getRawMany() as { userId: string }[];
				userIds = rows.map(r => r.userId);
			} else if (ps.ip) {
				const rows = await this.userIpsRepository.createQueryBuilder('uip')
					.select('DISTINCT uip.userId', 'userId')
					.where('uip.ip = :ip', { ip: ps.ip })
					.getRawMany() as { userId: string }[];
				userIds = rows.map(r => r.userId);
			}

			if (userIds.length === 0) return [];

			// 2) 用户基本信息
			const users = await this.usersRepository.findBy({ id: In(userIds) });

			// 3) 各用户本地发帖数（一次聚合）
			const counts = await this.notesRepository.createQueryBuilder('note')
				.select('note.userId', 'userId').addSelect('COUNT(*)', 'cnt')
				.where('note.userId IN (:...userIds)', { userIds })
				.andWhere('note.userHost IS NULL')
				.groupBy('note.userId')
				.getRawMany() as { userId: string; cnt: string }[];
			const countByUser = new Map(counts.map(r => [r.userId, Number(r.cnt)]));

			return users.map(u => ({
				userId: u.id,
				username: u.username,
				host: u.host,
				isSuspended: u.isSuspended,
				localNotesCount: countByUser.get(u.id) ?? 0,
			})).sort((a, b) => b.localNotesCount - a.localNotesCount);
		});
	}
}
