/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { AiService } from '@/core/AiService.js';

export const meta = {
	tags: ['admin', 'ai'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:meta',
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		enableAi: { type: 'boolean' },
		showAiInNavbar: { type: 'boolean' },
		aiDefaultProviderId: { type: 'string', format: 'misskey:id', nullable: true },
		aiMaxContextMessages: { type: 'integer', minimum: 1, maximum: 100 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.aiService.updateSettings(ps);
		});
	}
}
