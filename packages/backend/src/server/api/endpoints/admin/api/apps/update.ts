/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { AppsRepository } from '@/models/_.js';
import { unique } from '@/misc/prelude/array.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, hasUnsafeOAuthRedirectUri, normalizeOAuthRedirectUris } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['admin', 'api'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:api',

	errors: {
		noSuchApp: {
			message: 'No such API app.',
			code: 'NO_SUCH_API_APP',
			id: '07268ec4-798d-4c1e-9b66-e1c087fe0539',
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
		callbackUrls: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 512 } },
		rateLimitPerMinute: { type: 'integer', minimum: 1, maximum: 10000, nullable: true },
		reviewNote: { type: 'string', nullable: true, maxLength: 2000 },
	},
	required: ['appId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.appsRepository)
		private readonly appsRepository: AppsRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const app = await this.appsRepository.findOneBy({ id: ps.appId });
			if (app == null) throw new ApiError(meta.errors.noSuchApp);

			const update: Record<string, unknown> = {};
			if (ps.name !== undefined) update.name = ps.name;
			if (ps.description !== undefined) update.description = ps.description;
			if (ps.permission !== undefined) update.permission = unique(ps.permission);
			if (ps.callbackUrls !== undefined) {
				const rawCallbackUrls = unique(ps.callbackUrls.map(url => url.trim())).slice(0, 20);
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
			if (ps.rateLimitPerMinute !== undefined) update.rateLimitPerMinute = ps.rateLimitPerMinute;
			if (ps.reviewNote !== undefined) update.reviewNote = ps.reviewNote;

			if (Object.keys(update).length > 0) {
				await this.appsRepository.update({ id: app.id }, update);
			}
		});
	}
}
