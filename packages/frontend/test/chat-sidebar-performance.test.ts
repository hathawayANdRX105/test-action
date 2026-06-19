/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import sidebarSource from '@/pages/chat/chat-sidebar.vue?raw';
import roomSource from '@/pages/chat/room.vue?raw';

describe('chat sidebar realtime refresh', () => {
	test('uses main stream events instead of fixed high-frequency history polling', () => {
		assert.match(sidebarSource, /import \{ useStream \} from '@\/stream\.js';/);
		assert.match(sidebarSource, /const CHAT_SIDEBAR_FALLBACK_REFRESH_INTERVAL_MS = 1000 \* 60;/);
		assert.match(sidebarSource, /const CHAT_SIDEBAR_EVENT_REFRESH_DEBOUNCE_MS = 400;/);
		assert.match(sidebarSource, /let mainConnection: Misskey\.IChannelConnection<Misskey\.Channels\['main'\]> \| null = null;/);
		assert.match(sidebarSource, /function scheduleConversationRefresh\(reason: 'event' \| 'fallback' \| 'activation'\)/);
		assert.match(sidebarSource, /pendingConversationRefreshTimer = window\.setTimeout\(flushScheduledConversationRefresh, CHAT_SIDEBAR_EVENT_REFRESH_DEBOUNCE_MS\);/);
		assert.match(sidebarSource, /mainConnection = useStream\(\)\.useChannel\('main', null, 'ChatSidebar'\);/);
		assert.match(sidebarSource, /mainConnection\.on\('newChatMessage', onMainNewChatMessage\);/);
		assert.match(sidebarSource, /mainConnection\?\.off\('newChatMessage', onMainNewChatMessage\);/);
		assert.match(sidebarSource, /pollConversations\('fallback'\);/);
		assert.strictEqual(sidebarSource.includes('1000 * 10'), false);
	});

	test('keeps room stream recovery as a low-frequency safety net while connected', () => {
		assert.match(roomSource, /const STREAM_RECOVERY_POLL_INTERVAL_MS = 1000 \* 60 \* 5;/);
		assert.match(roomSource, /const STREAM_RECOVERY_ERROR_RETRY_MS = 5000;/);
	});
});
