/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import ReactMessageEndpoint from '@/server/api/endpoints/chat/messages/react.js';
import UnreactMessageEndpoint from '@/server/api/endpoints/chat/messages/unreact.js';

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
				throw new Error('missing message');
			}),
		});
		const endpoint = new UnreactMessageEndpoint(chatService);

		await expect(endpoint.exec({ messageId: 'message', reaction: '👍' }, me, null)).rejects.toMatchObject({
			code: 'NO_SUCH_MESSAGE',
		});
		expect(chatService.unreact).toHaveBeenCalledWith('message', 'me', '👍');
	});
});
