/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import UpdateRemoteUserEndpoint from '@/server/api/endpoints/federation/update-remote-user.js';

describe('federation/update-remote-user endpoint', () => {
	const now = Date.UTC(2026, 0, 1, 0, 0, 0);
	const remoteUserId = '9fbr7p8abc';
	const missingUserId = '9fbr7p8abd';

	function createEndpoint(user: { id: string, lastFetchedAt: Date | null } | null) {
		const cacheService = {
			findOptionalRemoteUserById: jest.fn<(userId: string) => Promise<typeof user>>(async () => user),
		};
		const queueService = {
			createUpdateUserJob: jest.fn<(userId: string) => Promise<void>>(async () => undefined),
		};
		const timeService = {
			now,
		};

		return {
			endpoint: new UpdateRemoteUserEndpoint(cacheService as never, queueService as never, timeService as never),
			cacheService,
			queueService,
		};
	}

	test('queues a remote user update instead of performing it inline', async () => {
		const { endpoint, queueService } = createEndpoint({
			id: remoteUserId,
			lastFetchedAt: null,
		});

		await endpoint.exec({
			userId: remoteUserId,
		}, null as never, null);

		expect(queueService.createUpdateUserJob).toHaveBeenCalledWith(remoteUserId);
	});

	test('skips recently refreshed users at the API edge', async () => {
		const { endpoint, queueService } = createEndpoint({
			id: remoteUserId,
			lastFetchedAt: new Date(now - 1000),
		});

		await endpoint.exec({
			userId: remoteUserId,
		}, null as never, null);

		expect(queueService.createUpdateUserJob).not.toHaveBeenCalled();
	});

	test('rejects unknown users without queueing work', async () => {
		const { endpoint, queueService } = createEndpoint(null);

		await expect(endpoint.exec({
			userId: missingUserId,
		}, null as never, null)).rejects.toMatchObject({
			code: 'NO_SUCH_USER',
		});
		expect(queueService.createUpdateUserJob).not.toHaveBeenCalled();
	});
});
