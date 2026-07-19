/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import { api, post, signup, uploadFile, waitForTimelineNotes } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('users/notes', () => {
	let alice: misskey.entities.SignupResponse;
	let jpgNote: misskey.entities.Note;
	let pngNote: misskey.entities.Note;
	let jpgPngNote: misskey.entities.Note;

	beforeAll(async () => {
		alice = await signup({ username: 'alice' });
		// Local upload — remote github raw often times out in CI/dev.
		const jpg = (await uploadFile(alice, { path: '192.jpg' })).body!;
		const png = (await uploadFile(alice, { path: '192.png' })).body!;
		jpgNote = await post(alice, {
			fileIds: [jpg.id],
		});
		pngNote = await post(alice, {
			fileIds: [png.id],
		});
		jpgPngNote = await post(alice, {
			fileIds: [jpg.id, png.id],
		});
	}, 1000 * 60 * 2);
	test('withFiles', async () => {
		// userTimelineWithFiles is filled by async post-note fanout.
		const body = await waitForTimelineNotes('users/notes', alice, [jpgNote.id, pngNote.id, jpgPngNote.id], {
			userId: alice.id,
			withFiles: true,
		});

		assert.strictEqual(Array.isArray(body), true);
		assert.strictEqual(body.length, 3);
		assert.strictEqual(body.some(note => note.id === jpgNote.id), true);
		assert.strictEqual(body.some(note => note.id === pngNote.id), true);
		assert.strictEqual(body.some(note => note.id === jpgPngNote.id), true);
	});
});
