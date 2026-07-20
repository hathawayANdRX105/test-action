/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { ApiError } from '@/server/api/error.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { IdService } from '@/core/IdService.js';
import { NotificationService } from '@/core/NotificationService.js';
import { RoleService } from '@/core/RoleService.js';
import { unique } from '@/misc/prelude/array.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { DI } from '@/di-symbols.js';
import { TimeService } from '@/global/TimeService.js';
import { CacheService } from '@/core/CacheService.js';
import { permissions } from '@/const.js';
import { apiAccessErrors, isAdminApiScope } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH, PUBLIC_APP_DESCRIPTION_MAX_LENGTH, PUBLIC_APP_ICON_URL_MAX_LENGTH, PUBLIC_APP_NAME_MAX_LENGTH, PUBLIC_TOKEN_MAX_LENGTH, PUBLIC_USER_IDS_MAX_ITEMS } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['auth'],

	requireCredential: true,

	secure: true,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'a89abd3d-f0bc-4cce-beb1-2f446f4f1e6a',
		},
		mustBeLocal: {
			message: 'Grantee must be local',
			code: 'MUST_BE_LOCAL',
			id: '403c73e5-6f03-41b4-9394-ac128947f7ae',
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		session: { type: 'string', nullable: true, maxLength: PUBLIC_TOKEN_MAX_LENGTH },
		name: { type: 'string', nullable: true, maxLength: PUBLIC_APP_NAME_MAX_LENGTH },
		description: { type: 'string', nullable: true, maxLength: PUBLIC_APP_DESCRIPTION_MAX_LENGTH },
		iconUrl: { type: 'string', nullable: true, maxLength: PUBLIC_APP_ICON_URL_MAX_LENGTH },
		permission: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: {
			type: 'string', maxLength: API_PERMISSION_MAX_LENGTH,
		} },
		grantees: { type: 'array', uniqueItems: true, maxItems: PUBLIC_USER_IDS_MAX_ITEMS, items: {
			type: 'string', format: 'misskey:id',
		} },
		rank: { type: 'string', enum: ['admin', 'mod', 'user'], nullable: true },
	},
	required: ['session', 'permission'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,


		private idService: IdService,
		private notificationService: NotificationService,
		private readonly roleService: RoleService,
		private readonly timeService: TimeService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Validate grantees
			if (ps.grantees && ps.grantees.length > 0) {
				const grantees = await this.cacheService.findUsersById(ps.grantees);

				if (grantees.size !== ps.grantees.length) {
					throw new ApiError(meta.errors.noSuchUser);
				}

				for (const grantee of grantees.values()) {
					if (grantee.host != null) {
						throw new ApiError(meta.errors.mustBeLocal);
					}
				}
			}

			// First-party mi-auth developer tokens: any non-admin scope in the global
			// permissions catalog (includes read:account). Admin scopes need isAdministrator.
			// Third-party OAuth/app flows still use getApiPublicPermissions elsewhere.
			const isAdmin = await this.roleService.isAdministrator(me);
			const catalog: Set<string> = new Set(permissions);
			const permission = unique(ps.permission.map(v => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')))
				.filter(scope => {
					if (isAdminApiScope(scope)) return isAdmin;
					return catalog.has(scope);
				});
			if (permission.length === 0) {
				throw new ApiError(apiAccessErrors.apiScopeDisabled);
			}

			const requestedRank = ps.rank;
			const rank = requestedRank === 'admin'
				? await this.roleService.isAdministrator(me) ? 'admin' : await this.roleService.isModerator(me) ? 'mod' : 'user'
				: requestedRank === 'mod'
					? await this.roleService.isModerator(me) ? 'mod' : 'user'
					: requestedRank;

			// Generate access token
			const accessToken = secureRndstr(32);

			const now = this.timeService.date;

			// Insert access token doc
			await this.accessTokensRepository.insert({
				id: this.idService.gen(now.getTime()),
				lastUsedAt: now,
				session: ps.session,
				userId: me.id,
				token: accessToken,
				hash: accessToken,
				name: ps.name,
				description: ps.description,
				iconUrl: ps.iconUrl,
				permission,
				rank,
				status: 'active',
				isDeveloperToken: true,
				granteeIds: ps.grantees,
			});

			if (ps.grantees) {
				for (const granteeId of ps.grantees) {
					this.notificationService.createNotification(granteeId, 'sharedAccessGranted', { permCount: permission.length, rank: rank ?? null }, me.id);
				}
			}

			// アクセストークンが生成されたことを通知
			this.notificationService.createNotification(me.id, 'createToken', {});

			return {
				token: accessToken,
			};
		});
	}
}
