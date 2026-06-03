/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import type * as Misskey from 'misskey-js';
import { nextTick } from 'vue';
import XSearch from '@/pages/chat/room.search.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import type { MenuItem, MenuUser } from '@/types/menu.js';

const { me, alice, bob } = vi.hoisted(() => {
	const me = {
		id: 'me',
		username: 'me',
		name: 'Me',
		host: null,
		avatarDecorations: [],
	} as unknown as Misskey.entities.UserDetailed;
	const alice = {
		id: 'alice',
		username: 'alice',
		name: 'Alice',
		host: null,
		avatarDecorations: [],
	} as unknown as Misskey.entities.UserDetailed;
	const bob = {
		id: 'bob',
		username: 'bob',
		name: 'Bob',
		host: null,
		avatarDecorations: [],
	} as unknown as Misskey.entities.UserDetailed;

	return { me, alice, bob };
});

vi.mock('@/i.js', () => ({
	$i: me,
	ensureSignin: () => me,
}));

vi.mock('@/i18n.js', () => ({
	i18n: {
		ts: {
			clear: 'Clear',
			loadMore: 'Load more',
			search: 'Search',
			searchResult: 'Search result',
			selectUser: 'Select user',
			show: 'Show',
			_chat: {
				allSenders: 'All senders',
				searchMessages: 'Search messages',
				sender: 'Sender',
			},
		},
	},
}));

vi.mock('@/router.js', () => ({
	useRouter: () => ({
		push: vi.fn(),
	}),
}));

vi.mock('@/utility/misskey-api.js', () => ({
	misskeyApi: vi.fn(),
}));

vi.mock('@/components/MkButton.vue', () => ({
	default: {
		props: ['disabled'],
		emits: ['click'],
		template: '<button :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
	},
}));

vi.mock('@/components/MkInput.vue', () => ({
	default: {
		props: ['modelValue', 'placeholder', 'disabled'],
		emits: ['update:modelValue', 'enter'],
		template: '<input :placeholder="placeholder" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keydown.enter="$emit(\'enter\')">',
	},
}));

vi.mock('@/pages/chat/XMessage.vue', () => ({
	default: {
		props: ['message'],
		template: '<div>{{ message.text }}</div>',
	},
}));

vi.mock('@/os.js', () => ({
	popupMenu: vi.fn(async () => {}),
	selectUser: vi.fn(),
}));

async function flushPromises() {
	await Promise.resolve();
	await nextTick();
	await Promise.resolve();
}

async function flushAnimationFrame() {
	await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
	await flushPromises();
}

function createMessage(id: string): Misskey.entities.ChatMessage {
	return {
		id,
		createdAt: '2026-06-03T00:00:00.000Z',
		fromUserId: alice.id,
		fromUser: alice,
		toUserId: null,
		toRoomId: 'room',
		toRoom: null,
		text: 'hello',
		fileId: null,
		file: null,
		replyId: null,
		reply: null,
		quoteId: null,
		quote: null,
		reactions: [],
	} as unknown as Misskey.entities.ChatMessage;
}

function renderSearch() {
	return render(XSearch, {
		props: {
			roomId: 'room',
			room: {
				id: 'room',
				ownerId: me.id,
				owner: me,
				name: 'Room',
				memberCount: 3,
				memberLimit: 100,
			} as unknown as Misskey.entities.ChatRoom,
		},
		global: {
			stubs: {
				MkAvatar: {
					props: ['user'],
					template: '<span>{{ user.username }}</span>',
				},
				MkError: true,
				MkLoading: true,
				MkResult: true,
				MkUserName: {
					props: ['user'],
					template: '<span>{{ user.name ?? user.username }}</span>',
				},
			},
		},
	});
}

function setScrollerMetrics(scroller: HTMLElement, metrics: {
	clientHeight: number;
	scrollHeight: number;
	scrollTop?: number;
}) {
	let scrollTop = metrics.scrollTop ?? 0;
	Object.defineProperty(scroller, 'clientHeight', {
		configurable: true,
		value: metrics.clientHeight,
	});
	Object.defineProperty(scroller, 'scrollHeight', {
		configurable: true,
		value: metrics.scrollHeight,
	});
	Object.defineProperty(scroller, 'scrollTop', {
		configurable: true,
		get: () => scrollTop,
		set: value => {
			scrollTop = Number(value);
		},
	});

	return {
		setScrollTop(value: number) {
			scrollTop = value;
		},
	};
}

function findUserMenuItem(items: MenuItem[], userId: string): MenuUser {
	const item = items.find(item => item != null && 'type' in item && item.type === 'user' && item.user.id === userId);
	assert.ok(item != null);
	return item as MenuUser;
}

