/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { nextTick } from 'vue';
import XForm from '@/pages/chat/room.form.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const { me, preferState } = vi.hoisted(() => ({
	me: {
		id: 'me',
		username: 'me',
		name: 'Me',
		host: null,
		avatarDecorations: [],
	} as unknown as Misskey.entities.UserLite,
	preferState: {
		'chat.sendOnEnter': true,
		uploadFolder: null,
	},
}));

vi.mock('@/i.js', () => ({
	ensureSignin: () => me,
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: preferState,
	},
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			attachFile: 'Attach file',
			cancel: 'Cancel',
			error: 'Error',
			file: 'File',
			inputMessageHere: 'Input message here',
			onlyOneFileCanBeAttached: 'Only one file can be attached',
			quote: 'Quote',
			reply: 'Reply',
			selectFile: 'Select file',
			send: 'Send',
		},
	},
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
	printError: () => 'mock error',
}));

vi.mock('@/os.js', () => ({
	alert: vi.fn(),
}));

vi.mock('@/utility/autocomplete.js', () => ({
	Autocomplete: vi.fn().mockImplementation(() => ({
		detach: vi.fn(),
	})),
}));

vi.mock('@/utility/emoji-picker.js', () => ({
	emojiPicker: {
		show: vi.fn(),
	},
}));

vi.mock('@/utility/select-file.js', () => ({
	selectFile: vi.fn(),
}));

vi.mock('@/utility/upload.js', () => ({
	uploadFile: vi.fn(),
}));

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	return { promise, resolve, reject };
}

async function flushPromises() {
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
}

function createMessage(text: string): Misskey.entities.ChatMessageLite {
	return {
		id: `server-${text}`,
		createdAt: '2026-05-31T00:00:00.000Z',
		fromUserId: me.id,
		toUserId: 'other',
		toRoomId: null,
		text,
		fileId: null,
		file: null,
		replyId: null,
		reply: null,
		quoteId: null,
		quote: null,
		reactions: [],
	};
}

function renderForm(listeners: Record<string, unknown> = {}): RenderResult {
	return render(XForm, {
		props: {
			user: {
				id: 'other',
				username: 'other',
				name: 'Other',
				host: null,
			} as unknown as Misskey.entities.UserDetailed,
			...listeners,
		},
		global: {
			stubs: {
				MkLoading: true,
			},
		},
	});
}

describe('chat room form', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
		localStorage.clear();
		preferState['chat.sendOnEnter'] = true;
	});

	test('clears the composer immediately and preserves newly typed text after send resolves', async () => {
		preferState['chat.sendOnEnter'] = true;
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const onSending = vi.fn();
		const onSent = vi.fn();
		const form = renderForm({ onSending, onSent });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'first');
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		assert.strictEqual(textarea.value, '');
		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		const createPayload = vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string };
		assert.strictEqual(createPayload.text, 'first');
		const pendingMessage = onSending.mock.calls[0][0] as { clientId: string; text: string; sendStatus: string };
		assert.strictEqual(pendingMessage.text, 'first');
		assert.strictEqual(pendingMessage.sendStatus, 'pending');

		await fireEvent.update(textarea, 'next');
		request.resolve(createMessage('first'));
		await flushPromises();

		assert.strictEqual(textarea.value, 'next');
		assert.strictEqual(onSent.mock.calls[0][1], pendingMessage.clientId);
	});

	test('ignores duplicate send attempts while a request is in flight', async () => {
		preferState['chat.sendOnEnter'] = true;
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		const sendButton = Array.from(form.container.querySelectorAll<HTMLButtonElement>('button')).at(-1);
		assert.exists(textarea);
		assert.exists(sendButton);

		await fireEvent.update(textarea, 'burst');
		sendButton.click();
		sendButton.click();
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);

		request.resolve(createMessage('burst'));
		await flushPromises();
	});
});
