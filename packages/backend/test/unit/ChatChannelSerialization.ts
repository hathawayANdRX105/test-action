/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { serializeChatChannelEventForWs } from '@/server/api/stream/channels/chat-channel-serialization.js';
import type { ChatEventPayload } from '@/core/GlobalEventService.js';

describe('serializeChatChannelEventForWs', () => {
	test('reuses serialized chat channel payloads for the same event object and channel id', () => {
		// serialization only needs object identity + JSON shape for this unit
		const data = {
			type: 'message',
			body: {
				id: 'message-id',
				text: 'hello',
			},
		} as unknown as ChatEventPayload;
		const stringifySpy = jest.spyOn(JSON, 'stringify');

		const first = serializeChatChannelEventForWs('channel-id', data);
		const second = serializeChatChannelEventForWs('channel-id', data);
		const otherChannel = serializeChatChannelEventForWs('other-channel-id', data);

		expect(first).toBe(second);
		expect(JSON.parse(first)).toEqual({
			type: 'channel',
			body: {
				id: 'channel-id',
				type: 'message',
				body: {
					id: 'message-id',
					text: 'hello',
				},
			},
		});
		expect(JSON.parse(otherChannel).body.id).toBe('other-channel-id');
		expect(stringifySpy).toHaveBeenCalledTimes(4);
		stringifySpy.mockRestore();
	});
});
