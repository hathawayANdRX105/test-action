/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from '@jest/globals';
import { promiseTry } from '@/misc/promise-try.js';

describe('promiseTry', () => {
	test('wraps sync callback results', async () => {
		await expect(promiseTry(() => 'ok')).resolves.toBe('ok');
	});

	test('wraps thrown errors as rejections', async () => {
		await expect(promiseTry(() => {
			throw new Error('boom');
		})).rejects.toThrow('boom');
	});
});
