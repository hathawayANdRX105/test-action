/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import postFormSource from '@/components/MkPostForm.vue?raw';

describe('post form layout', () => {
	test('keeps the home composer textarea to four lines', () => {
		assert.match(postFormSource, /\.homeStyle\s*\{[\s\S]*&\.root \.text\s*\{[\s\S]*height:\s*calc\(1\.55em \* 4\);[\s\S]*max-height:\s*calc\(1\.55em \* 4\);[\s\S]*resize:\s*none;/);
	});
});
