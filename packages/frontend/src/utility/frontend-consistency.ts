/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { nextTick } from 'vue';
import { version } from '@@/js/config.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';

const DISPLAY_REPAIR_CLASS = '_sharkeyDisplayRepair_';
const knownFontSizeClasses = ['f-1', 'f-2', 'f-3'];
let displayRepairQueued = false;

async function clearFrontendRuntimeCaches(): Promise<void> {
	try {
		if ('caches' in window) {
			await Promise.all((await window.caches.keys()).map(key => window.caches.delete(key)));
		}
	} catch (err) {
		console.warn('Failed to clear frontend runtime caches.', err);
	}

	try {
		if ('serviceWorker' in navigator) {
			const registrations = await navigator.serviceWorker.getRegistrations();
			await Promise.all(registrations.map(registration => registration.unregister()));
		}
	} catch (err) {
		console.warn('Failed to unregister service workers during frontend consistency repair.', err);
	}
}

function clientEntryFromPage(): string | undefined {
	const value = (window as { CLIENT_ENTRY?: unknown }).CLIENT_ENTRY;
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function repairFrontendRuntimeCaches(reason: unknown, keySuffix = 'runtime'): Promise<void> {
	const repairKey = `sharkey:frontend-repair:${version}:${keySuffix}`;
	const repairAttempts = Number(window.sessionStorage.getItem(repairKey) ?? '0');
	if (repairAttempts >= 2) {
		console.warn('Frontend consistency repair skipped after repeated attempts.', reason);
		throw reason instanceof Error ? reason : new Error(String(reason));
	}

	window.sessionStorage.setItem(repairKey, String(repairAttempts + 1));
	miLocalStorage.removeItem('localeVersion');
	miLocalStorage.removeItem('locale');
	await clearFrontendRuntimeCaches();

	const url = new URL(window.location.href);
	url.searchParams.set('_frontendRepair', Date.now().toString());
	window.location.replace(url.toString());
	await new Promise<never>(() => {});
}

export async function assertFrontendAssetsCurrent(): Promise<void> {
	const currentEntry = clientEntryFromPage();
	if (_DEV_ || currentEntry == null) return;

	const res = await window.fetch(window.location.pathname + window.location.search, {
		method: 'GET',
		cache: 'no-store',
		headers: {
			'X-Frontend-Consistency-Check': '1',
		},
	});

	if (!res.ok) return;

	const html = await res.text();
	const match = html.match(/\bvar\s+CLIENT_ENTRY\s*=\s*"([^"]+)"/);
	const serverEntry = match?.[1];
	if (serverEntry == null || serverEntry === currentEntry) return;

	console.warn('Frontend assets are stale. Reloading with cleared caches.', {
		currentEntry,
		serverEntry,
	});
	await repairFrontendRuntimeCaches('stale frontend entry', 'asset-entry');
}

function applyDisplayPreferenceState(): void {
	const html = window.document.documentElement;
	const fontSize = prefer.s.fontSize;

	for (const className of knownFontSizeClasses) {
		html.classList.remove(className);
	}
	html.classList.toggle('f-1', fontSize === '1');
	html.classList.toggle('f-2', fontSize === '2');
	html.classList.toggle('f-3', fontSize === '3');
	html.classList.toggle('useSystemFont', prefer.s.useSystemFont);
	html.classList.toggle('radius-misskey', prefer.s.cornerRadius === 'misskey');
	html.classList.remove(DISPLAY_REPAIR_CLASS);

	if (fontSize === 'custom') {
		html.style.fontSize = `${prefer.s.customFontSize}px`;
	} else {
		html.style.removeProperty('font-size');
	}
}

function isColorScheme(value: unknown): value is 'dark' | 'light' {
	return value === 'dark' || value === 'light';
}

function currentColorScheme(): 'dark' | 'light' | null {
	const html = window.document.documentElement;
	const datasetColorScheme = html.dataset.colorScheme;
	if (isColorScheme(datasetColorScheme)) return datasetColorScheme;

	const persistedColorScheme = miLocalStorage.getItem('colorScheme');
	if (isColorScheme(persistedColorScheme)) return persistedColorScheme;

	const inlineColorScheme = html.style.getPropertyValue('color-scheme');
	if (inlineColorScheme.includes('dark')) return 'dark';
	if (inlineColorScheme.includes('light')) return 'light';

	try {
		const computedColorScheme = window.getComputedStyle(html).colorScheme;
		if (computedColorScheme.includes('dark')) return 'dark';
		if (computedColorScheme.includes('light')) return 'light';
	} catch (err) {
		console.warn('Failed to read computed color scheme during display repair.', err);
	}

	return null;
}

function verifyColorSchemeState(): void {
	const html = window.document.documentElement;
	const colorScheme = currentColorScheme();
	if (colorScheme == null) return;

	if (html.dataset.colorScheme !== colorScheme) {
		html.dataset.colorScheme = colorScheme;
	}

	if (html.style.getPropertyValue('color-scheme') !== colorScheme) {
		html.style.setProperty('color-scheme', colorScheme, 'important');
	}

	if (!isColorScheme(miLocalStorage.getItem('colorScheme'))) {
		miLocalStorage.setItem('colorScheme', colorScheme);
	}
}

export function restoreDisplayStateNow(): void {
	applyDisplayPreferenceState();
	verifyColorSchemeState();
}

export function queueDisplayStateRestore(): void {
	if (displayRepairQueued) return;
	displayRepairQueued = true;

	window.document.documentElement.classList.add(DISPLAY_REPAIR_CLASS);
	window.requestAnimationFrame(() => {
		nextTick(() => {
			displayRepairQueued = false;
			restoreDisplayStateNow();
			window.setTimeout(restoreDisplayStateNow, 250);
			window.setTimeout(restoreDisplayStateNow, 1000);
		});
	});
}
