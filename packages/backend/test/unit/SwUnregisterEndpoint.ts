/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import SwUnregisterEndpoint, { meta } from '@/server/api/endpoints/sw/unregister.js';

describe('sw/unregister endpoint', () => {
	const user = { id: '9fbr7p8abc' };

	function createEndpoint() {
		const swSubscriptionsRepository = {
			delete: jest.fn<(criteria: { userId: string, endpoint: string }) => Promise<void>>(async () => undefined),
		};
		const pushNotificationService = {
			refreshCache: jest.fn<(userId: string) => Promise<void>>(async () => undefined),
		};

		return {
			endpoint: new SwUnregisterEndpoint(swSubscriptionsRepository as never, pushNotificationService as never),
			pushNotificationService,
			swSubscriptionsRepository,
		};
	}

	test('requires credentials in endpoint metadata', () => {
		expect(meta.requireCredential).toBe(true);
		expect(meta.secure).toBe(true);
	});

	test('deletes only the current user subscription and refreshes their push cache', async () => {
		const { endpoint, pushNotificationService, swSubscriptionsRepository } = createEndpoint();

		await endpoint.exec({
			endpoint: 'https://push.example.test/subscription',
		}, user as never, null);

		expect(swSubscriptionsRepository.delete).toHaveBeenCalledWith({
			userId: user.id,
			endpoint: 'https://push.example.test/subscription',
		});
		expect(pushNotificationService.refreshCache).toHaveBeenCalledWith(user.id);
	});
});
