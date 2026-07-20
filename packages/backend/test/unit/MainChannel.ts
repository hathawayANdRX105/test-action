/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { MainChannelService } from '@/server/api/stream/channels/main.js';

describe('MainChannel registryUpdated audience', () => {
	function createChannel(token: { id: string } | null) {
		const connection = {
			user: { id: 'user1' },
			client: { token },
			subscriber: {
				on: jest.fn(),
				off: jest.fn(),
			},
			sendMessageToWs: jest.fn(async (..._args: unknown[]) => undefined),
			userMutedInstances: new Set<string>(),
		};
		const noteEntityService = {};
		const cacheService = {
			getUserRelation: jest.fn(async () => ({ isMuting: false })),
		};
		const service = new MainChannelService(noteEntityService as never, cacheService as never);
		const channel = service.create('ch1', connection as never);
		return { channel, connection };
	}

	test('forwards registryUpdated to native session clients (token null)', async () => {
		const { channel, connection } = createChannel(null);
		// private onEvent — test harness only
		const onEvent = (channel as unknown as { onEvent: (data: { type: string; body: unknown }) => Promise<void> }).onEvent;

		await onEvent({
			type: 'registryUpdated',
			body: { scope: ['client', 'x'], key: 'theme', value: { dark: true } },
		});

		expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', {
			id: 'ch1',
			type: 'registryUpdated',
			body: { scope: ['client', 'x'], key: 'theme', value: { dark: true } },
		});
	});

	test('drops registryUpdated for third-party access token clients', async () => {
		const { channel, connection } = createChannel({ id: 'access-token' });
		// private onEvent — test harness only
		const onEvent = (channel as unknown as { onEvent: (data: { type: string; body: unknown }) => Promise<void> }).onEvent;

		await onEvent({
			type: 'registryUpdated',
			body: { scope: ['client', 'x'], key: 'theme', value: { secret: true } },
		});

		expect(connection.sendMessageToWs).not.toHaveBeenCalled();
	});

	test('still forwards other main events to third-party token clients', async () => {
		const { channel, connection } = createChannel({ id: 'access-token' });
		// private onEvent — test harness only
		const onEvent = (channel as unknown as { onEvent: (data: { type: string; body: unknown }) => Promise<void> }).onEvent;

		await onEvent({
			type: 'readAllNotifications',
			body: {},
		});

		expect(connection.sendMessageToWs).toHaveBeenCalledWith('channel', {
			id: 'ch1',
			type: 'readAllNotifications',
			body: {},
		});
	});
});
