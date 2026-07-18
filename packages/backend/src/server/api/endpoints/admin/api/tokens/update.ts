/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { AccessTokensRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { normalizeApiPermissions } from '@/server/api/api-access-utils.js';
import { accessTokenRanks } from '@/models/AccessToken.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['admin', 'api'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:api',

	errors: {
		noSuchToken: {
			message: 'No such token.',
			code: 'NO_SUCH_TOKEN',
			id: 'b6f5a1e2-3c4d-4e5f-9a0b-1c2d3e4f5a6b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		tokenId: { type: 'string', format: 'misskey:id' },
		permission: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
		rank: { type: 'string', enum: accessTokenRanks, nullable: true },
		rateLimitPerMinute: { type: 'integer', minimum: 0, maximum: 100000, nullable: true },
		name: { type: 'string', nullable: true, maxLength: 128 },
	},
	required: ['tokenId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.accessTokensRepository)
		private readonly accessTokensRepository: AccessTokensRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const token = await this.accessTokensRepository.findOneBy({ id: ps.tokenId });
			if (token == null) throw new ApiError(meta.errors.noSuchToken);

			const update: Partial<{ permission: string[]; rank: typeof accessTokenRanks[number] | null; rateLimitPerMinute: number | null; name: string | null; }> = {};
			if (ps.permission !== undefined) {
				// admin scope は与えない（normalizeApiPermissions が :admin: を除外）。
				update.permission = normalizeApiPermissions(ps.permission);
			}
			if (ps.rank !== undefined) update.rank = ps.rank;
			if (ps.rateLimitPerMinute !== undefined) update.rateLimitPerMinute = ps.rateLimitPerMinute;
			if (ps.name !== undefined) update.name = ps.name;

			if (Object.keys(update).length > 0) {
				await this.accessTokensRepository.update({ id: ps.tokenId }, update);
			}
		});
	}
}
