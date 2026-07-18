/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import createToUserEndpointSource from '../../backend/src/server/api/endpoints/chat/messages/create-to-user.ts?raw';
import usersRelationEndpointSource from '../../backend/src/server/api/endpoints/users/relation.ts?raw';
import userFollowingServiceSource from '../../backend/src/core/UserFollowingService.ts?raw';
import type { RenderResult } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import XForm from '@/pages/chat/room.form.vue';
import formSource from '@/pages/chat/room.form.vue?raw';
import { misskeyApi } from '@/utility/misskey-api.js';
import { selectFiles } from '@/utility/select-file.js';
import { uploadFile } from '@/utility/upload.js';

const { me, preferState, uploadsRef } = vi.hoisted(() => ({
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
	uploadsRef: {
		value: [],
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
			attachCancel: 'Remove attachment',
			cancel: 'Cancel',
			error: 'Error',
			file: 'File',
			inputMessageHere: 'Input message here',
			onlyOneFileCanBeAttached: 'Only one file can be attached',
			quote: 'Quote',
			reply: 'Reply',
			selectFile: 'Select file',
			send: 'Send',
			uploading: 'Uploading',
			_chat: {
				blockedByKeyword: 'Blocked by keyword',
				cannotChatWithTheUser: 'Cannot start a chat with this user',
				cannotChatWithTheUser_description: 'Chat is unavailable.',
				slowMode: 'Slow mode',
			},
		},
		tsx: {
			_chat: {
				slowModeActive: ({ n }: { n: number }) => `Slow mode ${n}`,
			},
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
	selectFiles: vi.fn(),
}));

vi.mock('@/utility/upload.js', () => ({
	uploadFile: vi.fn(),
	uploads: uploadsRef,
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

async function waitMacrotask() {
	await new Promise<void>(resolve => window.setTimeout(resolve, 0));
	await nextTick();
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

function createDriveFile(name: string): Misskey.entities.DriveFile {
	return {
		id: `file-${name}`,
		createdAt: '2026-05-31T00:00:00.000Z',
		name,
		type: 'image/png',
		md5: '',
		size: 1024,
		isSensitive: false,
		blurhash: null,
		properties: {},
		url: `https://example.test/${name}`,
		thumbnailUrl: `https://example.test/thumb-${name}`,
		comment: null,
		folderId: null,
		userId: me.id,
		user: me,
	} as unknown as Misskey.entities.DriveFile;
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
		uploadsRef.value = [];
	});

	test('keeps long attachment names from widening the mobile composer', () => {
		assert.match(formSource, /\.root\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;/);
		assert.match(formSource, /\.composer\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*box-sizing:\s*border-box;/);
		assert.match(formSource, /\.files\s*\{[\s\S]*min-width:\s*0;[\s\S]*max-width:\s*100%;[\s\S]*overflow-x:\s*hidden;/);
		assert.match(formSource, /\.file,\s*\.uploadingFile\s*\{[\s\S]*min-width:\s*0;[\s\S]*box-sizing:\s*border-box;/);
		assert.match(formSource, /\.file\s*\{[\s\S]*flex:\s*0 1 min\(420px,\s*100%\);[\s\S]*width:\s*auto;/);
		assert.match(formSource, /\.file > \.fileName\s*\{[\s\S]*flex:\s*1 1 auto;/);
		assert.match(formSource, /\.fileName\s*\{[\s\S]*text-overflow:\s*ellipsis;[\s\S]*white-space:\s*nowrap;/);
	});

	test('maps direct-message permission failures to user-facing API errors instead of 500s', () => {
		assert.match(createToUserEndpointSource, /recipientCannotChat: \{[\s\S]*code: 'RECIPIENT_CANNOT_CHAT'[\s\S]*kind: 'permission'/);
		assert.match(createToUserEndpointSource, /recipientChatUnavailable: \{[\s\S]*code: 'RECIPIENT_CHAT_UNAVAILABLE'[\s\S]*kind: 'permission'/);
		assert.match(createToUserEndpointSource, /chatUnavailable: \{[\s\S]*code: 'CHAT_UNAVAILABLE'[\s\S]*kind: 'permission'/);
		assert.match(createToUserEndpointSource, /err\.message === 'recipient is cannot chat \(policy\)'[\s\S]*meta\.errors\.recipientChatUnavailable/);
		assert.match(createToUserEndpointSource, /err\.message\.startsWith\('recipient is cannot chat \('/);
		assert.match(createToUserEndpointSource, /throw new ApiError\(meta\.errors\.recipientCannotChat/);
		assert.match(createToUserEndpointSource, /err\.message === 'blocked'[\s\S]*meta\.errors\.youHaveBeenBlocked/);
		assert.match(formSource, /code === 'RECIPIENT_CANNOT_CHAT' \|\| code === 'RECIPIENT_CHAT_UNAVAILABLE'/);
		assert.match(formSource, /title: i18n\.ts\._chat\.cannotChatWithTheUser/);
	});

	test('keeps user relation responses keyed by the requested target and verifies mutual follows directly', () => {
		assert.match(usersRelationEndpointSource, /id: rel\.targetUserId/);
		assert.strictEqual(/id: rel\.userId/.test(usersRelationEndpointSource), false);
		assert.match(userFollowingServiceSource, /public async isMutual\(aUserId: MiUser\['id'\], bUserId: MiUser\['id'\]\): Promise<boolean> \{[\s\S]*followingsRepository\.createQueryBuilder\('following'\)/);
		assert.match(userFollowingServiceSource, /following\.followerId = :aUserId[\s\S]*following\.followeeId = :bUserId/);
		assert.match(userFollowingServiceSource, /following\.followerId = :bUserId[\s\S]*following\.followeeId = :aUserId/);
		assert.match(userFollowingServiceSource, /return count >= 2;/);
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

	test('does not send while IME composition is confirming text with Enter', async () => {
		preferState['chat.sendOnEnter'] = true;
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'pin');
		await fireEvent.compositionStart(textarea);
		await fireEvent.keyDown(textarea, { key: 'Enter', isComposing: true });
		await fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });
		await fireEvent.compositionEnd(textarea);
		await waitMacrotask();
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 0);
		assert.strictEqual(textarea.value, 'pin');

		await fireEvent.keyUp(textarea, { key: 'Enter' });
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		const createPayload = vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string };
		assert.strictEqual(createPayload.text, 'pin');

		request.resolve(createMessage('pin'));
		await flushPromises();
	});

	test('keeps Shift+Enter as a native multiline edit instead of sending', async () => {
		preferState['chat.sendOnEnter'] = true;
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'line one');
		const notPrevented = textarea.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'Enter',
			shiftKey: true,
			bubbles: true,
			cancelable: true,
		}));

		assert.strictEqual(notPrevented, true);
		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 0);
		assert.strictEqual(textarea.value, 'line one');
	});

	test('keeps Ctrl+Enter sending available when Enter inserts new lines', async () => {
		preferState['chat.sendOnEnter'] = false;
		vi.mocked(misskeyApi).mockResolvedValueOnce(createMessage('line one\nline two') as never);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'line one\nline two');
		const enterNotPrevented = textarea.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true,
		}));

		assert.strictEqual(enterNotPrevented, true);
		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 0);

		await fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		const createPayload = vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string };
		assert.strictEqual(createPayload.text, 'line one\nline two');
	});

	test('does not send Ctrl+Enter while IME composition is active', async () => {
		preferState['chat.sendOnEnter'] = false;
		vi.mocked(misskeyApi).mockResolvedValueOnce(createMessage('candidate') as never);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'candidate');
		await fireEvent.compositionStart(textarea);
		await fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true, isComposing: true });
		await fireEvent.compositionEnd(textarea);
		await waitMacrotask();
		await fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 0);
		assert.strictEqual(textarea.value, 'candidate');

		await fireEvent.keyUp(textarea, { key: 'Enter' });
		await fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		const createPayload = vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string };
		assert.strictEqual(createPayload.text, 'candidate');
	});

	test('restores the draft when sending fails before the user types a new message', async () => {
		preferState['chat.sendOnEnter'] = true;
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const onSendFailed = vi.fn();
		const form = renderForm({ onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'please keep this');
		await fireEvent.keyDown(textarea, { key: 'Enter' });

		assert.strictEqual(textarea.value, '');

		request.reject(new Error('network failed'));
		await flushPromises();
		await waitMacrotask();
		await flushPromises();

		assert.strictEqual(onSendFailed.mock.calls.length, 1);
		assert.strictEqual(textarea.value, 'please keep this');
	});

	test('shows an explicit remove button for an attached file', async () => {
		vi.mocked(selectFiles).mockResolvedValueOnce([createDriveFile('photo.png')]);
		const form = renderForm();

		await fireEvent.click(form.getByTitle('Attach file'));
		await flushPromises();

		const attachedFile = form.container.querySelector('[data-chat-attached-file]');
		assert.exists(attachedFile);
		assert.ok(attachedFile.textContent?.includes('photo.png'));

		await fireEvent.click(form.getByLabelText('Remove attachment'));
		await flushPromises();

		assert.strictEqual(form.container.querySelector('[data-chat-attached-file]'), null);
		assert.strictEqual(form.queryByLabelText('Remove attachment'), null);
	});

	test('sends multiple attached files as ordered chat messages', async () => {
		const firstFile = createDriveFile('one.png');
		const secondFile = createDriveFile('two.png');
		vi.mocked(selectFiles).mockResolvedValueOnce([firstFile, secondFile]);
		vi.mocked(misskeyApi)
			.mockResolvedValueOnce(createMessage('one') as never)
			.mockResolvedValueOnce(createMessage('two') as never);
		const onSending = vi.fn();
		const onSent = vi.fn();
		const form = renderForm({ onSending, onSent });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		const sendButton = Array.from(form.container.querySelectorAll<HTMLButtonElement>('button')).at(-1);
		assert.exists(textarea);
		assert.exists(sendButton);

		await fireEvent.click(form.getByTitle('Attach file'));
		await flushPromises();
		await fireEvent.update(textarea, 'album');
		await fireEvent.click(sendButton);
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 2);
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string; fileId?: string }).text, 'album');
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string; fileId?: string }).fileId, firstFile.id);
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[1]![1] as { text?: string; fileId?: string }).text, undefined);
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[1]![1] as { text?: string; fileId?: string }).fileId, secondFile.id);
		assert.strictEqual(onSending.mock.calls.length, 2);
		assert.strictEqual(onSent.mock.calls.length, 2);
	});

	test('uploads every pasted file and attaches each completed upload', async () => {
		const firstUpload = deferred<Misskey.entities.DriveFile>();
		const secondUpload = deferred<Misskey.entities.DriveFile>();
		vi.mocked(uploadFile)
			.mockReturnValueOnce(Object.assign(firstUpload.promise, { id: 'upload-1' }) as ReturnType<typeof uploadFile>)
			.mockReturnValueOnce(Object.assign(secondUpload.promise, { id: 'upload-2' }) as ReturnType<typeof uploadFile>);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);
		const firstPastedFile = new File(['one'], 'one.png', { type: 'image/png', lastModified: 1000 });
		const secondPastedFile = new File(['two'], 'two.png', { type: 'image/png', lastModified: 2000 });

		await fireEvent.paste(textarea, {
			clipboardData: {
				items: [
					{ kind: 'file', getAsFile: () => firstPastedFile },
					{ kind: 'file', getAsFile: () => secondPastedFile },
				],
			},
		});
		await flushPromises();

		assert.strictEqual(vi.mocked(uploadFile).mock.calls.length, 2);
		firstUpload.resolve(createDriveFile('one.png'));
		secondUpload.resolve(createDriveFile('two.png'));
		await flushPromises();

		const attachedFiles = form.container.querySelectorAll('[data-chat-attached-file]');
		assert.strictEqual(attachedFiles.length, 2);
		assert.ok(attachedFiles[0]?.textContent?.includes('one.png'));
		assert.ok(attachedFiles[1]?.textContent?.includes('two.png'));
	});
});
