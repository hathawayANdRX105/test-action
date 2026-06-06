/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import pageWindowSource from '@/components/MkPageWindow.vue?raw';

describe('page window controls', () => {
	test('opens the show-in-page action in a new tab', () => {
		assert.match(pageWindowSource, /title: i18n\.ts\.showInPage,[\s\S]*onClick: expand/);
		assert.match(pageWindowSource, /text: i18n\.ts\.showInPage,[\s\S]*action: expand/);
		assert.match(pageWindowSource, /function expand\(\) \{[\s\S]*window\.open\(url \+ windowRouter\.getCurrentFullPath\(\), '_blank', 'noopener'\);[\s\S]*windowEl\.value\?\.close\(\);[\s\S]*\}/);
		assert.strictEqual(/function expand\(\) \{[\s\S]*mainRouter\.push\(windowRouter\.getCurrentFullPath\(\), 'forcePage'\)/.test(pageWindowSource), false);
	});
});
