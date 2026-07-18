/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AiService } from '@/core/AiService.js';

export const meta = {
	tags: ['ai'],

	requireCredential: true,
	kind: 'read:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		conversationId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 500, default: 500 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: ['conversationId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.aiService.listMessages(me.id, ps.conversationId, {
				limit: ps.limit,
				offset: ps.offset,
			});
		});
	}
}
