/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import membersSource from '@/pages/chat/room.members.vue?raw';
import messageSource from '@/pages/chat/XMessage.vue?raw';
import managementSource from '@/pages/chat/room.management.vue?raw';
import chatServiceSource from '../../backend/src/core/ChatService.ts?raw';
import userSuspendServiceSource from '../../backend/src/core/UserSuspendService.ts?raw';
import membersEndpointSource from '../../backend/src/server/api/endpoints/chat/rooms/members.ts?raw';
import cleanupSuspendedBansMigrationSource from '../../backend/migration/1782800000000-clean-suspended-chat-room-bannings.js?raw';

describe('chat room members management', () => {
	test('loads managers separately from paginated ordinary members', () => {
		assert.match(membersSource, /const MANAGER_LIMIT = 100;/);
		assert.match(membersSource, /role: 'manager'[\s\S]*limit: MANAGER_LIMIT/);
		assert.match(membersSource, /role: 'member'[\s\S]*limit: LIMIT/);
		assert.match(membersSource, /memberships\.value = \[\.\.\.managers, \.\.\.members\];/);
		assert.match(membersSource, /const untilId = memberMemberships\.value\.at\(-1\)\?\.id;/);
	});

	test('keeps owner-level and manager-level menus separate', () => {
		assert.match(membersSource, /function canModerateMember\(membership: Misskey\.entities\.ChatRoomMembership\)/);
		assert.match(membersSource, /membership\.role === 'manager' && !canManageRoomRoles\.value/);
		assert.match(membersSource, /function canChangeMemberRole\(membership: Misskey\.entities\.ChatRoomMembership\)/);
		assert.match(membersSource, /function canOpenMemberMenu\(membership: Misskey\.entities\.ChatRoomMembership\) \{\n\treturn canModerateMember\(membership\);/);
		assert.match(membersSource, /os\.apiWithDialog\('chat\/rooms\/members\/update-role'/);
	});

	test('shows room manager role actions directly in member rows', () => {
		assert.match(membersSource, /<span>\{\{ i18n\.ts\._chat\.roomOwner \}\}<\/span>/);
		assert.match(membersSource, /<span>\{\{ i18n\.ts\._chat\.roomManagers \}\}<\/span>/);
		assert.match(membersSource, /<span>\{\{ i18n\.ts\._chat\.members \}\}<\/span>/);
		assert.match(membersSource, /v-for="membership in managerMemberships"[\s\S]*updateMemberRole\(membership, 'member'\)[\s\S]*i18n\.ts\._chat\.unsetRoomManager/);
		assert.match(membersSource, /v-for="membership in memberMemberships"[\s\S]*updateMemberRole\(membership, 'manager'\)[\s\S]*i18n\.ts\._chat\.setRoomManager/);
		assert.match(membersSource, /function openMemberMenu\(membership: Misskey\.entities\.ChatRoomMembership, ev: MouseEvent\)[\s\S]*i18n\.ts\._chat\.muteMember[\s\S]*i18n\.ts\._chat\.kickUser[\s\S]*i18n\.ts\._chat\.kickAndBanUser/);
	});

	test('adds room manager role actions to the chat user menu', () => {
		assert.match(messageSource, /const canManageRoomSenderRole = computed/);
		assert.match(messageSource, /misskeyApi\('chat\/rooms\/members'[\s\S]*userId[\s\S]*limit: 1/);
		assert.match(messageSource, /os\.apiWithDialog\('chat\/rooms\/members\/update-role'/);
		assert.match(messageSource, /i18n\.ts\._chat\.setRoomManager/);
		assert.match(messageSource, /i18n\.ts\._chat\.unsetRoomManager/);
	});

	test('allows looking up a room membership by user id without breaking role pagination', () => {
		assert.match(membersEndpointSource, /userId: \{ type: 'string', format: 'misskey:id' \}/);
		assert.match(membersEndpointSource, /getRoomMembershipsWithPagination\(room\.id, ps\.limit, ps\.sinceId, ps\.untilId, ps\.role, ps\.userId, ps\.query\)/);
		assert.match(chatServiceSource, /role\?: ChatRoomMembershipRole \| null, userId\?: MiUser\['id'\] \| null, memberQuery\?: string \| null/);
		assert.match(chatServiceSource, /membership\.role = :role/);
		assert.match(chatServiceSource, /membership\.userId = :userId/);
	});

	test('supports searching room members without dropping role pagination', () => {
		assert.match(membersSource, /data-chat-room-members-search/);
		assert.match(membersSource, /<MkInput v-model="memberSearchQuery" type="search" :placeholder="i18n\.ts\.searchUser" debounce/);
		assert.match(membersSource, /const normalizedMemberSearchQuery = computed/);
		assert.match(membersSource, /filter\(m => userMatchesMemberSearch\(m\.user!\)\)/);
		assert.match(membersSource, /role: 'manager'[\s\S]*limit: MANAGER_LIMIT[\s\S]*query: normalizedMemberSearchQuery\.value/);
		assert.match(membersSource, /role: 'member'[\s\S]*limit: LIMIT[\s\S]*query: normalizedMemberSearchQuery\.value/);
		assert.match(membersEndpointSource, /query: \{ type: 'string', minLength: 1, maxLength: 100 \}/);
		assert.match(chatServiceSource, /innerJoin\('membership\.user', 'user'\)/);
		assert.match(chatServiceSource, /LOWER\(user\.username\) LIKE :memberQuery/);
		assert.match(chatServiceSource, /user\.isSuspended = FALSE/);
	});

	test('keeps member and ban lists in scrollable containers', () => {
		assert.match(membersSource, /data-chat-room-members-scroll-list/);
		assert.match(membersSource, /\$style\.scrollList/);
		assert.match(membersSource, /\.scrollList \{[\s\S]*overflow-y: auto;/);
		assert.match(managementSource, /\$style\.banScrollList/);
		assert.match(managementSource, /\.banScrollList \{[\s\S]*overflow-y: auto;/);
	});

	test('moves keyword mute records under keyword filtering with search and preview scrolling', () => {
		const keywordFilterIndex = managementSource.indexOf('i18n.ts._chat.keywordFilter');
		const muteLogIndex = managementSource.indexOf('i18n.ts.chatMuteLog');
		assert.isTrue(keywordFilterIndex >= 0 && muteLogIndex > keywordFilterIndex);
		assert.notMatch(membersSource, /i18n\.ts\.chatMuteLog/);
		assert.match(managementSource, /v-model="muteLogSearchQuery"/);
		assert.match(managementSource, /filteredMuteLog/);
		assert.match(managementSource, /data-chat-keyword-mute-log-search/);
		assert.match(managementSource, /data-chat-keyword-mute-log-list/);
		assert.match(managementSource, /misskeyApi\('chat\/rooms\/mute-log'/);
		assert.match(managementSource, /os\.apiWithDialog\('chat\/rooms\/clear-mute-log'/);
		assert.match(managementSource, /\.previewScrollList \{[\s\S]*overflow-y: auto;/);
	});

	test('cleans chat room ban list rows when a user is suspended', () => {
		assert.match(userSuspendServiceSource, /ChatRoomBanningsRepository/);
		assert.match(userSuspendServiceSource, /chatRoomBanningsRepository\.delete\(\{ userId: user\.id \}\)/);
		assert.match(cleanupSuspendedBansMigrationSource, /DELETE FROM "chat_room_banning" AS banning/);
		assert.match(cleanupSuspendedBansMigrationSource, /u\."isSuspended" = TRUE OR u\."isDeleted" = TRUE/);
	});
});
