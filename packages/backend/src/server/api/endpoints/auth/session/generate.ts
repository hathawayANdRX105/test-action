/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ApiAccessGrantsRepository, AppsRepository, AuthSessionsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors, isApprovalRequiredForScopes, isDeveloperApiAccessApproved } from '@/server/api/api-access-utils.js';
import { PUBLIC_TOKEN_MAX_LENGTH } from '@/server/api/input-limits.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['auth'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			token: {
				type: 'string',
				optional: false, nullable: false,
			},
			url: {
				type: 'string',
				optional: false, nullable: false,
				format: 'url',
			},
		},
	},

	errors: {
		noSuchApp: {
			message: 'No such app.',
			code: 'NO_SUCH_APP',
			id: '92f93e63-428e-4f2f-a5a4-39e1407fe998',
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
	},
	required: ['appSecret'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.appsRepository)
		private appsRepository: AppsRepository,

		@Inject(DI.apiAccessGrantsRepository)
		private readonly apiAccessGrantsRepository: ApiAccessGrantsRepository,

		@Inject(DI.authSessionsRepository)
		private authSessionsRepository: AuthSessionsRepository,

		private idService: IdService,
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
			// 免申请：应用请求的 scope 全在免申请白名单内时跳过开发者审批。
			if (isApprovalRequiredForScopes(this.instanceMeta.apiAccessMode, this.instanceMeta.apiNoApprovalPermissions, app.permission)) {
				const developerApproved = await isDeveloperApiAccessApproved(this.instanceMeta, this.apiAccessGrantsRepository, app.userId);
				if (!developerApproved) {
					throw new ApiError(apiAccessErrors.apiApprovalRequired);
				}
			}

			// Generate token
			const token = randomUUID();

			// Create session token document
			const doc = await this.authSessionsRepository.insertOne({
				id: this.idService.gen(),
				appId: app.id,
				token: token,
			});

			return {
				token: doc.token,
				url: `${this.config.authUrl}/${doc.token}`,
			};
		});
	}
}
