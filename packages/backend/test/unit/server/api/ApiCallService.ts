/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { ApiCallService } from '@/server/api/ApiCallService.js';

describe(ApiCallService, () => {
	function createService(apiAccessMode: 'open' | 'closed' = 'open') {
		const meta = {
			id: 'meta-1',
			enableIpLogging: false,
			apiAccessMode,
			apiAllowDeveloperTokens: true,
			apiNoApprovalPermissions: ['write:account'],
			apiPublicPermissions: ['write:account'],
			apiWriteTokenRateLimit: 60,
			apiDefaultTokenRateLimit: 60,
			rootUserId: null,
		};
		const metasRepository = {
			findOneByOrFail: jest.fn(async (_criteria: unknown) => meta),
		};
		const service = new ApiCallService(
			meta as never,
			metasRepository as never,
			{ sentryForBackend: false } as never,
			{} as never,
			{} as never,
			{ findOneBy: jest.fn() } as never,
			{} as never,
			{ limit: jest.fn() } as never,
			{} as never,
			{ logger: { error: jest.fn(), warn: jest.fn() } } as never,
			{ now: 0 } as never,
			{} as never,
			{ env: { NODE_ENV: 'test' } } as never,
			{
				createMemoryKVCache: jest.fn(() => ({
					get: jest.fn(),
					set: jest.fn(),
				})),
			} as never,
		);

		return {
			metasRepository,
			service,
		};
	}

	function createToken(overrides: Record<string, unknown> = {}) {
		return {
			id: 'token-1',
			userId: 'user-1',
			permission: ['write:account'],
			status: 'active',
			app: null,
			...overrides,
		} as never;
	}

	const user = { id: 'user-1' } as never;
	const reply = { header: jest.fn() } as never;

	test('accepts an enabled write scope through the reusable kind-based guard', async () => {
		const { service, metasRepository } = createService();

		await expect(service.assertDeveloperApiAccess('write:account', user, createToken(), reply)).resolves.toBeUndefined();
		expect(metasRepository.findOneByOrFail).toHaveBeenCalledWith({ id: 'meta-1' });
	});

	test('rejects a suspended access token through the reusable guard', async () => {
		const { service } = createService();

		await expect(service.assertDeveloperApiAccess('write:account', user, createToken({ status: 'suspended' }), reply)).rejects.toMatchObject({
			code: 'API_TOKEN_UNAVAILABLE',
		});
	});

	test('rejects a developer token when API access is closed', async () => {
		const { service } = createService('closed');

		await expect(service.assertDeveloperApiAccess('write:account', user, createToken(), reply)).rejects.toMatchObject({
			code: 'API_ACCESS_CLOSED',
		});
	});
});
