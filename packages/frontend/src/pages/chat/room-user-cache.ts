/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';

const FALLBACK_AVATAR_PATHS = [
	'/static-assets/avatar.png',
	'/static-assets/user-unknown.png',
] as const;

function getDefaultBaseUrl(): string {
	return globalThis.location?.origin ?? 'http://localhost';
}

export function isChatAvatarFallbackUrl(avatarUrl: string | null | undefined, baseUrl = getDefaultBaseUrl()): boolean {
	if (avatarUrl == null || avatarUrl === '') return true;

	try {
		const url = new URL(avatarUrl, baseUrl);
		return url.pathname.startsWith('/identicon/') || FALLBACK_AVATAR_PATHS.some(path => url.pathname.endsWith(path));
	} catch {
		return avatarUrl.includes('/identicon/') || FALLBACK_AVATAR_PATHS.some(path => avatarUrl.endsWith(path));
	}
}

export function hasChatUserResolvedAvatar(user: Misskey.entities.UserLite): boolean {
	return !isChatAvatarFallbackUrl(user.avatarUrl);
}

export function mergeChatUserForCache(existing: Misskey.entities.UserLite, incoming: Misskey.entities.UserLite): Misskey.entities.UserLite {
	const existingHasAvatar = hasChatUserResolvedAvatar(existing);
	const incomingHasAvatar = hasChatUserResolvedAvatar(incoming);
	const merged = {
		...existing,
		...incoming,
	};

	if (existingHasAvatar && !incomingHasAvatar) {
		merged.avatarUrl = existing.avatarUrl;
		merged.avatarBlurhash = existing.avatarBlurhash;
	}

	if ((existing.avatarDecorations?.length ?? 0) > 0 && (incoming.avatarDecorations?.length ?? 0) === 0) {
		merged.avatarDecorations = existing.avatarDecorations;
	}

	return merged;
}
