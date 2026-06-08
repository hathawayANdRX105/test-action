/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import signoutSource from '@/signout.ts?raw';

describe('signout persistence', () => {
	test('keeps saved UI preferences and widget state when logging out', () => {
		assert.match(signoutSource, /miLocalStorage\.removeItem\('account'\)/);
		assert.match(signoutSource, /store\.set\('accountTokens',\s*\{\}\)/);
		assert.match(signoutSource, /store\.set\('accountInfos',\s*\{\}\)/);

		assert.notMatch(signoutSource, /localStorage\.clear\(\)/);
		assert.notMatch(signoutSource, /clear\(\)/);
		assert.notMatch(signoutSource, /deleteDatabase\('MisskeyClient'\)/);
	});
});