describe('chat room search', () => {
	afterEach(() => {
		cleanup();
		vi.clearAllMocks();
	});

	test('keeps the selected sender filter for search and pagination', async () => {
		const firstPage = Array.from({ length: 30 }, (_, i) => createMessage(`m${String(i).padStart(2, '0')}`));
		vi.mocked(misskeyApi).mockImplementation(async (endpoint) => {
			if (endpoint === 'chat/rooms/members') {
				return [{
					id: 'membership-alice',
					userId: alice.id,
					user: alice,
				}, {
					id: 'membership-bob',
					userId: bob.id,
					user: bob,
				}] as never;
			}

			if (endpoint === 'chat/messages/search') {
				return firstPage as never;
			}

			return [] as never;
		});

		const view = renderSearch();
		await flushPromises();

		await fireEvent.click(view.getByText('All senders'));
		await flushPromises();
		const menuItems = vi.mocked(os.popupMenu).mock.calls[0][0];
		findUserMenuItem(menuItems, alice.id).action(new MouseEvent('click'));
		await flushPromises();

		await fireEvent.update(view.getByPlaceholderText('Search messages'), 'hello');
		await fireEvent.click(view.getByText('Search'));
		await flushPromises();

		const searchCalls = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'chat/messages/search');
		assert.deepStrictEqual(searchCalls[0][1] as unknown, {
			query: 'hello',
			limit: 30,
			roomId: 'room',
			userId: undefined,
			fromUserId: alice.id,
		});

		await fireEvent.click(view.getByText('Load more'));
		await flushPromises();

		const nextSearchCalls = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'chat/messages/search');
		assert.deepStrictEqual(nextSearchCalls[1][1] as unknown, {
			query: 'hello',
			limit: 30,
			roomId: 'room',
			userId: undefined,
			fromUserId: alice.id,
			untilId: 'm29',
		});
	});

	test('fetches the next search page when the mobile results scroller reaches the bottom', async () => {
		const firstPage = Array.from({ length: 30 }, (_, i) => createMessage(`m${String(i).padStart(2, '0')}`));
		const secondPage = Array.from({ length: 3 }, (_, i) => createMessage(`m${String(i + 30).padStart(2, '0')}`));
		let searchCount = 0;
		vi.mocked(misskeyApi).mockImplementation(async (endpoint) => {
			if (endpoint === 'chat/rooms/members') return [] as never;
			if (endpoint === 'chat/messages/search') {
				searchCount++;
				return (searchCount === 1 ? firstPage : secondPage) as never;
			}
			return [] as never;
		});

		const view = renderSearch();
		const scroller = view.container.querySelector<HTMLElement>('[data-chat-search-scroller]');
		assert.ok(scroller != null);
		const metrics = setScrollerMetrics(scroller, {
			clientHeight: 400,
			scrollHeight: 1200,
			scrollTop: 0,
		});
		await flushPromises();

		await fireEvent.update(view.getByPlaceholderText('Search messages'), 'hello');
		await fireEvent.click(view.getByText('Search'));
		await flushPromises();

		assert.strictEqual(vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'chat/messages/search').length, 1);

		metrics.setScrollTop(900);
		await fireEvent.scroll(scroller);
		await flushAnimationFrame();

		const searchCalls = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'chat/messages/search');
		assert.strictEqual(searchCalls.length, 2);
		assert.deepStrictEqual(searchCalls[1][1] as unknown, {
			query: 'hello',
			limit: 30,
			roomId: 'room',
			userId: undefined,
			fromUserId: undefined,
			untilId: 'm29',
		});
	});

	test('auto-loads more search results when the first page does not fill the mobile pane', async () => {
		const firstPage = Array.from({ length: 30 }, (_, i) => createMessage(`m${String(i).padStart(2, '0')}`));
		const secondPage = Array.from({ length: 2 }, (_, i) => createMessage(`m${String(i + 30).padStart(2, '0')}`));
		let searchCount = 0;
		vi.mocked(misskeyApi).mockImplementation(async (endpoint) => {
			if (endpoint === 'chat/rooms/members') return [] as never;
			if (endpoint === 'chat/messages/search') {
				searchCount++;
				return (searchCount === 1 ? firstPage : secondPage) as never;
			}
			return [] as never;
		});

		const view = renderSearch();
		const scroller = view.container.querySelector<HTMLElement>('[data-chat-search-scroller]');
		assert.ok(scroller != null);
		setScrollerMetrics(scroller, {
			clientHeight: 900,
			scrollHeight: 1000,
			scrollTop: 0,
		});
		await flushPromises();

		await fireEvent.update(view.getByPlaceholderText('Search messages'), 'hello');
		await fireEvent.click(view.getByText('Search'));
		await flushPromises();
		await flushAnimationFrame();

		const searchCalls = vi.mocked(misskeyApi).mock.calls.filter(([endpoint]) => endpoint === 'chat/messages/search');
		assert.strictEqual(searchCalls.length, 2);
		assert.deepStrictEqual(searchCalls[1][1] as unknown, {
			query: 'hello',
			limit: 30,
			roomId: 'room',
			userId: undefined,
			fromUserId: undefined,
			untilId: 'm29',
		});
	});
});
