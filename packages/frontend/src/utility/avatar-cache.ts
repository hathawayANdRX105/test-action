/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const PROXY_AVATAR_PATH_RE = /\/proxy\/avatar\.[^/]+$/;

export function appendAvatarCacheKey(src: string, cacheKey: string): string {
	let parsed: URL;
	const base = globalThis.location?.origin ?? 'https://example.com';
	try {
		parsed = new URL(src, base);
	} catch {
		return src;
	}

	if (!PROXY_AVATAR_PATH_RE.test(parsed.pathname)) return src;

	parsed.searchParams.set('_avatarKey', cacheKey);

	if (src.startsWith('/')) {
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	}

	return parsed.toString();
}
