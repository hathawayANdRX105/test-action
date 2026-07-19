/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import dialogSource from '@/components/MkUserSetupDialog.vue?raw';

describe('user setup wizard persistence', () => {
	test('persists completion before closing or opening the tutorial', () => {
		assert.match(dialogSource, /async function setupComplete\(\) \{[\s\S]*?await store\.set\('accountSetupWizard', -1\);[\s\S]*?dialog\.value\?\.close\(\);/);
		assert.match(dialogSource, /async function close\(skip: boolean\) \{[\s\S]*?await setupComplete\(\);/);
		assert.match(dialogSource, /async function launchTutorial\(\) \{[\s\S]*?await setupComplete\(\);[\s\S]*?nextTick\(/);
	});
});
