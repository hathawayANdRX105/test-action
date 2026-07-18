/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import roomSource from '@/pages/chat/room.vue?raw';
import messageSource from '@/pages/chat/XMessage.vue?raw';
import mutedUsersSource from '@/pages/chat/room.user-mutes.vue?raw';
import chatServiceSource from '../../backend/src/core/ChatService.ts?raw';
import endpointListSource from '../../backend/src/server/api/endpoint-list.ts?raw';

describe('chat room user mutes', () => {
	test('adds a room tab and avatar menu action for user mutes', () => {
		assert.match(roomSource, /key: 'mutedUsers'/);
		assert.match(roomSource, /title: i18n\.ts\._chat\.mutedUsers/);
		assert.match(roomSource, /:title="t\.title" :aria-label="t\.title"/);
		assert.match(roomSource, /text: i18n\.ts\.reload/);
		assert.match(roomSource, /:title="headerActions\[0\]\.text" :aria-label="headerActions\[0\]\.text"/);
		assert.match(roomSource, /:enableRoomUserMute="true"/);
		assert.match(roomSource, /<XMutedUsers[^>]+@unmuted="onRoomUserUnmuted"/);
		assert.match(messageSource, /enableRoomUserMute\?: boolean;/);
		assert.match(messageSource, /\(ev: 'muteUser', user: Misskey\.entities\.UserLite\): void;/);
		assert.match(messageSource, /props\.enableRoomUserMute === true/);
		assert.match(messageSource, /text: i18n\.ts\._chat\.muteUserInRoom[\s\S]*caption: i18n\.ts\._chat\.muteUserInRoomCaption[\s\S]*icon: 'ti ti-eye-off'[\s\S]*emit\('muteUser', user\)/);
		assert.match(mutedUsersSource, /i18n\.ts\._chat\.mutedUsersDescription/);
		assert.match(mutedUsersSource, /i18n\.ts\._chat\.mutedUsersScope/);
		assert.match(mutedUsersSource, /i18n\.ts\._chat\.noMutedUsersDescription/);
		assert.match(mutedUsersSource, /i18n\.ts\._chat\.mutedAt/);
		assert.match(mutedUsersSource, /<i class="ti ti-eye"><\/i> \{\{ i18n\.ts\._chat\.unmuteUserInRoom \}\}/);
	});

	test('filters muted room users from fetched and realtime messages', () => {
		assert.match(roomSource, /const mutedRoomUserIds = ref<Set<string>>\(new Set\(\)\);/);
		assert.match(roomSource, /function filterMutedRoomMessages/);
		assert.match(roomSource, /appendFetchedMessages\([\s\S]*filterMutedRoomMessages\(fetched\)\.map/);
		assert.match(roomSource, /replaceMessages\([\s\S]*filterMutedRoomMessages\(fetched\)\.map/);
		assert.match(roomSource, /const visibleBatch = filterMutedRoomMessages\(batch\);[\s\S]*if \(visibleBatch\.length === 0\) return;/);
		assert.match(roomSource, /detachedIncomingMessages = trimDetachedIncomingMessages\(appendDetachedChatMessages\(detachedIncomingMessages, visibleBatch, messages\.value\)\)/);
		assert.match(roomSource, /messages\.value = filterMutedNormalizedMessages\(messages\.value\);/);
	});

	test('manages room user mutes through the dedicated endpoints', () => {
		assert.match(roomSource, /misskeyApi\('chat\/rooms\/user-mutes\/list'/);
		assert.match(roomSource, /os\.apiWithDialog\('chat\/rooms\/user-mutes\/create'/);
		assert.match(mutedUsersSource, /misskeyApi\('chat\/rooms\/user-mutes\/list'/);
		assert.match(mutedUsersSource, /os\.apiWithDialog\('chat\/rooms\/user-mutes\/delete'/);
		assert.match(mutedUsersSource, /emit\('unmuted', muting\.user\.id\)/);
	});

	test('registers backend endpoints and applies server-side filtering', () => {
		assert.match(endpointListSource, /chat\/rooms\/user-mutes\/create/);
		assert.match(endpointListSource, /chat\/rooms\/user-mutes\/delete/);
		assert.match(endpointListSource, /chat\/rooms\/user-mutes\/list/);
		assert.match(chatServiceSource, /private applyRoomUserMutingFilter/);
		assert.match(chatServiceSource, /NOT EXISTS \(\$\{subQuery\.getQuery\(\)\}\)/);
		assert.match(chatServiceSource, /this\.applyRoomUserMutingFilter\(query, meId, 'message'\)/);
		assert.match(chatServiceSource, /this\.applyRoomUserMutingFilter\(latestMessageIdsQuery, meId, 'latest'\)/);
		assert.match(chatServiceSource, /this\.applyRoomUserMutingFilter\(q, meId, 'message'\)/);
	});
});
