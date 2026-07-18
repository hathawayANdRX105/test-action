/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RegistryApiService } from '@/core/RegistryApiService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '../../../error.js';

export const meta = {
	requireCredential: true,
	kind: 'write:account',

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},

	errors: {
		tooManyKeys: {
			message: 'Too many registry keys.',
			code: 'TOO_MANY_REGISTRY_KEYS',
			id: '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		key: { type: 'string', minLength: 1 },
		value: {},
		scope: { type: 'array', default: [], items: {
			type: 'string', pattern: /^[a-zA-Z0-9_]+$/.toString().slice(1, -1),
		} },
		domain: { type: 'string', nullable: true },
	},
	required: ['key', 'value', 'scope'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private registryApiService: RegistryApiService,
	) {
		super(meta, paramDef, async (ps, me, accessToken) => {
			try {
				await this.registryApiService.set(me.id, accessToken ? accessToken.id : (ps.domain ?? null), ps.scope, ps.key, ps.value);
			} catch (err) {
				if (err instanceof IdentifiableError && err.id === '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74') {
					throw new ApiError(meta.errors.tooManyKeys);
				}
				throw err;
			}
		});
	}
}
