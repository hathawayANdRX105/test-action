/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { compareVersions } from 'compare-versions';
import { ref } from 'vue';
import { version, lang } from '@@/js/config.js';
import { currentChangelog, type ChangelogLine } from '@/changelog/current.js';
import { miLocalStorage } from '@/local-storage.js';

export const LAST_SEEN_CHANGELOG_VERSION_KEY = 'lastSeenChangelogVersion' as const;

/** Reactive unread flag for navbar green-dot. */
export const hasUnreadChangelog = ref(computeHasUnreadChangelog());

function safeCompare(a: string, b: string): number {
	try {
		return compareVersions(a, b);
	} catch {
		// Fall back to string inequality when versions are non-semver.
		return a === b ? 0 : 1;
	}
}

export function getLastSeenChangelogVersion(): string | null {
	return miLocalStorage.getItem(LAST_SEEN_CHANGELOG_VERSION_KEY);
}

export function computeHasUnreadChangelog(): boolean {
	const seen = getLastSeenChangelogVersion();
	if (seen == null) {
		// First visit after this feature: treat current version as already seen
		// so we don't force a green dot on every existing user. Upgrade path
		// still lights up because isClientUpdated opens the panel and only
		// markChangelogRead() clears it after the user acknowledges.
		return false;
	}
	return safeCompare(version, seen) === 1;
}

export function refreshUnreadChangelog(): void {
	hasUnreadChangelog.value = computeHasUnreadChangelog();
}

export function markChangelogRead(targetVersion: string = version): void {
	miLocalStorage.setItem(LAST_SEEN_CHANGELOG_VERSION_KEY, targetVersion);
	refreshUnreadChangelog();
}

/**
 * On client upgrade, seed unread state without auto-acking.
 * Call after detecting isClientUpdated so the green dot stays until the user reads.
 */
export function noteClientUpgradedFrom(previousVersion: string | null): void {
	const seen = getLastSeenChangelogVersion();
	if (seen == null && previousVersion != null) {
		// Migrate: treat previous app version as last seen so the new version shows as unread.
		miLocalStorage.setItem(LAST_SEEN_CHANGELOG_VERSION_KEY, previousVersion);
	} else if (seen == null) {
		// No prior version info — leave unset so computeHasUnreadChangelog stays false
		// until the first upgrade after this feature ships.
	}
	refreshUnreadChangelog();
}

export function pickChangelogLine(line: ChangelogLine): string {
	const l = (lang ?? 'en-US').toLowerCase();
	if (l.startsWith('zh')) return line.zh;
	return line.en;
}

export function getChangelogForDisplay() {
	return {
		version: currentChangelog.version || version,
		runningVersion: version,
		highlights: currentChangelog.highlights.map(pickChangelogLine),
		tips: currentChangelog.tips.map(pickChangelogLine),
	};
}
