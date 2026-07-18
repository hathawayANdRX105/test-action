/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import type { ApiAccessGrantsRepository } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';
import { apiAccessErrors } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['api'],

	requireCredential: true,
	kind: 'write:account',

	limit: {
		duration: 1000 * 60,
		max: 6,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		reason: { type: 'string', minLength: 1, maxLength: 2000 },
		// 申请人希望使用的权限范围(scope)。仅作记录/审核参考。
		permissions: { type: 'array', maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
	},
	required: ['reason'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		@Inject(DI.apiAccessGrantsRepository)
		private readonly apiAccessGrantsRepository: ApiAccessGrantsRepository,

		private readonly idService: IdService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (this.instanceMeta.apiAccessMode === 'closed') {
				throw new ApiError(apiAccessErrors.apiClosed);
			}

			const now = this.timeService.date;
			const current = await this.apiAccessGrantsRepository.findOneBy({ userId: me.id });

			// 申请的权限范围：去重、过滤掉 admin scope、限量记录（仅供审核参考）。
			const requestedPermissions = Array.from(new Set((ps.permissions ?? [])
				.map(p => p.trim())
				.filter(p => p.length > 0 && p.length <= 256 && !p.includes(':admin:'))))
				.slice(0, 80);

			if (current == null) {
				const grant = await this.apiAccessGrantsRepository.insertOne({
					id: this.idService.gen(now.getTime()),
					createdAt: now,
					updatedAt: now,
					userId: me.id,
					status: this.instanceMeta.apiAccessMode === 'open' ? 'approved' : 'pending',
					reason: ps.reason,
					requestedPermissions,
				});

				return {
					id: grant.id,
					status: grant.status,
					reason: grant.reason,
					reviewNote: grant.reviewNote,
					createdAt: grant.createdAt.toISOString(),
					updatedAt: grant.updatedAt.toISOString(),
				};
			}

			if (current.status === 'suspended') {
				throw new ApiError(apiAccessErrors.apiApprovalRequired);
			}

			const status = this.instanceMeta.apiAccessMode === 'open' ? 'approved' : 'pending';
			await this.apiAccessGrantsRepository.update({ id: current.id }, {
				updatedAt: now,
				status,
				reason: ps.reason,
				requestedPermissions,
				reviewNote: null,
				reviewerId: null,
				reviewedAt: null,
			});

			return {
				id: current.id,
				status,
				reason: ps.reason,
				reviewNote: null,
				createdAt: current.createdAt.toISOString(),
				updatedAt: now.toISOString(),
			};
		});
	}
}
