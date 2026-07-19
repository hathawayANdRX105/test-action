/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test, beforeEach } from 'vitest';
import { compareVersions } from 'compare-versions';

// Lightweight unit tests for the pure compare/unread logic mirrored from changelog.ts.
// (We avoid importing the module because it pulls Vue + config at load time.)

function safeCompare(a: string, b: string): number {
	try {
		return compareVersions(a, b);
	} catch {
		return a === b ? 0 : 1;
	}
}

function computeHasUnread(current: string, seen: string | null): boolean {
	if (seen == null) return false;
	return safeCompare(current, seen) === 1;
}

describe('changelog unread state', () => {
	test('no lastSeen means not unread (existing users)', () => {
		assert.equal(computeHasUnread('2025.5.2-dev', null), false);
	});

	test('same version is read', () => {
		assert.equal(computeHasUnread('2025.5.2-dev', '2025.5.2-dev'), false);
	});

	test('newer current than seen is unread', () => {
		assert.equal(computeHasUnread('2025.5.2-dev', '2025.5.0'), true);
		assert.equal(computeHasUnread('2025.5.1', '2025.4.1'), true);
	});

	test('older current than seen is not unread', () => {
		assert.equal(computeHasUnread('2025.4.1', '2025.5.0'), false);
	});
});
