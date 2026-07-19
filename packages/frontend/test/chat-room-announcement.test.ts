/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import roomSource from '@/pages/chat/room.vue?raw';
import announcementsSource from '@/pages/chat/room.announcements.vue?raw';

describe('chat room announcement', () => {
	test('renders the pinned announcement as a collapsible accessible card for all members', () => {
		assert.match(roomSource, /showPinnedAnnouncement/);
		assert.match(roomSource, /if \(r\.announcementPinned !== true\) return false;/);
		assert.match(roomSource, /\(r\.announcement \?\? ''\)\.trim\(\)\.length > 0/);
		assert.match(roomSource, /:aria-expanded="announcementExpanded"/);
		assert.match(roomSource, /@click="toggleAnnouncement"/);
		assert.match(roomSource, /v-if="!announcementExpanded" :class="\$style\.announcementPreviewBlock"/);
		assert.match(roomSource, /:class="\$style\.announcementFade"/);
		assert.match(roomSource, /:class="\$style\.announcementEllipsis"/);
		// MFM rendering for room announcement body (collapsed + expanded)
		assert.match(roomSource, /announcementPreview"><Mfm :text="room!\.announcement \?\? ''" :plain="true"\/>/);
		assert.match(roomSource, /announcementTextExpanded]"><Mfm :text="room!\.announcement \?\? ''" :isBlock="true"\/>/);
		// 普通用户不可永久关闭
		// vitest's assert (chai) has no doesNotMatch; use negative match
		assert.ok(!/permanentlyDismissAnnouncement/.test(roomSource));
		assert.ok(!/chatRoomAnnouncementDismissed/.test(roomSource));
	});

	test('persists announcement expanded state per room', () => {
		assert.match(roomSource, /const CHAT_ROOM_ANNOUNCEMENT_EXPANDED_KEY_PREFIX = 'chatRoomAnnouncementExpanded:';/);
		assert.match(roomSource, /function getAnnouncementExpandedStorageKey\(roomId: string\)/);
		assert.match(roomSource, /window\.localStorage\.getItem\(getAnnouncementExpandedStorageKey\(roomId\)\) === '1'/);
		assert.match(roomSource, /window\.localStorage\.setItem\(getAnnouncementExpandedStorageKey\(room\.value\.id\), announcementExpanded\.value \? '1' : '0'\)/);
	});

	test('announcements tab is history-only with manager delete', () => {
		assert.match(roomSource, /key: 'announcements'/);
		assert.match(roomSource, /XAnnouncements/);
		assert.match(roomSource, /:canManage="canManageRoomUsers"/);
		assert.match(announcementsSource, /deleteCurrent/);
		assert.match(announcementsSource, /deleteHistoryItem/);
		assert.match(announcementsSource, /canManage/);
		assert.ok(!/pinToChat|setPinnedCurrent|pinHistoryItem/.test(announcementsSource));
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
