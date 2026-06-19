/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In, Brackets } from 'typeorm';
import type { NotesRepository, UsersRepository, UserProfilesRepository, UserIpsRepository, UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { IdService } from '@/core/IdService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:note',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			items: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						note: { type: 'object', optional: false, nullable: false, ref: 'Note' },
						ip: { type: 'string', optional: false, nullable: true },
						fingerprint: { type: 'string', optional: false, nullable: true },
					},
				},
			},
			authors: { type: 'object', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', minimum: 0, default: 0 },
		sort: { type: 'string', enum: ['+createdAt', '-createdAt'], default: '+createdAt' },
		// 帖子来源:local=仅本地;remote=仅远程(联邦推送);all=两者
		// 默认 local 保持原有「全部帖子」区零回归
		scope: { type: 'string', enum: ['local', 'remote', 'all'], default: 'local' },
		// 限定具体远程主机(如 misskey.io),仅在 scope!=local 时生效
		host: { type: 'string', nullable: true, default: null },
		// 综合搜索：一个框同时匹配 正文 / 用户名 / 帖子ID / IP / 指纹(本地)或 host(远程)
		search: { type: 'string', nullable: true, default: null },
		query: { type: 'string', nullable: true, default: null },
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		username: { type: 'string', nullable: true, default: null },
		visibility: { type: 'string', enum: ['all', 'public', 'home', 'followers', 'specified'], default: 'all' },
		withFiles: { type: 'boolean', default: false },
		repliesOnly: { type: 'boolean', default: false },
		renotesOnly: { type: 'boolean', default: false },
		reportedOnly: { type: 'boolean', default: false },
		ip: { type: 'string', nullable: true, default: null },
		fingerprint: { type: 'string', nullable: true, default: null },
		sinceDate: { type: 'string', nullable: true, default: null },
		untilDate: { type: 'string', nullable: true, default: null },
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

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.userIpsRepository)
		private userIpsRepository: UserIpsRepository,

		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,

		private noteEntityService: NoteEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.notesRepository.createQueryBuilder('note')
				.innerJoinAndSelect('note.user', 'user');

			// 帖子来源(scope):local=仅本地;remote=仅远程联邦帖;all=两者
			if (ps.scope === 'local') {
				query.andWhere('note.userHost IS NULL');
			} else if (ps.scope === 'remote') {
				query.andWhere('note.userHost IS NOT NULL');
				if (ps.host) query.andWhere('note.userHost = :host', { host: ps.host.toLowerCase() });
			} else if (ps.host) {
				// scope=all 时也允许按 host 过滤(host 提供→只看该主机)
				query.andWhere('note.userHost = :host', { host: ps.host.toLowerCase() });
			}

			if (ps.search) {
				const s = ps.search.trim();
				query.andWhere(new Brackets(qb => {
					qb.orWhere('note.text ILIKE :s', { s: '%' + sqlLikeEscape(s) + '%' })
						.orWhere('user.usernameLower ILIKE :su', { su: '%' + sqlLikeEscape(s.toLowerCase()) + '%' })
						.orWhere('note.id = :sid', { sid: s })
						.orWhere('note.ip = :sip', { sip: s })
						.orWhere('note.fingerprint = :sfp', { sfp: s })
						.orWhere('note.userHost ILIKE :shost', { shost: '%' + sqlLikeEscape(s.toLowerCase()) + '%' });
				}));
			}
			if (ps.userId) query.andWhere('note.userId = :userId', { userId: ps.userId });
			if (ps.username) query.andWhere('user.usernameLower like :username', { username: sqlLikeEscape(ps.username.toLowerCase()) + '%' });
			if (ps.query) query.andWhere('note.text ILIKE :q', { q: '%' + sqlLikeEscape(ps.query) + '%' });
			if (ps.visibility !== 'all') query.andWhere('note.visibility = :vis', { vis: ps.visibility });
			if (ps.withFiles) query.andWhere('note.fileIds != \'{}\'');
			if (ps.repliesOnly) query.andWhere('note.replyId IS NOT NULL');
			if (ps.renotesOnly) query.andWhere('note.renoteId IS NOT NULL');
			if (ps.ip) query.andWhere('note.ip = :ip', { ip: ps.ip });
			if (ps.fingerprint) query.andWhere('note.fingerprint = :fp', { fp: ps.fingerprint });
			if (ps.reportedOnly) {
				query.andWhere('note.userId IN (SELECT "targetUserId" FROM "abuse_user_report" WHERE "resolved" = false)');
			}
			if (ps.sinceDate) query.andWhere('note.id >= :sinceId', { sinceId: this.idService.gen(new Date(ps.sinceDate).getTime()) });
			if (ps.untilDate) query.andWhere('note.id <= :untilId', { untilId: this.idService.gen(new Date(ps.untilDate).getTime()) });

			query.orderBy('note.id', ps.sort === '+createdAt' ? 'DESC' : 'ASC');
			query.limit(ps.limit);
			query.offset(ps.offset);

			const notes = await query.getMany();

			// note.ip / note.fingerprint（仅本地帖记录，管理员可见）
			const ipById = new Map(notes.map(n => [n.id, n.ip]));
			const fpById = new Map(notes.map(n => [n.id, n.fingerprint]));

			const packed = await this.noteEntityService.packMany(notes, me, { detail: true });

			const items = packed.map(p => ({
				note: p,
				ip: ipById.get(p.id) ?? null,
				fingerprint: fpById.get(p.id) ?? null,
			}));

			// 作者身份摘要（一次性聚合，避免 N+1）
			const userIds = [...new Set(notes.map(n => n.userId))];
			const authors: Record<string, {
				isSuspended: boolean; isSilenced: boolean; emailVerified: boolean;
				notesCount: number; ipCount: number; fingerprintCount: number;
			}> = {};

			if (userIds.length > 0) {
				const users = await this.usersRepository.findBy({ id: In(userIds) });
				const profiles = await this.userProfilesRepository.findBy({ userId: In(userIds) });
				const emailVerifiedByUser = new Map(profiles.map(p => [p.userId, p.emailVerified]));

				const ipCounts = await this.userIpsRepository.createQueryBuilder('uip')
					.select('uip.userId', 'userId').addSelect('COUNT(DISTINCT uip.ip)', 'cnt')
					.where('uip.userId IN (:...userIds)', { userIds })
					.groupBy('uip.userId').getRawMany() as { userId: string; cnt: string }[];
				const ipCountByUser = new Map(ipCounts.map(r => [r.userId, Number(r.cnt)]));

				const fpCounts = await this.userFingerprintsRepository.createQueryBuilder('ufp')
					.select('ufp.userId', 'userId').addSelect('COUNT(DISTINCT ufp.fingerprint)', 'cnt')
					.where('ufp.userId IN (:...userIds)', { userIds })
					.groupBy('ufp.userId').getRawMany() as { userId: string; cnt: string }[];
				const fpCountByUser = new Map(fpCounts.map(r => [r.userId, Number(r.cnt)]));

				for (const u of users) {
					authors[u.id] = {
						isSuspended: u.isSuspended,
						isSilenced: u.isSilenced,
						emailVerified: emailVerifiedByUser.get(u.id) ?? false,
						notesCount: u.notesCount,
						ipCount: ipCountByUser.get(u.id) ?? 0,
						fingerprintCount: fpCountByUser.get(u.id) ?? 0,
					};
				}
			}

			return { items, authors };
		});
	}
}
