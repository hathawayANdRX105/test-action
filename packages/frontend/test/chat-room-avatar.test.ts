/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import roomAvatarSource from '@/pages/chat/XRoomAvatar.vue?raw';
import chatEntityServiceSource from '../../backend/src/core/entities/ChatEntityService.ts?raw';

describe('chat room avatar fallback', () => {
	test('falls back when the room avatar image cannot be loaded', () => {
		assert.match(roomAvatarSource, /const avatarLoadFailed = ref\(false\);/);
		assert.match(roomAvatarSource, /appendAvatarCacheKey\(props\.room\.avatarUrl, props\.room\.id\)/);
		assert.match(roomAvatarSource, /<img v-if="roomAvatarUrl"[\s\S]*@error="onAvatarError"/);
		assert.match(roomAvatarSource, /<MkAvatar v-else-if="room\.owner"/);
		assert.match(roomAvatarSource, /watch\(\[\(\) => props\.room\.id, \(\) => props\.room\.avatarUrl\]/);
	});

	test('repairs missing packed room avatar URLs from Drive files', () => {
		assert.match(chatEntityServiceSource, /DriveFilesRepository/);
		assert.match(chatEntityServiceSource, /private driveFilesRepository: DriveFilesRepository/);
		assert.match(chatEntityServiceSource, /private async getRoomAvatarUrls\(rooms: MiChatRoom\[\]\): Promise<Map<MiChatRoom\['id'\], string \| null>>/);
		assert.match(chatEntityServiceSource, /driveFilesRepository\.findBy\(\{ id: In\(avatarIds\) \}\)/);
		assert.match(chatEntityServiceSource, /driveFileEntityService\.getPublicUrl\(avatar, 'avatar'\)/);
		assert.match(chatEntityServiceSource, /chatRoomsRepository\.update\(room\.id, \{ avatarUrl \}\)/);
		assert.match(chatEntityServiceSource, /avatarUrl: hints\.avatarUrl/);
	});
});
