/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import ReactMessageEndpoint from '@/server/api/endpoints/chat/messages/react.js';
import UnreactMessageEndpoint from '@/server/api/endpoints/chat/messages/unreact.js';

function entityNotFoundError(): Error {
	return Object.assign(new Error('not found'), { name: 'EntityNotFoundError' });
}

describe('chat message reaction endpoints', () => {
	const me = { id: 'me' } as never;

	function createChatService(overrides: Record<string, unknown>) {
		return {
			checkChatAvailability: jest.fn(async () => undefined),
			...overrides,
		} as any;
	}

	test('react maps missing or inaccessible messages to no such message', async () => {
		const chatService = createChatService({
			react: jest.fn(async () => {
				throw new Error('cannot react to others message');
			}),
		});
		const endpoint = new ReactMessageEndpoint(chatService);

		await expect(endpoint.exec({ messageId: 'message', reaction: '👍' }, me, null)).rejects.toMatchObject({
			code: 'NO_SUCH_MESSAGE',
		});
		expect(chatService.react).toHaveBeenCalledWith('message', 'me', '👍');
	});

	test('unreact maps missing or inaccessible messages to no such message', async () => {
		const chatService = createChatService({
			unreact: jest.fn(async () => {
				throw entityNotFoundError();
			}),
		});
		const endpoint = new UnreactMessageEndpoint(chatService);

		await expect(endpoint.exec({ messageId: 'message', reaction: '👍' }, me, null)).rejects.toMatchObject({
			code: 'NO_SUCH_MESSAGE',
		});
		expect(chatService.unreact).toHaveBeenCalledWith('message', 'me', '👍');
	});

	test('react propagates internal failures', async () => {
		const dbError = new Error('db down');
		const chatService = createChatService({
			react: jest.fn(async () => {
				throw dbError;
			}),
		});
		const endpoint = new ReactMessageEndpoint(chatService);

		await expect(endpoint.exec({ messageId: 'message', reaction: '👍' }, me, null)).rejects.toBe(dbError);
	});

	test('unreact propagates internal failures', async () => {
		const dbError = new Error('db down');
		const chatService = createChatService({
			unreact: jest.fn(async () => {
				throw dbError;
			}),
		});
		const endpoint = new UnreactMessageEndpoint(chatService);

		await expect(endpoint.exec({ messageId: 'message', reaction: '👍' }, me, null)).rejects.toBe(dbError);
	});
});
