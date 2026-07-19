/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ApiError } from '@/server/api/error.js';
import RegistrySetEndpoint, { meta } from '@/server/api/endpoints/i/registry/set.js';

describe('i/registry/set endpoint', () => {
	test('declares TOO_MANY_REGISTRY_KEYS capacity error', () => {
		expect(meta.errors.tooManyKeys).toEqual({
			message: 'Too many registry keys.',
			code: 'TOO_MANY_REGISTRY_KEYS',
			id: '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74',
		});
	});

	test('maps capacity IdentifiableError to declared ApiError (not generic 500)', async () => {
		const registryApiService = {
			set: jest.fn(async () => {
				throw new IdentifiableError('4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74', 'Too many registry keys.');
			}),
		};
		const endpoint = new RegistrySetEndpoint(registryApiService as never);

		await expect(endpoint.exec({
			key: 'overflow',
			value: 1,
			scope: ['client'],
			domain: null,
		}, { id: 'user1' } as never, null)).rejects.toBeInstanceOf(ApiError);

		await expect(endpoint.exec({
			key: 'overflow',
			value: 1,
			scope: ['client'],
			domain: null,
		}, { id: 'user1' } as never, null)).rejects.toMatchObject({
			code: 'TOO_MANY_REGISTRY_KEYS',
			id: '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74',
			kind: 'client',
			message: 'Too many registry keys.',
		});
	});

	test('forwards non-capacity errors unchanged', async () => {
		const boom = new Error('db down');
		const registryApiService = {
			set: jest.fn(async () => {
				throw boom;
			}),
		};
		const endpoint = new RegistrySetEndpoint(registryApiService as never);

		await expect(endpoint.exec({
			key: 'k',
			value: 1,
			scope: ['client'],
		}, { id: 'user1' } as never, null)).rejects.toBe(boom);
	});
});
