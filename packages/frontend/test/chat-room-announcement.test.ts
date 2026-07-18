/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import roomSource from '@/pages/chat/room.vue?raw';

describe('chat room announcement', () => {
	test('renders the pinned announcement as a collapsible accessible card', () => {
		assert.match(roomSource, /showPinnedAnnouncement/);
		assert.match(roomSource, /if \(r\.announcementPinned !== true\) return false;/);
		assert.match(roomSource, /if \(announcementDismissedFingerprint\.value == null\) return true;/);
		assert.match(roomSource, /:aria-expanded="announcementExpanded"/);
		assert.match(roomSource, /@click="toggleAnnouncement"/);
		assert.match(roomSource, /v-if="!announcementExpanded" :class="\$style\.announcementPreviewBlock"/);
		assert.match(roomSource, /:class="\$style\.announcementFade"/);
		assert.match(roomSource, /:class="\$style\.announcementEllipsis"/);
		assert.match(roomSource, /onAnnouncementPinnedToChat/);
		assert.match(roomSource, /chatRoomAnnouncementDismissed:v3:/);
	});

	test('persists announcement expanded state per room', () => {
		assert.match(roomSource, /const CHAT_ROOM_ANNOUNCEMENT_EXPANDED_KEY_PREFIX = 'chatRoomAnnouncementExpanded:';/);
		assert.match(roomSource, /function getAnnouncementExpandedStorageKey\(roomId: string\)/);
		assert.match(roomSource, /window\.localStorage\.getItem\(getAnnouncementExpandedStorageKey\(roomId\)\) === '1'/);
		assert.match(roomSource, /window\.localStorage\.setItem\(getAnnouncementExpandedStorageKey\(room\.value\.id\), announcementExpanded\.value \? '1' : '0'\)/);
	});

	test('supports permanent dismiss per user and content fingerprint', () => {
		assert.match(roomSource, /const CHAT_ROOM_ANNOUNCEMENT_DISMISSED_KEY_PREFIX = 'chatRoomAnnouncementDismissed:v3:';/);
		assert.match(roomSource, /announcementDismissedFingerprint/);
		assert.match(roomSource, /function permanentlyDismissAnnouncement/);
		assert.match(roomSource, /permanentlyCloseAnnouncement/);
		assert.match(roomSource, /:class="\$style\.announcementDismiss"/);
		// 确认后才隐藏横幅，并切到公告页签（服务端公告不删除）
		assert.match(roomSource, /tab\.value = 'announcements'/);
		assert.match(roomSource, /if \(canceled\) return;/);
	});

	test('adds announcements history tab after management', () => {
		assert.match(roomSource, /key: 'announcements'/);
		assert.match(roomSource, /XAnnouncements/);
		assert.match(roomSource, /tab === 'announcements'/);
	});

	test('collapsed preview shows about one and a half lines with a large in-content ellipsis', () => {
		assert.match(roomSource, /\.announcementPreviewBlock\s*\{[\s\S]*max-height:\s*calc\(1\.45em \* 1\.55\);/);
		assert.match(roomSource, /\.announcementFade\s*\{[\s\S]*position:\s*absolute;[\s\S]*justify-content:\s*flex-end;/);
		assert.match(roomSource, /\.announcementEllipsis\s*\{[\s\S]*margin-left:\s*0\.35em;[\s\S]*font-size:\s*1\.55em;[\s\S]*font-weight:\s*900;/);
		assert.ok(roomSource.includes('···') || roomSource.includes('...'));
	});
});
