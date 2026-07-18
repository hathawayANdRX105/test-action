/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import createToUserEndpointSource from '../../backend/src/server/api/endpoints/chat/messages/create-to-user.ts?raw';
import usersRelationEndpointSource from '../../backend/src/server/api/endpoints/users/relation.ts?raw';
import userFollowingServiceSource from '../../backend/src/core/UserFollowingService.ts?raw';
import type { RenderResult } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import XForm from '@/pages/chat/room.form.vue';
import formSource from '@/pages/chat/room.form.vue?raw';
import messageSource from '@/pages/chat/XMessage.vue?raw';
import roomSource from '@/pages/chat/room.vue?raw';
import type { NormalizedChatMessage } from '@/pages/chat/room.vue';
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
		value: [] as Array<{ id: string; name?: string; img?: string; progressValue?: number; progressMax?: number }>,
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

async function waitImeGuard() {
	await new Promise<void>(resolve => window.setTimeout(resolve, 220));
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

function createReferenceMessage(id: string, text: string): NormalizedChatMessage {
	return {
		id,
		createdAt: '2026-05-31T00:00:00.000Z',
		fromUserId: 'other',
		fromUser: {
			id: 'other',
			username: 'other',
			name: 'Other',
			host: null,
			avatarDecorations: [],
		} as unknown as Misskey.entities.UserLite,
		toUserId: me.id,
		toRoomId: null,
		text,
		fileId: null,
		file: null,
		replyId: null,
		reply: null,
		quoteId: null,
		quote: null,
		replyUnavailable: false,
		quoteUnavailable: false,
		reactions: [],
	} as unknown as NormalizedChatMessage;
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

function createRoom(id: string): Misskey.entities.ChatRoom {
	return {
		id,
		ownerId: me.id,
		owner: me,
		name: id,
		description: '',
		memberCount: 2,
		memberLimit: 100,
	} as unknown as Misskey.entities.ChatRoom;
}

function readChatDrafts(): Record<string, { data: { text?: string; replyTarget?: NormalizedChatMessage | null; quoteTarget?: NormalizedChatMessage | null } }> {
	return JSON.parse(localStorage.getItem('chatMessageDrafts') ?? '{}');
}

const renderGlobal = {
	stubs: {
		MkLoading: true,
	},
};

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
		global: renderGlobal,
	});
}

