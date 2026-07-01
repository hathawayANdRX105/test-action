/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as os from '@/os.js';
import { miLocalStorage } from '@/local-storage.js';
import { fetchCustomEmojis } from '@/custom-emojis.js';
import { fetchInstance } from '@/instance.js';

async function clearBrowserCaches(): Promise<void> {
	try {
		if ('caches' in window) {
			await Promise.all((await window.caches.keys()).map(key => window.caches.delete(key)));
		}
	} catch (err) {
		console.warn('Failed to clear browser caches.', err);
	}
}

export function clearCache(): Promise<void> {
	return os.promiseDialog((async () => {
		miLocalStorage.removeItem('instance');
		miLocalStorage.removeItem('instanceCachedAt');
		miLocalStorage.removeItem('locale');
		miLocalStorage.removeItem('localeVersion');
		miLocalStorage.removeItem('theme');
		miLocalStorage.removeItem('emojis');
		miLocalStorage.removeItem('lastEmojisFetchedAt');
		await clearBrowserCaches();
		await fetchInstance(true);
		await fetchCustomEmojis(true);
	})());
}
