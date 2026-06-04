/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import * as Misskey from 'misskey-js';
import { hasChatUserResolvedAvatar, isChatAvatarFallbackUrl, mergeChatUserForCache } from '@/pages/chat/room-user-cache.js';

const baseUser: Misskey.entities.UserLite = {
	id: 'user-id',
	name: 'User',
	username: 'user',
	host: null,
	createdAt: '2026-06-01T00:00:00.000Z',
	updatedAt: null,
	lastFetchedAt: null,
	approved: true,
	description: '',
	avatarBlurhash: null,
	avatarDecorations: [],
	avatarUrl: 'https://local.example/identicon/user@local.example',
	badgeRoles: [],
	emojis: {},
	isAdmin: false,
	isBot: false,
	isCat: false,
	isLocked: false,
	isModerator: false,
	isSilenced: false,
	isSuspended: false,
	links: null,
	noindex: false,
	onlineStatus: 'unknown',
	speakAsCat: false,
	alsoKnownAs: null,
	movedTo: null,
	movedToUri: null,
	rejectQuotes: false,
	instance: null,
	mandatoryCW: null,
	enableRss: false,
	attributionDomains: [],
};

describe('chat room user cache', () => {
	test('treats generated and static fallback avatars as unresolved', () => {
		assert.strictEqual(isChatAvatarFallbackUrl(null), true);
		assert.strictEqual(isChatAvatarFallbackUrl('https://example.test/identicon/user@example.test'), true);
		assert.strictEqual(isChatAvatarFallbackUrl('/static-assets/avatar.png'), true);
		assert.strictEqual(isChatAvatarFallbackUrl('https://cdn.example.test/files/avatar.webp'), false);
	});

	test('keeps an already resolved avatar when a later message carries a fallback', () => {
		const existing = {
			...baseUser,
			avatarUrl: 'https://cdn.example.test/files/avatar.webp',
			avatarBlurhash: 'blurhash',
			avatarDecorations: [{ url: 'https://cdn.example.test/deco.webp' }],
		};
		const incoming = {
			...baseUser,
			name: 'Updated User',
			avatarUrl: 'https://local.example/identicon/user@local.example',
			avatarBlurhash: null,
			avatarDecorations: [],
		};

		const merged = mergeChatUserForCache(existing, incoming);

		assert.strictEqual(merged.name, 'Updated User');
		assert.strictEqual(merged.avatarUrl, existing.avatarUrl);
		assert.strictEqual(merged.avatarBlurhash, existing.avatarBlurhash);
		assert.deepStrictEqual(merged.avatarDecorations, existing.avatarDecorations);
		assert.strictEqual(hasChatUserResolvedAvatar(merged), true);
	});

	test('accepts a newly resolved avatar over a fallback avatar', () => {
		const existing = {
			...baseUser,
			avatarUrl: 'https://local.example/identicon/user@local.example',
		};
		const incoming = {
			...baseUser,
			avatarUrl: 'https://cdn.example.test/files/avatar.webp',
			avatarBlurhash: 'blurhash',
		};

		const merged = mergeChatUserForCache(existing, incoming);

		assert.strictEqual(merged.avatarUrl, incoming.avatarUrl);
		assert.strictEqual(merged.avatarBlurhash, incoming.avatarBlurhash);
		assert.strictEqual(hasChatUserResolvedAvatar(merged), true);
	});
});
