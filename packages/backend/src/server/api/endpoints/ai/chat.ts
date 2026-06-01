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

	limit: {
		type: 'bucket',
		size: 10,
		dripRate: 5000,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		conversationId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		providerId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		model: { type: 'string', nullable: true, default: null },
		content: { type: 'string', maxLength: 20000, default: '' },
		fileIds: { type: 'array', items: { type: 'string', format: 'misskey:id' }, default: [] },
		systemPrompt: { type: 'string', nullable: true, default: null },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps, me) => {
			return await this.aiService.streamChat({
				user: me,
				conversationId: ps.conversationId,
				providerId: ps.providerId,
				model: ps.model,
				content: ps.content,
				fileIds: ps.fileIds,
				systemPrompt: ps.systemPrompt,
			});
		});
	}
}
