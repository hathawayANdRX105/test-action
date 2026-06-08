/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiUrl } from '@@/js/config.js';
import { cloudBackup } from '@/preferences/utility.js';
import { store } from '@/store.js';
import { waiting } from '@/os.js';
import { unisonReload } from '@/utility/unison-reload.js';
import { $i } from '@/i.js';
import { miLocalStorage } from '@/local-storage.js';

export async function signout() {
	if (!$i) return;

	waiting();

	if (store.s.enablePreferencesAutoCloudBackup) {
		await cloudBackup();
	}

	miLocalStorage.removeItem('account');
	await Promise.all([
		store.set('accountTokens', {}),
		store.set('accountInfos', {}),
	]);

	//#region Remove service worker registration
	try {
		if (navigator.serviceWorker.controller) {
			const registration = await navigator.serviceWorker.ready;
			const push = await registration.pushManager.getSubscription();
			if (push) {
				await window.fetch(`${apiUrl}/sw/unregister`, {
					method: 'POST',
					body: JSON.stringify({
						endpoint: push.endpoint,
					}),
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${$i.token}`,
					},
				});
			}
		}

		await navigator.serviceWorker.getRegistrations()
			.then(registrations => {
				return Promise.all(registrations.map(registration => registration.unregister()));
			});
	} catch {
		// nothing
	}
	//#endregion

	unisonReload('/');
}
