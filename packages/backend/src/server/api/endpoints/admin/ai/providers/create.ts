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
		name: { type: 'string', minLength: 1, maxLength: 128 },
		baseUrl: { type: 'string', minLength: 1, maxLength: 1024 },
		apiKey: { type: 'string', maxLength: 4096 },
		isEnabled: { type: 'boolean', default: true },
		models: { type: 'array', items: { type: 'string' }, default: [] },
		defaultModel: { type: 'string', nullable: true, default: null },
		allowedModels: { type: 'array', items: { type: 'string' }, default: [] },
		timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000, default: 30000 },
		maxTokens: { type: 'integer', minimum: 1, maximum: 128000, default: 1024 },
		temperature: { type: 'number', minimum: 0, maximum: 2, default: 0.7 },
	},
	required: ['name', 'baseUrl', 'apiKey'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private readonly aiService: AiService,
	) {
		super(meta, paramDef, async (ps) => {
			return await this.aiService.createProvider(ps);
		});
	}
}
