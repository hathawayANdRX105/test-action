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
		id: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 128 },
		baseUrl: { type: 'string', minLength: 1, maxLength: 1024 },
		apiKey: { type: 'string', nullable: true, maxLength: 4096 },
		isEnabled: { type: 'boolean' },
		models: { type: 'array', items: { type: 'string' } },
		defaultModel: { type: 'string', nullable: true },
		allowedModels: { type: 'array', items: { type: 'string' } },
		timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
		maxTokens: { type: 'integer', minimum: 1, maximum: 128000 },
		temperature: { type: 'number', minimum: 0, maximum: 2 },
	},
	required: ['id'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.aiService.updateProvider(ps.id, ps);
		});
	}
}
