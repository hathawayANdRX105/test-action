/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { ApiAccessGrantsRepository, AppsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { unique } from '@/misc/prelude/array.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, getApiPublicPermissions, hasUnsafeOAuthRedirectUri, isAdminApiScope, normalizeOAuthRedirectUris } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['api', 'app'],

	requireCredential: true,
	kind: 'write:account',

	limit: {
		duration: 1000 * 5,
		max: 5,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 128 },
		description: { type: 'string', maxLength: 512, default: '' },
		permission: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
		callbackUrl: { type: 'string', nullable: true, maxLength: 512 },
		callbackUrls: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 512 } },
		websiteUrl: { type: 'string', nullable: true, maxLength: 1024 },
		iconUrl: { type: 'string', nullable: true, maxLength: 512 },
	},
	required: ['name', 'permission'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.apiAccessGrantsRepository)
		private readonly apiAccessGrantsRepository: ApiAccessGrantsRepository,

		@Inject(DI.appsRepository)
		private readonly appsRepository: AppsRepository,

		private readonly appEntityService: AppEntityService,
		private readonly idService: IdService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (this.instanceMeta.apiAccessMode === 'closed') {
				throw new ApiError(apiAccessErrors.apiClosed);
			}

			if (this.instanceMeta.apiAccessMode === 'approval') {
				const grant = await this.apiAccessGrantsRepository.findOneBy({ userId: me.id });
				if (grant?.status !== 'approved') {
					throw new ApiError(apiAccessErrors.apiApprovalRequired);
				}
			}

			const publicPermissions = getApiPublicPermissions(this.instanceMeta);
			const permission = unique(ps.permission.map(v => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')))
				.filter(scope => !isAdminApiScope(scope) && publicPermissions.includes(scope));
			if (permission.length === 0) {
				throw new ApiError(apiAccessErrors.apiScopeDisabled);
			}

			const requestedCallbackUrls = ps.callbackUrls !== undefined
				? ps.callbackUrls
				: ps.callbackUrl !== undefined
					? [ps.callbackUrl ?? '']
					: [];
			const rawCallbackUrls = unique(requestedCallbackUrls.map(url => url.trim())).slice(0, 20);
			if (rawCallbackUrls.length === 0 || hasUnsafeOAuthRedirectUri(rawCallbackUrls)) {
				throw new ApiError(apiAccessErrors.apiInvalidRedirectUri);
			}
			const callbackUrls = normalizeOAuthRedirectUris(rawCallbackUrls);
			if (callbackUrls.length === 0) {
				throw new ApiError(apiAccessErrors.apiInvalidRedirectUri);
			}
			const callbackUrl = callbackUrls[0];
			const now = this.timeService.date;
			const approved = !this.instanceMeta.apiRequireAppApproval;
			const app = await this.appsRepository.insertOne({
				id: this.idService.gen(now.getTime()),
				userId: me.id,
				name: ps.name,
				description: ps.description,
				permission,
				callbackUrl,
				callbackUrls,
				status: approved ? 'approved' : 'pending',
				approvedAt: approved ? now : null,
				secret: secureRndstr(32),
				websiteUrl: ps.websiteUrl,
				iconUrl: ps.iconUrl,
			});

			return await this.appEntityService.pack(app, me, {
				detail: true,
				includeSecret: true,
			});
		});
	}
}
