/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { appendAvatarCacheKey } from '@/utility/avatar-cache.js';

describe('avatar cache keys', () => {
	test('adds a stable cache key to proxied avatar URLs', () => {
		assert.strictEqual(
			appendAvatarCacheKey('https://dc.hhhl.cc/proxy/avatar.webp?url=https%3A%2F%2Fdc.hhhl.cc%2Ffiles%2Favatar.png&avatar=1', 'user-1'),
			'https://dc.hhhl.cc/proxy/avatar.webp?url=https%3A%2F%2Fdc.hhhl.cc%2Ffiles%2Favatar.png&avatar=1&_avatarKey=user-1',
		);
	});

	test('keeps relative proxied avatar URLs relative', () => {
		assert.strictEqual(
			appendAvatarCacheKey('/proxy/avatar.webp?url=%2Ffiles%2Favatar.png&avatar=1', 'room-1'),
			'/proxy/avatar.webp?url=%2Ffiles%2Favatar.png&avatar=1&_avatarKey=room-1',
		);
	});

	test('does not change non-avatar URLs', () => {
		assert.strictEqual(
			appendAvatarCacheKey('https://dc.hhhl.cc/files/avatar.png', 'user-1'),
			'https://dc.hhhl.cc/files/avatar.png',
		);
	});
});
