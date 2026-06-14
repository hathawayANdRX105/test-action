/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { UsersRepository, UserProfilesRepository, UserIpsRepository, UserFingerprintsRepository, SigninsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import { TimeService } from '@/global/TimeService.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'array',
		nullable: false, optional: false,
		items: {
			type: 'object',
			nullable: false, optional: false,
			properties: {
				user: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
				email: { type: 'string', optional: false, nullable: true },
				emailVerified: { type: 'boolean', optional: false, nullable: false },
				approved: { type: 'boolean', optional: false, nullable: false },
				suspended: { type: 'boolean', optional: false, nullable: false },
				createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
				lastIp: { type: 'string', optional: false, nullable: true },
				ipCount: { type: 'integer', optional: false, nullable: false },
				fingerprintCount: { type: 'integer', optional: false, nullable: false },
				signinCount: { type: 'integer', optional: false, nullable: false },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', default: 0 },
		sort: { type: 'string', enum: ['+createdAt', '-createdAt', '+updatedAt', '-updatedAt', '+lastActiveDate', '-lastActiveDate', '+follower', '-follower'] },
		state: { type: 'string', enum: ['all', 'alive', 'available', 'admin', 'moderator', 'adminOrModerator', 'suspended', 'approved'], default: 'all' },
		origin: { type: 'string', enum: ['combined', 'local', 'remote'], default: 'local' },
		username: { type: 'string', nullable: true, default: null },
		hostname: { type: 'string', nullable: true, default: null },
		// 追加の絞り込み（管理者の溯源・批量账号定位用）
		email: { type: 'string', nullable: true, default: null },
		ip: { type: 'string', nullable: true, default: null },
		fingerprint: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,
		@Inject(DI.userIpsRepository)
		private userIpsRepository: UserIpsRepository,
		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,
		@Inject(DI.signinsRepository)
		private signinsRepository: SigninsRepository,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private roleService: RoleService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.usersRepository.createQueryBuilder('user');

			switch (ps.state) {
				case 'available': query.where('user.isSuspended = FALSE'); break;
				case 'alive': query.where('user.updatedAt > :date', { date: new Date(this.timeService.now - 1000 * 60 * 60 * 24 * 5) }); break;
				case 'suspended': query.where('user.isSuspended = TRUE'); break;
				case 'approved': query.where('user.approved = FALSE'); break;
				case 'admin': {
					const ids = await this.roleService.getAdministratorIds();
					if (ids.length === 0) return [];
					query.where('user.id IN (:...ids)', { ids });
					break;
				}
				case 'moderator': {
					const ids = await this.roleService.getModeratorIds({ includeAdmins: false });
					if (ids.length === 0) return [];
					query.where('user.id IN (:...ids)', { ids });
					break;
				}
				case 'adminOrModerator': {
					const ids = await this.roleService.getModeratorIds({ includeAdmins: true });
					if (ids.length === 0) return [];
					query.where('user.id IN (:...ids)', { ids });
					break;
				}
			}

			switch (ps.origin) {
				case 'local': query.andWhere('user.host IS NULL'); break;
				case 'remote': query.andWhere('user.host IS NOT NULL'); break;
			}

			if (ps.username) {
				query.andWhere('user.usernameLower like :username', { username: sqlLikeEscape(ps.username.toLowerCase()) + '%' });
			}
			if (ps.hostname) {
				query.andWhere('user.host = :hostname', { hostname: ps.hostname.toLowerCase() });
			}
			if (ps.email) {
				query.andWhere('user.id IN (SELECT up."userId" FROM "user_profile" up WHERE up.email ILIKE :email)', { email: '%' + sqlLikeEscape(ps.email) + '%' });
			}
			if (ps.ip) {
				query.andWhere('user.id IN (SELECT ui."userId" FROM "user_ip" ui WHERE ui.ip ILIKE :ip)', { ip: '%' + sqlLikeEscape(ps.ip) + '%' });
			}
			if (ps.fingerprint) {
				query.andWhere('user.id IN (SELECT uf."userId" FROM "user_fingerprint" uf WHERE uf.fingerprint ILIKE :fp)', { fp: sqlLikeEscape(ps.fingerprint) + '%' });
			}

			switch (ps.sort) {
				case '+follower': query.orderBy('user.followersCount', 'DESC'); break;
				case '-follower': query.orderBy('user.followersCount', 'ASC'); break;
				case '+createdAt': query.orderBy('user.id', 'DESC'); break;
				case '-createdAt': query.orderBy('user.id', 'ASC'); break;
				case '+updatedAt': query.orderBy('user.updatedAt', 'DESC', 'NULLS LAST'); break;
				case '-updatedAt': query.orderBy('user.updatedAt', 'ASC', 'NULLS FIRST'); break;
				case '+lastActiveDate': query.orderBy('user.lastActiveDate', 'DESC', 'NULLS LAST'); break;
				case '-lastActiveDate': query.orderBy('user.lastActiveDate', 'ASC', 'NULLS FIRST'); break;
				default: query.orderBy('user.id', 'DESC'); break;
			}

			query.limit(ps.limit);
			query.offset(ps.offset);

			const users = await query.getMany();
			if (users.length === 0) return [];

			const ids = users.map(u => u.id);

			// バッチで補強データを取得（N+1回避）
			const [profiles, ipCounts, lastIps, fpCounts, signinCounts, packed] = await Promise.all([
				this.userProfilesRepository.findBy({ userId: In(ids) }),
				this.userIpsRepository.createQueryBuilder('x').select('x.userId', 'userId').addSelect('COUNT(*)', 'cnt').where('x.userId IN (:...ids)', { ids }).groupBy('x.userId').getRawMany<{ userId: string; cnt: string }>(),
				this.userIpsRepository.createQueryBuilder('x').select('DISTINCT ON (x."userId") x."userId"', 'userId').addSelect('x.ip', 'ip').where('x.userId IN (:...ids)', { ids }).orderBy('x."userId"').addOrderBy('x.id', 'DESC').getRawMany<{ userId: string; ip: string }>(),
				this.userFingerprintsRepository.createQueryBuilder('x').select('x.userId', 'userId').addSelect('COUNT(*)', 'cnt').where('x.userId IN (:...ids)', { ids }).groupBy('x.userId').getRawMany<{ userId: string; cnt: string }>(),
				this.signinsRepository.createQueryBuilder('x').select('x.userId', 'userId').addSelect('COUNT(*)', 'cnt').where('x.userId IN (:...ids)', { ids }).groupBy('x.userId').getRawMany<{ userId: string; cnt: string }>(),
				this.userEntityService.packMany(users, me, { schema: 'UserLite' }),
			]);

			const profileMap = new Map(profiles.map(p => [p.userId, p]));
			const ipCountMap = new Map(ipCounts.map(r => [r.userId, Number(r.cnt)]));
			const lastIpMap = new Map(lastIps.map(r => [r.userId, r.ip]));
			const fpCountMap = new Map(fpCounts.map(r => [r.userId, Number(r.cnt)]));
			const signinCountMap = new Map(signinCounts.map(r => [r.userId, Number(r.cnt)]));
			const packedMap = new Map(packed.map(p => [p.id, p]));

			return users.map(u => {
				const profile = profileMap.get(u.id);
				return {
					user: packedMap.get(u.id)!,
					email: profile?.email ?? null,
					emailVerified: profile?.emailVerified ?? false,
					approved: u.approved,
					suspended: u.isSuspended,
					createdAt: this.idService.parse(u.id).date.toISOString(),
					lastIp: lastIpMap.get(u.id) ?? null,
					ipCount: ipCountMap.get(u.id) ?? 0,
					fingerprintCount: fpCountMap.get(u.id) ?? 0,
					signinCount: signinCountMap.get(u.id) ?? 0,
				};
			});
		});
	}
}
