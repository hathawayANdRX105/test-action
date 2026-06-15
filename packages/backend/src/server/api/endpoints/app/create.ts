/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { AppsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import { unique } from '@/misc/prelude/array.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { AppEntityService } from '@/core/entities/AppEntityService.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, getApiPublicPermissions, hasUnsafeOAuthRedirectUri, isAdminApiScope, isApprovalRequiredForScopes, normalizeOAuthRedirectUris } from '@/server/api/api-access-utils.js';

export const meta = {
	tags: ['app'],

	// requireCredential を true にすると kind(scope) が必須になり、かつトークン経由の作成まで塞いでしまう。
	// ここでは false のまま、ハンドラ冒頭で me==null（＝匿名）を弾くことで「必ず作成者(オーナー)に紐づく」ことを保証する。
	// （匿名作成を許すと owner=null の "中転/収割" アプリが量産されるため）
	requireCredential: false,

	errors: {
		credentialRequired: {
			message: 'Credential required to create an app.',
			code: 'CREDENTIAL_REQUIRED',
			id: '1384574d-a912-4b81-8601-c7b1c4085df1',
			httpStatusCode: 401,
		},
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		ref: 'App',
	},

	// 3 calls per second
	limit: {
		duration: 1000,
		max: 3,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		name: { type: 'string' },
		description: { type: 'string' },
		permission: { type: 'array', uniqueItems: true, items: {
			type: 'string',
		} },
		callbackUrl: { type: 'string', nullable: true, maxLength: 512 },
		callbackUrls: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 512 } },
	},
	required: ['name', 'description', 'permission'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		private appEntityService: AppEntityService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			// 匿名でのアプリ作成を禁止（owner=null の中転/収割アプリ量産を根本から防ぐ）。
			if (me == null) {
				throw new ApiError(meta.errors.credentialRequired);
			}

			if (this.instanceMeta.apiAccessMode === 'closed') {
				throw new ApiError(apiAccessErrors.apiClosed);
			}

			// for backward compatibility
			const publicPermissions = getApiPublicPermissions(this.instanceMeta);
			const permission = unique(ps.permission.map(v => v.replace(/^(.+)(\/|-)(read|write)$/, '$3:$1')))
				.filter(scope => !isAdminApiScope(scope) && publicPermissions.includes(scope));
			if (permission.length === 0) {
				throw new ApiError(apiAccessErrors.apiScopeDisabled);
			}

			// approval モード時、要求スコープが免申請ホワイトリストに収まらない（or 管理者がアプリ審批必須）なら審批要求。
			if (isApprovalRequiredForScopes(this.instanceMeta.apiAccessMode, this.instanceMeta.apiNoApprovalPermissions, permission) || this.instanceMeta.apiRequireAppApproval) {
				throw new ApiError(apiAccessErrors.apiApprovalRequired);
			}

			// Generate secret
			const secret = secureRndstr(32);

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

			// Create account
			const app = await this.appsRepository.insertOne({
				id: this.idService.gen(),
				userId: me.id,
				name: ps.name,
				description: ps.description,
				permission,
				callbackUrl,
				callbackUrls,
				status: 'approved',
				approvedAt: new Date(),
				secret: secret,
			});

			return await this.appEntityService.pack(app, me, {
				detail: true,
				includeSecret: true,
			});
		});
	}
}
