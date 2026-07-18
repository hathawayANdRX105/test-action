/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { MISSKEY_ID_MAX_LENGTH } from '@/server/api/input-limits.js';
import { getValidator } from '../prelude/get-api-validator.js';

describe('API misskey:id format', () => {
	const validate = getValidator({
		type: 'object',
		properties: {
			id: { type: 'string', format: 'misskey:id' },
		},
		required: ['id'],
	} as const);

	test('accepts short alphanumeric IDs', () => {
		assert.strictEqual(validate({ id: '8wvhjghbxu' }), true);
	});

	test('rejects empty and oversized IDs', () => {
		assert.strictEqual(validate({ id: '' }), false);
		assert.strictEqual(validate({ id: 'a'.repeat(MISSKEY_ID_MAX_LENGTH + 1) }), false);
	});
});
