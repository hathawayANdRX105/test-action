/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { existsSync, readFileSync } from 'node:fs';

describe('user profile content redesign source', () => {
	const usersNotesSource = readFileSync(new URL('../../src/server/api/endpoints/users/notes.ts', import.meta.url), 'utf8');
	const endpointListSource = readFileSync(new URL('../../src/server/api/endpoint-list.ts', import.meta.url), 'utf8');
	const notePiningSource = readFileSync(new URL('../../src/core/NotePiningService.ts', import.meta.url), 'utf8');

	test('users/notes supports filtering one user by channel', () => {
		assert.match(usersNotesSource, /channelId:\s*\{\s*type:\s*'string',\s*format:\s*'misskey:id'/);
		assert.match(usersNotesSource, /channelId:\s*ps\.channelId/);
		assert.match(usersNotesSource, /if \(ps\.channelId != null\) \{\s*query\.andWhere\('note\.channelId = :channelId'/);
	});

	test('users/note-channels endpoint is registered', () => {
		assert.ok(existsSync(new URL('../../src/server/api/endpoints/users/note-channels.ts', import.meta.url)));
		assert.match(endpointListSource, /export \* as 'users\/note-channels'/);
	});

	test('pinning allows visible public notes from other users but only federates own notes', () => {
		assert.match(notePiningSource, /note\.userId === user\.id/);
		assert.match(notePiningSource, /note\.visibility !== 'public'/);
		assert.match(notePiningSource, /note\.userId === user\.id[\s\S]*deliverPinnedChange/);
	});
});
