/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { AppsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { unique } from '@/misc/prelude/array.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, getApiPublicPermissions, hasUnsafeOAuthRedirectUri, isAdminApiScope, normalizeOAuthRedirectUris } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['api', 'app'],

	requireCredential: true,
	kind: 'write:account',

	errors: {
		noSuchApp: {
			message: 'No such API app.',
			code: 'NO_SUCH_API_APP',
			id: '44a5d61e-622c-4245-bd1a-c8b677b610ab',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		appId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 128 },
		description: { type: 'string', maxLength: 512 },
		permission: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
		callbackUrl: { type: 'string', nullable: true, maxLength: 512 },
		callbackUrls: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 512 } },
		websiteUrl: { type: 'string', nullable: true, maxLength: 1024 },
		iconUrl: { type: 'string', nullable: true, maxLength: 512 },
	},
	required: ['appId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.appsRepository)
		private readonly appsRepository: AppsRepository,

		private readonly appEntityService: AppEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const app = await this.appsRepository.findOneBy({ id: ps.appId, userId: me.id });
			if (app == null) {
				throw new ApiError(meta.errors.noSuchApp);
			}

			const update: Record<string, unknown> = {};
			if (ps.name !== undefined) update.name = ps.name;
			if (ps.description !== undefined) update.description = ps.description;
			if (ps.websiteUrl !== undefined) update.websiteUrl = ps.websiteUrl;
			if (ps.iconUrl !== undefined) update.iconUrl = ps.iconUrl;
			if (ps.permission !== undefined) {
				const publicPermissions = getApiPublicPermissions(this.instanceMeta);
				const permission = unique(ps.permission.map(v => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')))
					.filter(scope => !isAdminApiScope(scope) && publicPermissions.includes(scope));
				if (permission.length === 0) {
					throw new ApiError(apiAccessErrors.apiScopeDisabled);
				}
				update.permission = permission;
			}
			if (ps.callbackUrls !== undefined || ps.callbackUrl !== undefined) {
				const requestedCallbackUrls = ps.callbackUrls !== undefined ? ps.callbackUrls : [ps.callbackUrl ?? ''];
				const rawCallbackUrls = unique(requestedCallbackUrls.map(url => url.trim())).slice(0, 20);
				if (rawCallbackUrls.length === 0 || hasUnsafeOAuthRedirectUri(rawCallbackUrls)) {
					throw new ApiError(apiAccessErrors.apiInvalidRedirectUri);
				}
				const callbackUrls = normalizeOAuthRedirectUris(rawCallbackUrls);
				if (callbackUrls.length === 0) {
					throw new ApiError(apiAccessErrors.apiInvalidRedirectUri);
				}
				update.callbackUrls = callbackUrls;
				update.callbackUrl = callbackUrls[0];
			}

			if (Object.keys(update).length > 0) {
				await this.appsRepository.update({ id: app.id }, update);
			}

			const updated = await this.appsRepository.findOneByOrFail({ id: app.id });
			return await this.appEntityService.pack(updated, me, {
				detail: true,
				includeSecret: true,
			});
		});
	}
}
