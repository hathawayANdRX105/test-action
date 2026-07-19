/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import userPopupSource from '@/components/MkUserPopup.vue?raw';
import avatarSource from '@/components/global/MkAvatar.vue?raw';

describe('user popup avatar decorations', () => {
	test('marks avatars only when a visible decoration needs popup spacing', () => {
		assert.match(avatarSource, /:data-decoration="hasDecoration \|\| undefined"/);
		assert.match(avatarSource, /const hasDecoration = computed\(\(\) => showDecoration && \(props\.decorations \?\? props\.user\.avatarDecorations\)\.length > 0\);/);
		assert.match(userPopupSource, /if \(!prefer\.s\.showAvatarDecorations \|\| user\.value == null\) return 0;/);
		assert.match(userPopupSource, /const halfExtent = Math\.abs\(Math\.cos\(angle\)\) \+ Math\.abs\(Math\.sin\(angle\)\);/);
		assert.match(userPopupSource, /return Math\.max\(inset, 0, halfExtent - 0\.5 \+ offsetY\);/);
	});

	test('allows decorations to escape while keeping card content clipped', () => {
		assert.match(userPopupSource, /&:global\(\._popup\) \{[\s\S]*overflow: visible;[\s\S]*contain: layout style;/);
		assert.match(userPopupSource, /\.content \{[\s\S]*overflow: clip;[\s\S]*border-radius: inherit;/);
		assert.match(userPopupSource, /\.banner \{[\s\S]*border-radius: var\(--MI-radius\) var\(--MI-radius\) 0 0;/);
	});

	test('keeps decoration layers behind the title and reserves title space', () => {
		assert.match(userPopupSource, /\.avatarBack \{[\s\S]*z-index: 1;/);
		assert.match(userPopupSource, /\.avatar \{[\s\S]*z-index: 2;/);
		assert.match(userPopupSource, /\.avatar\[data-decoration\] \+ \.content \.title \{[\s\S]*margin-top: calc\(16px \+ var\(--user-popup-avatar-decoration-block-end\) \* var\(--MI-avatar\)\);/);
		assert.match(userPopupSource, /\.title \{[\s\S]*z-index: 3;/);
	});
});