function renderControlledForm(options: {
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTarget?: NormalizedChatMessage | null;
	quoteTarget?: NormalizedChatMessage | null;
	onSending?: ReturnType<typeof vi.fn>;
	onSent?: ReturnType<typeof vi.fn>;
	onBeforeSendFailureRecovery?: ReturnType<typeof vi.fn>;
	onSendFailed?: ReturnType<typeof vi.fn>;
} = {}) {
	const replyTarget = ref<NormalizedChatMessage | null>(options.replyTarget ?? null);
	const quoteTarget = ref<NormalizedChatMessage | null>(options.quoteTarget ?? null);
	const onClearReply = vi.fn(() => {
		replyTarget.value = null;
	});
	const onClearQuote = vi.fn(() => {
		quoteTarget.value = null;
	});
	const onRestoreReferences = vi.fn((payload: { replyTarget: NormalizedChatMessage | null; quoteTarget: NormalizedChatMessage | null }) => {
		replyTarget.value = payload.replyTarget;
		quoteTarget.value = payload.quoteTarget;
	});

	const Component = defineComponent({
		setup() {
			return () => h(XForm, {
				user: options.user === undefined ? {
					id: 'other',
					username: 'other',
					name: 'Other',
					host: null,
				} as unknown as Misskey.entities.UserDetailed : options.user,
				room: options.room,
				replyTarget: replyTarget.value,
				quoteTarget: quoteTarget.value,
				onSending: options.onSending,
				onSent: options.onSent,
				onBeforeSendFailureRecovery: options.onBeforeSendFailureRecovery,
				onSendFailed: options.onSendFailed,
				onClearReply,
				onClearQuote,
				onRestoreReferences,
			});
		},
	});

	return {
		...render(Component, { global: renderGlobal }),
		replyTarget,
		quoteTarget,
		onClearReply,
		onClearQuote,
		onRestoreReferences,
	};
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

	test('clears reply state and draft data after a successful send', async () => {
		const replyTarget = createReferenceMessage('reply-1', 'reply source');
		vi.mocked(misskeyApi).mockResolvedValueOnce(createMessage('reply ok') as never);
		const onClearReply = vi.fn();
		const onClearQuote = vi.fn();
		const onSent = vi.fn();
		const form = renderForm({ replyTarget, onClearReply, onClearQuote, onSent });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'reply body');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(textarea.value, '');
		assert.strictEqual(onClearReply.mock.calls.length, 1);
		assert.strictEqual(onClearQuote.mock.calls.length, 1);
		assert.strictEqual(onSent.mock.calls.length, 1);
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[0]![1] as { replyId?: string; text?: string }).replyId, replyTarget.id);
		assert.strictEqual(readChatDrafts()['user:other'], undefined);
	});

	test('clears quote state through the parent after a successful send', async () => {
		const quoteTarget = createReferenceMessage('quote-success', 'quote success source');
		vi.mocked(misskeyApi).mockResolvedValueOnce(createMessage('quote ok') as never);
		const onSent = vi.fn();
		const form = renderControlledForm({ quoteTarget, onSent });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);
		assert.ok(form.getByText('quote success source'));

		await fireEvent.update(textarea, 'quote body');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(textarea.value, '');
		assert.strictEqual(form.quoteTarget.value, null);
		assert.strictEqual(form.queryByText('quote success source'), null);
		assert.strictEqual(form.onClearQuote.mock.calls.length, 1);
		assert.strictEqual(onSent.mock.calls.length, 1);
		assert.strictEqual((vi.mocked(misskeyApi).mock.calls[0]![1] as { quoteId?: string; text?: string }).quoteId, quoteTarget.id);
		assert.strictEqual(readChatDrafts()['user:other'], undefined);
	});

	test('restores text and quote state after a failed send', async () => {
		const quoteTarget = createReferenceMessage('quote-1', 'quote source');
		vi.mocked(misskeyApi).mockRejectedValueOnce({ code: 'BLOCKED_BY_KEYWORD' } as never);
		const onSendFailed = vi.fn();
		const onRestoreReferences = vi.fn();
		const form = renderForm({ quoteTarget, onSendFailed, onRestoreReferences });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'retry this');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(textarea.value, 'retry this');
		assert.strictEqual(onSendFailed.mock.calls.length, 1);
		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: true, currentSnapshotConfirmed: false });
		assert.deepStrictEqual(onRestoreReferences.mock.calls[0][0], {
			replyTarget: null,
			quoteTarget,
		});
		const restoredDraft = readChatDrafts()['user:other'];
		assert.strictEqual(restoredDraft?.data.text, 'retry this');
		assert.strictEqual(restoredDraft?.data.quoteTarget?.id, quoteTarget.id);
	});

	test('restores reply state through the parent after a failed send', async () => {
		const replyTarget = createReferenceMessage('reply-fail', 'reply failure source');
		vi.mocked(misskeyApi).mockRejectedValueOnce({ code: 'BLOCKED_BY_KEYWORD' } as never);
		const onSendFailed = vi.fn();
		const form = renderControlledForm({ replyTarget, onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);
		assert.ok(form.getByText('reply failure source'));

		await fireEvent.update(textarea, 'retry reply');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(textarea.value, 'retry reply');
		assert.strictEqual(form.replyTarget.value?.id, replyTarget.id);
		assert.ok(form.getByText('reply failure source'));
		assert.strictEqual(form.onClearReply.mock.calls.length, 1);
		assert.deepStrictEqual(form.onRestoreReferences.mock.calls[0][0], {
			replyTarget,
			quoteTarget: null,
		});
		assert.strictEqual(onSendFailed.mock.calls.length, 1);
		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: true, currentSnapshotConfirmed: false });
		const restoredDraft = readChatDrafts()['user:other'];
		assert.strictEqual(restoredDraft?.data.text, 'retry reply');
		assert.strictEqual(restoredDraft?.data.replyTarget?.id, replyTarget.id);
	});

	test('does not restore an already stream-confirmed send after the HTTP request rejects', async () => {
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const onBeforeSendFailureRecovery = vi.fn((_clientId: string, options: { skipCurrentSnapshot: boolean }) => {
			options.skipCurrentSnapshot = true;
		});
		const onSendFailed = vi.fn();
		const form = renderForm({ onBeforeSendFailureRecovery, onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'already confirmed');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		request.reject({ code: 'NETWORK_TIMEOUT' });
		await flushPromises();

		assert.strictEqual(textarea.value, '');
		assert.strictEqual(readChatDrafts()['user:other'], undefined);
		assert.strictEqual(onBeforeSendFailureRecovery.mock.calls.length, 1);
		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: false, currentSnapshotConfirmed: true });
	});

	test('reports unrestored failures so the parent can keep a failed local message', async () => {
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const onSendFailed = vi.fn();
		const form = renderForm({ onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'first attempt');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();
		await fireEvent.update(textarea, 'new draft');
		await flushPromises();

		request.reject({ code: 'BLOCKED_BY_KEYWORD' });
		await flushPromises();

		assert.strictEqual(textarea.value, 'new draft');
		assert.strictEqual(onSendFailed.mock.calls.length, 1);
		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: false, currentSnapshotConfirmed: false });
		assert.strictEqual(readChatDrafts()['user:other']?.data.text, 'new draft');
	});

	test('keeps unsent attachments visible as failed local messages when a multi-file send cannot be restored', async () => {
		const firstFile = createDriveFile('first.png');
		const secondFile = createDriveFile('second.png');
		const request = deferred<Misskey.entities.ChatMessageLite>();
		vi.mocked(selectFiles).mockResolvedValueOnce([firstFile, secondFile]);
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		const onSending = vi.fn();
		const onSendFailed = vi.fn();
		const form = renderForm({ onSending, onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		const sendButton = Array.from(form.container.querySelectorAll<HTMLButtonElement>('button')).at(-1);
		assert.exists(textarea);
		assert.exists(sendButton);

		await fireEvent.click(form.getByTitle('Attach file'));
		await flushPromises();
		await fireEvent.update(textarea, 'album');
		await fireEvent.click(sendButton);
		await flushPromises();
		await fireEvent.update(textarea, 'new draft');
		await flushPromises();

		request.reject({ code: 'BLOCKED_BY_KEYWORD' });
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		assert.strictEqual(onSending.mock.calls.length, 2);
		assert.strictEqual((onSending.mock.calls[0][0] as { sendStatus?: string; file?: Misskey.entities.DriveFile | null }).sendStatus, 'pending');
		assert.strictEqual((onSending.mock.calls[0][0] as { file?: Misskey.entities.DriveFile | null }).file?.id, firstFile.id);
		assert.strictEqual((onSending.mock.calls[1][0] as { sendStatus?: string; file?: Misskey.entities.DriveFile | null }).sendStatus, 'failed');
		assert.strictEqual((onSending.mock.calls[1][0] as { file?: Misskey.entities.DriveFile | null }).file?.id, secondFile.id);
		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: false, currentSnapshotConfirmed: false });
		assert.strictEqual(textarea.value, 'new draft');
	});

	test('does not restore a failed send into a composer that is uploading the next draft attachment', async () => {
		const request = deferred<Misskey.entities.ChatMessageLite>();
		const upload = deferred<Misskey.entities.DriveFile>();
		vi.mocked(misskeyApi).mockReturnValueOnce(request.promise as ReturnType<typeof misskeyApi>);
		vi.mocked(uploadFile).mockReturnValueOnce(Object.assign(upload.promise, { id: 'upload-next' }) as ReturnType<typeof uploadFile>);
		uploadsRef.value = [{
			id: 'upload-next',
			name: 'next.png',
			img: '',
		}];
		const onSendFailed = vi.fn();
		const form = renderForm({ onSendFailed });
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'old failed text');
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();
		await fireEvent.paste(textarea, {
			clipboardData: {
				items: [
					{ kind: 'file', getAsFile: () => new File(['next'], 'next.png', { type: 'image/png' }) },
				],
			},
		});
		await flushPromises();

		request.reject({ code: 'BLOCKED_BY_KEYWORD' });
		await flushPromises();

		assert.deepStrictEqual(onSendFailed.mock.calls[0][1], { restored: false, currentSnapshotConfirmed: false });
		assert.strictEqual(textarea.value, '');

		upload.resolve(createDriveFile('next.png'));
		await flushPromises();

		assert.strictEqual(textarea.value, '');
		assert.strictEqual(form.container.querySelectorAll('[data-chat-attached-file]').length, 1);
		assert.ok(form.container.querySelector('[data-chat-attached-file]')?.textContent?.includes('next.png'));
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
		const postCompositionEnterNotPrevented = textarea.dispatchEvent(new KeyboardEvent('keydown', {
			key: 'Enter',
			bubbles: true,
			cancelable: true,
		}));

		assert.strictEqual(postCompositionEnterNotPrevented, false);
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

	test('does not keep the IME guard after composition ends without Enter', async () => {
		preferState['chat.sendOnEnter'] = true;
		vi.mocked(misskeyApi).mockResolvedValueOnce(createMessage('candidate') as never);
		const form = renderForm();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		await fireEvent.update(textarea, 'candidate');
		await fireEvent.compositionStart(textarea);
		await fireEvent.compositionEnd(textarea);
		await waitImeGuard();
		await fireEvent.keyDown(textarea, { key: 'Enter' });
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.length, 1);
		const createPayload = vi.mocked(misskeyApi).mock.calls[0]![1] as { text?: string };
		assert.strictEqual(createPayload.text, 'candidate');
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

	test('restores the draft and saved reference for the active room only', async () => {
		const quoteTarget = createReferenceMessage('quote-draft', 'saved quote');
		localStorage.setItem('chatMessageDrafts', JSON.stringify({
			'room:room-a': {
				updatedAt: '2026-05-31T00:00:00.000Z',
				data: {
					text: 'room draft',
					files: [],
					replyTarget: null,
					quoteTarget,
				},
			},
		}));
		const onRestoreReferences = vi.fn();
		const roomAForm = renderForm({ user: null, room: createRoom('room-a'), onRestoreReferences });
		await flushPromises();
		const roomATextarea = roomAForm.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(roomATextarea);

		assert.strictEqual(roomATextarea.value, 'room draft');
		assert.deepStrictEqual(onRestoreReferences.mock.calls[0][0], {
			replyTarget: null,
			quoteTarget,
		});

		cleanup();
		onRestoreReferences.mockClear();
		const roomBForm = renderForm({ user: null, room: createRoom('room-b'), onRestoreReferences });
		await flushPromises();
		const roomBTextarea = roomBForm.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(roomBTextarea);

		assert.strictEqual(roomBTextarea.value, '');
		assert.strictEqual(onRestoreReferences.mock.calls.length, 0);
	});

	test('saves a reference-only draft for refresh recovery', async () => {
		const replyTarget = createReferenceMessage('reply-draft', 'reference only');
		const form = renderForm();

		await form.rerender({ replyTarget });
		await flushPromises();

		const savedDraft = readChatDrafts()['user:other'];
		assert.strictEqual(savedDraft?.data.text, '');
		assert.strictEqual(savedDraft?.data.replyTarget?.id, replyTarget.id);
	});

	test('ignores malformed draft storage when restoring and saving', async () => {
		localStorage.setItem('chatMessageDrafts', 'null');
		const form = renderForm();
		await flushPromises();
		const textarea = form.container.querySelector<HTMLTextAreaElement>('textarea');
		assert.exists(textarea);

		assert.strictEqual(textarea.value, '');

		await fireEvent.update(textarea, 'safe draft');
		await flushPromises();

		assert.strictEqual(readChatDrafts()['user:other']?.data.text, 'safe draft');
	});

	test('keeps unrestored failed sends as local messages instead of dropping them', () => {
		assert.match(roomSource, /sendStatus\?: 'pending' \| 'failed';/);
		assert.match(roomSource, /function isLocalSendMessage\(message: NormalizedChatMessage\): boolean \{[\s\S]*message\.sendStatus === 'pending' \|\| message\.sendStatus === 'failed';/);
		assert.match(roomSource, /isPending: isLocalSendMessage/);
		assert.match(roomSource, /function markPendingMessageFailed\(clientId: string\) \{[\s\S]*sendStatus: 'failed'/);
		assert.match(roomSource, /function onSendMessageFailed\(clientId: string, options\?: \{ restored\?: boolean; currentSnapshotConfirmed\?: boolean \}\) \{[\s\S]*markPendingMessageFailed\(clientId\);/);
		assert.match(messageSource, /const isFailed = computed\(\(\) => \(props\.message as MessageWithSendState\)\.sendStatus === 'failed'\);/);
		assert.match(messageSource, /v-else-if="isFailed"/);
		assert.match(messageSource, /v-if="!isLocalSendState"/);
		assert.match(messageSource, /function onReactionClick\(record: VisibleReaction\) \{[\s\S]*if \(isLocalSendState\.value \|\| \$i\.policies\.chatAvailability !== 'available'\) return;/);
	});

	test('does not remove or restore a message already confirmed by the stream when HTTP later fails', () => {
		assert.match(roomSource, /@beforeSendFailureRecovery="onBeforeSendFailureRecovery"/);
		assert.match(formSource, /emit\('beforeSendFailureRecovery', snapshot\.clientId, recovery\);[\s\S]*const snapshotsToRecover = recovery\.skipCurrentSnapshot \? snapshots\.slice\(index \+ 1\) : snapshots\.slice\(index\);/);
		assert.match(formSource, /currentSnapshotConfirmed: recovery\.skipCurrentSnapshot/);
		assert.match(formSource, /if \(recovery\.skipCurrentSnapshot && snapshotsToRecover\.length === 0\) return;/);
		assert.match(roomSource, /function hasConfirmedLocalMessage\(clientId: string\): boolean \{[\s\S]*message\.clientId === clientId && !isLocalSendMessage\(message\)/);
		assert.match(roomSource, /function removePendingMessage\(clientId: string\) \{[\s\S]*message\.clientId === clientId && isPendingMessage\(message\)/);
		assert.match(roomSource, /function onBeforeSendFailureRecovery\(clientId: string, options: \{ skipCurrentSnapshot: boolean \}\) \{[\s\S]*options\.skipCurrentSnapshot = true;/);
		assert.match(roomSource, /if \(options\?\.currentSnapshotConfirmed === true \|\| hasConfirmedLocalMessage\(clientId\)\) \{[\s\S]*return;/);
	});

	test('does not clear a newly selected reference when an earlier send succeeds', () => {
		const onSentSource = roomSource.slice(
			roomSource.indexOf('function onSentMessage'),
			roomSource.indexOf('function onSendMessageFailed'),
		);
		assert.notMatch(onSentSource, /replyTarget\.value = null;/);
		assert.notMatch(onSentSource, /quoteTarget\.value = null;/);
		assert.match(formSource, /function clear\(\) \{[\s\S]*emit\('clearReply'\);[\s\S]*emit\('clearQuote'\);/);
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
