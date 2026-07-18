/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository, ApiAccessGrantsRepository, AppsRepository, AuthSessionsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, isApprovalRequiredForScopes, isDeveloperApiAccessApproved } from '@/server/api/api-access-utils.js';
import { packOidcUserinfo } from '@/server/oauth/OAuth2ProviderService.js';
import type { Config } from '@/config.js';
import { PUBLIC_TOKEN_MAX_LENGTH } from '@/server/api/input-limits.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['auth'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			accessToken: {
				type: 'string',
				optional: false, nullable: false,
			},

			user: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: { type: 'string' },
					username: { type: 'string' },
					host: { type: 'string', nullable: true },
					avatarUrl: { type: 'string', nullable: true },
					sub: { type: 'string' },
					preferred_username: { type: 'string' },
					name: { type: 'string' },
					picture: { type: 'string', nullable: true },
					profile: { type: 'string' },
				},
			},
		},
	},

	errors: {
		noSuchApp: {
			message: 'No such app.',
			code: 'NO_SUCH_APP',
			id: 'fcab192a-2c5a-43b7-8ad8-9b7054d8d40d',
		},

		noSuchSession: {
			message: 'No such session.',
			code: 'NO_SUCH_SESSION',
			id: '5b5a1503-8bc8-4bd0-8054-dc189e8cdcb3',
		},

		pendingSession: {
			message: 'This session is not completed yet.',
			code: 'PENDING_SESSION',
			id: '8c8a4145-02cc-4cca-8e66-29ba60445a8e',
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		appSecret: { type: 'string', maxLength: PUBLIC_TOKEN_MAX_LENGTH },
		token: { type: 'string', maxLength: PUBLIC_TOKEN_MAX_LENGTH },
	},
	required: ['appSecret', 'token'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.config)
		private readonly config: Config,

		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		@Inject(DI.authSessionsRepository)
		private authSessionsRepository: AuthSessionsRepository,

		@Inject(DI.apiAccessGrantsRepository)
		private readonly apiAccessGrantsRepository: ApiAccessGrantsRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			// Lookup app
			const app = await this.appsRepository.findOneBy({
				secret: ps.appSecret,
			});

			if (app == null) {
				throw new ApiError(meta.errors.noSuchApp);
			}

			if (this.instanceMeta.apiAccessMode === 'closed') {
				throw new ApiError(apiAccessErrors.apiClosed);
			}

			if (app.status !== 'approved') {
				throw new ApiError(apiAccessErrors.apiAppUnavailable);
			}
			// 免申請：アプリの要求スコープが免申請ホワイトリストに収まるなら（=read:profile/read:account だけの
			// "快捷方式"ログイン等）、開発者審批は不要。generate.ts / accept.ts と判定を揃える。
			if (isApprovalRequiredForScopes(this.instanceMeta.apiAccessMode, this.instanceMeta.apiNoApprovalPermissions, app.permission)) {
				const developerApproved = await isDeveloperApiAccessApproved(this.instanceMeta, this.apiAccessGrantsRepository, app.userId);
				if (!developerApproved) {
					throw new ApiError(apiAccessErrors.apiApprovalRequired);
				}
			}

			// Fetch token
			const session = await this.authSessionsRepository.findOneBy({
				token: ps.token,
				appId: app.id,
			});

			if (session == null) {
				throw new ApiError(meta.errors.noSuchSession);
			}

			if (session.userId == null) {
				throw new ApiError(meta.errors.pendingSession);
			}

			// Lookup access token
			const accessToken = await this.accessTokensRepository.findOneOrFail({
				where: {
					appId: app.id,
					userId: session.userId,
				},
				relations: { user: true },
			});

			// Delete session
			await this.authSessionsRepository.delete(session.id);
			const userinfo = packOidcUserinfo(accessToken.user!, this.config.url);

			return {
				accessToken: accessToken.token,
				user: {
					id: userinfo.sub,
					username: userinfo.preferred_username,
					host: null,
					avatarUrl: userinfo.picture,
					...userinfo,
				},
			};
		});
	}
}
