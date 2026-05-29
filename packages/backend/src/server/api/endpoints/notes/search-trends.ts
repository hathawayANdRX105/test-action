/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { SearchTrendService } from '@/core/SearchTrendService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			popularSearches: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
			recentTerms: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
			hashtags: {
				type: 'array',
				optional: false, nullable: false,
				items: { type: 'string', optional: false, nullable: false },
			},
		},
	},

	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private searchTrendService: SearchTrendService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.searchTrendService.getTrends(ps.limit);
		});
	}
}
