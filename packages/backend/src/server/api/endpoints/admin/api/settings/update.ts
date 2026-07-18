/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaService } from '@/core/MetaService.js';
import { apiAccessModes } from '@/const.js';
import { getApiNoApprovalPermissions, getApiPublicPermissions, normalizeApiPermissions } from '@/server/api/api-access-utils.js';
import { API_PERMISSION_MAX_ITEMS, API_PERMISSION_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['admin', 'api'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:api',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		mode: { type: 'string', enum: apiAccessModes },
		oauthEnabled: { type: 'boolean' },
		oidcEnabled: { type: 'boolean' },
		requireAppApproval: { type: 'boolean' },
		publicPermissions: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
		noApprovalPermissions: { type: 'array', uniqueItems: true, maxItems: API_PERMISSION_MAX_ITEMS, items: { type: 'string', maxLength: API_PERMISSION_MAX_LENGTH } },
		allowDeveloperTokens: { type: 'boolean' },
		defaultTokenRateLimit: { type: 'integer', minimum: 0, maximum: 100000 },
		writeTokenRateLimit: { type: 'integer', minimum: 0, maximum: 100000 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly metaService: MetaService,
	) {
		super(meta, paramDef, async (ps) => {
			const update = {
				...(ps.mode !== undefined ? { apiAccessMode: ps.mode } : {}),
				...(ps.oauthEnabled !== undefined ? { enableOAuthLogin: ps.oauthEnabled } : {}),
				...(ps.oidcEnabled !== undefined ? { enableOidc: ps.oidcEnabled } : {}),
				...(ps.requireAppApproval !== undefined ? { apiRequireAppApproval: ps.requireAppApproval } : {}),
				...(ps.publicPermissions !== undefined ? { apiPublicPermissions: normalizeApiPermissions(ps.publicPermissions) } : {}),
				...(ps.noApprovalPermissions !== undefined ? { apiNoApprovalPermissions: normalizeApiPermissions(ps.noApprovalPermissions) } : {}),
				...(ps.allowDeveloperTokens !== undefined ? { apiAllowDeveloperTokens: ps.allowDeveloperTokens } : {}),
				...(ps.defaultTokenRateLimit !== undefined ? { apiDefaultTokenRateLimit: ps.defaultTokenRateLimit } : {}),
				...(ps.writeTokenRateLimit !== undefined ? { apiWriteTokenRateLimit: ps.writeTokenRateLimit } : {}),
			};

			const updated = await this.metaService.update(update);

			return {
				mode: updated.apiAccessMode,
				oauthEnabled: updated.enableOAuthLogin,
				oidcEnabled: updated.enableOidc,
				requireAppApproval: updated.apiRequireAppApproval,
				publicPermissions: getApiPublicPermissions(updated),
				noApprovalPermissions: getApiNoApprovalPermissions(updated),
				allowDeveloperTokens: updated.apiAllowDeveloperTokens,
				defaultTokenRateLimit: updated.apiDefaultTokenRateLimit,
				writeTokenRateLimit: updated.apiWriteTokenRateLimit,
			};
		});
	}
}
