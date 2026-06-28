/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import sidebarSource from '@/pages/chat/chat-sidebar.vue?raw';
import roomSource from '@/pages/chat/room.vue?raw';
import chatRoomSchemaSource from '../../backend/src/models/json-schema/chat-room.ts?raw';
import chatEntityServiceSource from '../../backend/src/core/entities/ChatEntityService.ts?raw';
import chatServiceSource from '../../backend/src/core/ChatService.ts?raw';
import endpointListSource from '../../backend/src/server/api/endpoint-list.ts?raw';
import updateEndpointSource from '../../backend/src/server/api/endpoints/chat/rooms/user-settings/update.ts?raw';
import deleteUserConversationEndpointSource from '../../backend/src/server/api/endpoints/chat/users/conversation/delete.ts?raw';
import userSettingModelSource from '../../backend/src/models/ChatRoomUserSetting.ts?raw';
import userSettingMigrationSource from '../../backend/migration/1782700000000-chat-room-user-setting.js?raw';
import userConversationSettingModelSource from '../../backend/src/models/ChatUserConversationSetting.ts?raw';
import userConversationSettingMigrationSource from '../../backend/migration/1782900000000-chat-user-conversation-setting.js?raw';

describe('chat room organization', () => {
	test('stores per-user room nickname and folder on the backend', () => {
		assert.match(userSettingModelSource, /@Entity\('chat_room_user_setting'\)/);
		assert.match(userSettingModelSource, /@Index\(\['userId', 'roomId'\], \{ unique: true \}\)/);
		assert.match(userSettingModelSource, /public nickname: string \| null;/);
		assert.match(userSettingModelSource, /public folder: string \| null;/);
		assert.match(userSettingMigrationSource, /CREATE TABLE IF NOT EXISTS "chat_room_user_setting"/);
		assert.match(userSettingMigrationSource, /CONSTRAINT "UQ_chat_room_user_setting_user_room" UNIQUE \("userId", "roomId"\)/);
	});

	test('packs the current user room organization fields with chat rooms', () => {
		assert.match(chatRoomSchemaSource, /myNickname: \{[\s\S]*type: 'string'[\s\S]*optional: true, nullable: true/);
		assert.match(chatRoomSchemaSource, /myFolder: \{[\s\S]*type: 'string'[\s\S]*optional: true, nullable: true/);
		assert.match(chatEntityServiceSource, /chatRoomUserSettingsRepository: ChatRoomUserSettingsRepository/);
		assert.match(chatEntityServiceSource, /userSettings\?: Map<MiChatRoom\['id'\], MiChatRoomUserSetting \| null \| undefined>/);
		assert.match(chatEntityServiceSource, /myNickname: userSetting\?\.nickname \?\? null/);
		assert.match(chatEntityServiceSource, /myFolder: userSetting\?\.folder \?\? null/);
		assert.match(chatEntityServiceSource, /userSettingsByRoomId\.get\(room\.id\) \?\? null/);
	});

	test('exposes a member-only endpoint for updating personal room organization', () => {
		assert.match(endpointListSource, /chat\/rooms\/user-settings\/update/);
		assert.match(updateEndpointSource, /kind: 'write:chat'/);
		assert.match(updateEndpointSource, /nickname: \{ type: 'string', maxLength: 128, nullable: true \}/);
		assert.match(updateEndpointSource, /folder: \{ type: 'string', maxLength: 80, nullable: true \}/);
		assert.match(updateEndpointSource, /isRoomParticipant\(me\.id, room\)/);
		assert.match(updateEndpointSource, /updateRoomUserSetting\(me\.id, room\.id/);
		assert.match(chatServiceSource, /public async isRoomParticipant\(userId: MiUser\['id'\], room: ChatRoomMessageTarget\)/);
		assert.match(chatServiceSource, /public async updateRoomUserSetting\(userId: MiUser\['id'\], roomId: MiChatRoom\['id'\]/);
		assert.match(chatServiceSource, /if \(nickname == null && folder == null\) \{[\s\S]*chatRoomUserSettingsRepository\.delete/);
	});

	test('groups sidebar room entries and displays nicknames before original names', () => {
		assert.match(sidebarSource, /const UNGROUPED_ROOM_GROUP_KEY = '__ungrouped__';/);
		assert.match(sidebarSource, /const groupedRoomEntries = computed<RoomGroup\[\]>/);
		assert.match(sidebarSource, /room\.myFolder\?\.trim\(\) \?\? ''/);
		assert.match(sidebarSource, /room\.myNickname\?\.trim\(\)/);
		assert.match(sidebarSource, /roomDisplayName\(entry\.room\)/);
		assert.match(sidebarSource, /i18n\.ts\._chat\.originalRoomName/);
		assert.match(sidebarSource, /openRoomMenu\(entry, \$event\)/);
		assert.match(sidebarSource, /chat\/rooms\/user-settings\/update/);
		assert.match(roomSource, /const headerTitle = computed/);
		assert.match(roomSource, /room\.value\?\.myNickname\?\.trim\(\)/);
	});

	test('keeps grouped room rows reactive when a group is collapsed or expanded', () => {
		assert.match(sidebarSource, /v-show="isRoomGroupOpen\(group\.key\)"/);
		assert.match(sidebarSource, /v-memo="\[[^\"]*isRoomGroupOpen\(group\.key\)/);
	});

	test('lets the current user remove a direct-message conversation from their sidebar only', () => {
		assert.match(userConversationSettingModelSource, /@Entity\('chat_user_conversation_setting'\)/);
		assert.match(userConversationSettingModelSource, /@Index\(\['userId', 'otherUserId'\], \{ unique: true \}\)/);
		assert.match(userConversationSettingModelSource, /public hiddenUntilMessageId: MiChatMessage\['id'\];/);
		assert.match(userConversationSettingMigrationSource, /CREATE TABLE IF NOT EXISTS "chat_user_conversation_setting"/);
		assert.match(userConversationSettingMigrationSource, /CONSTRAINT "UQ_chat_user_conversation_setting_user_other" UNIQUE \("userId", "otherUserId"\)/);
		assert.match(endpointListSource, /chat\/users\/conversation\/delete/);
		assert.match(deleteUserConversationEndpointSource, /kind: 'write:chat'/);
		assert.match(deleteUserConversationEndpointSource, /hideUserConversation\(me\.id, other\.id\)/);
		assert.match(chatServiceSource, /public async hideUserConversation\(userId: MiUser\['id'\], otherUserId: MiUser\['id'\]/);
		assert.match(chatServiceSource, /chatUserConversationSettingsRepository/);
		assert.match(chatServiceSource, /hiddenUntilMessageId/);
		assert.match(sidebarSource, /openUserMenu\(entry, \$event\)/);
		assert.match(sidebarSource, /chat\/users\/conversation\/delete/);
		assert.match(sidebarSource, /userEntries\.value = userEntries\.value\.filter\(userEntry => userEntry\.id !== entry\.id\)/);
	});
});
