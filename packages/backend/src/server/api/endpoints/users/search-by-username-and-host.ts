/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { UserSearchService } from '@/core/UserSearchService.js';
import { PUBLIC_HOST_MAX_LENGTH, PUBLIC_SEARCH_QUERY_MAX_LENGTH } from '@/server/api/input-limits.js';

export const meta = {
	tags: ['users'],

	requireCredential: false,

	description: 'Search for a user by username and/or host.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'User',
		},
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
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		detail: { type: 'boolean', default: true },

		username: { type: 'string', nullable: true, maxLength: PUBLIC_SEARCH_QUERY_MAX_LENGTH },
		host: { type: 'string', nullable: true, maxLength: PUBLIC_HOST_MAX_LENGTH },
	},
	anyOf: [
		{ required: ['username'] },
		{ required: ['host'] },
	],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private userSearchService: UserSearchService,
	) {
		super(meta, paramDef, (ps, me) => {
			return this.userSearchService.searchByUsernameAndHost({
				username: ps.username,
				host: ps.host,
			}, {
				limit: ps.limit,
				detail: ps.detail,
			}, me);
		});
	}
}
