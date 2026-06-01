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
	kind: 'write:account',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		conversationId: { type: 'string', format: 'misskey:id' },
	},
	required: ['conversationId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.aiService.deleteConversation(me.id, ps.conversationId);
		});
	}
}
