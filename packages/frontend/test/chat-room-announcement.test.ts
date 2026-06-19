/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import roomSource from '@/pages/chat/room.vue?raw';

describe('chat room announcement', () => {
	test('renders the pinned announcement as a collapsible accessible card', () => {
		assert.match(roomSource, /<button[^>]+class="_button"[^>]+:class="\$style\.announcementToggle"[^>]+:title="announcementExpanded \? i18n\.ts\.showLess : i18n\.ts\.showMore"[^>]+:aria-label="announcementExpanded \? i18n\.ts\.showLess : i18n\.ts\.showMore"[^>]+:aria-expanded="announcementExpanded"[^>]+@click="toggleAnnouncement"/);
		assert.match(roomSource, /<i class="ti" :class="announcementExpanded \? 'ti-chevron-up' : 'ti-chevron-down'"><\/i>/);
		assert.match(roomSource, /:class="\[\$style\.announcementText, \{ \[\$style\.announcementTextExpanded\]: announcementExpanded \}\]"/);
	});

	test('persists announcement expanded state per room', () => {
		assert.match(roomSource, /const CHAT_ROOM_ANNOUNCEMENT_EXPANDED_KEY_PREFIX = 'chatRoomAnnouncementExpanded:';/);
		assert.match(roomSource, /function getAnnouncementExpandedStorageKey\(roomId: string\)/);
		assert.match(roomSource, /window\.localStorage\.getItem\(getAnnouncementExpandedStorageKey\(roomId\)\) === '1'/);
		assert.match(roomSource, /window\.localStorage\.setItem\(getAnnouncementExpandedStorageKey\(room\.value\.id\), announcementExpanded\.value \? '1' : '0'\)/);
	});

	test('keeps announcement text readable and clamps long content when collapsed', () => {
		assert.match(roomSource, /\.announcement\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--MI_THEME-panel\) 94%, var\(--MI_THEME-bg\)\);[\s\S]*color:\s*var\(--MI_THEME-fg\);/);
		assert.match(roomSource, /\.announcementText\s*\{[\s\S]*color:\s*var\(--MI_THEME-fg\);[\s\S]*white-space:\s*pre-wrap;[\s\S]*overflow-wrap:\s*anywhere;[\s\S]*display:\s*-webkit-box;[\s\S]*-webkit-line-clamp:\s*1;[\s\S]*line-clamp:\s*1;/);
		assert.match(roomSource, /\.announcementTextExpanded\s*\{[\s\S]*display:\s*block;[\s\S]*-webkit-line-clamp:\s*unset;[\s\S]*line-clamp:\s*unset;/);
	});

	test('uses theme accent colors for the announcement collapse button', () => {
		assert.match(roomSource, /\.announcementToggle\s*\{[\s\S]*color:\s*var\(--MI_THEME-accent\);[\s\S]*background:\s*color-mix\(in srgb, var\(--MI_THEME-accent\) 12%, transparent\);[\s\S]*border:\s*solid 1px color-mix\(in srgb, var\(--MI_THEME-accent\) 32%, var\(--MI_THEME-divider\)\);/);
		assert.match(roomSource, /&:hover\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--MI_THEME-accent\) 20%, var\(--MI_THEME-panel\)\);[\s\S]*color:\s*var\(--MI_THEME-accent\);/);
	});
});
