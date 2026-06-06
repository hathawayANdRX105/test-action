/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import { appendDetachedChatMessages, ChatAutoScrollState, ChatReadReceiptBatcher, getChatScrollMetrics, isChatMessageVisibleAtLatestEdge, isNearChatLatest, mergeChatMessagesForTimeline, prependChatMessageForTimeline, sortChatMessagesForTimeline } from '@/pages/chat/room-scroll.js';
import roomSource from '@/pages/chat/room.vue?raw';

describe('chat room scroll state', () => {
	test('does not auto-follow after the user starts scrolling away from latest', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		state.updateFromScroll(0);
		assert.strictEqual(state.canAutoFollowLatest(0), true);

		state.markUserInteraction();
		assert.strictEqual(state.canAutoFollowLatest(1), false);

		now = 1300;
		state.updateFromScroll(80);
		assert.strictEqual(state.canAutoFollowLatest(1), false);

		state.markLatest();
		assert.strictEqual(state.canAutoFollowLatest(0), true);
	});

	test('keeps mutation auto-stick limited to the real latest edge', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		assert.strictEqual(state.shouldStickToLatest(3, 4), true);
		assert.strictEqual(state.shouldStickToLatest(20, 4), false);

		state.markUserInteraction();
		assert.strictEqual(state.shouldStickToLatest(0, 4), false);

		now = 1300;
		state.markLatest();
		assert.strictEqual(state.shouldStickToLatest(0, 4), true);
	});

	test('keeps latest stickiness when media changes rendered height', () => {
		assert.match(roomSource, /let timelineResizeObserver: ResizeObserver \| null = null;/);
		assert.match(roomSource, /new ResizeObserver\(\(\) => \{[\s\S]*scheduleStickToLatestAfterMutation\(\);[\s\S]*\}\)/);
		assert.match(roomSource, /timelineResizeObserver\.observe\(to\);/);
		assert.match(roomSource, /timelineResizeObserver\?\.disconnect\(\);/);
		assert.match(roomSource, /let latestScrollMetricsSnapshot: ScrollMetricsSnapshot \| null = null;/);
		assert.match(roomSource, /function shouldStickToLatestAfterLayoutShift\(metrics: ScrollMetricsSnapshot\)/);
		assert.match(roomSource, /latestScrollMetricsSnapshot\.latestDistance > SCROLL_AUTO_STICK_THRESHOLD/);
		assert.match(roomSource, /Math\.abs\(metrics\.scrollTop - latestScrollMetricsSnapshot\.maxScrollTop\) <= SCROLL_AUTO_STICK_THRESHOLD/);
		assert.match(roomSource, /if \(shouldStickToLatestAfterLayoutShift\(metrics\)\) \{[\s\S]*scrollContainer\.scrollTo\(\{[\s\S]*top: metrics\.maxScrollTop/);
	});

	test('normalizes normal column scroll metrics for latest-at-bottom chat', () => {
		assert.deepStrictEqual(getChatScrollMetrics({
			scrollTop: 480,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement), {
			maxScrollTop: 600,
			scrollTop: 480,
			latestDistance: 120,
			historyDistance: 480,
		});

		assert.deepStrictEqual(getChatScrollMetrics({
			scrollTop: 900,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement), {
			maxScrollTop: 600,
			scrollTop: 600,
			latestDistance: 0,
			historyDistance: 600,
		});
	});

	test('treats the exact latest edge as the only indicator-clear zone', () => {
		assert.strictEqual(isNearChatLatest({
			scrollTop: 576,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement, 24), true);

		assert.strictEqual(isNearChatLatest({
			scrollTop: 575,
			scrollHeight: 1000,
			clientHeight: 400,
		} as HTMLElement, 24), false);
	});

	test('treats a newly rendered visible latest message as already seen', () => {
		const container = {
			top: 100,
			bottom: 500,
		};

		assert.strictEqual(isChatMessageVisibleAtLatestEdge(container, {
			top: 420,
			bottom: 500,
		}, 24), true);

		assert.strictEqual(isChatMessageVisibleAtLatestEdge(container, {
			top: 501,
			bottom: 560,
		}, 24), false);

		assert.strictEqual(isChatMessageVisibleAtLatestEdge(container, {
			top: 450,
			bottom: 540,
		}, 24), false);
	});

	test('keeps bottom alignment from hiding scrollable overflow', () => {
		const chatContentRule = roomSource.match(/\.chatPane > :global\(\._gaps\) \{(?<body>[\s\S]*?)\n\}/);

		assert.ok(chatContentRule?.groups?.body != null);
		assert.ok(!chatContentRule.groups.body.includes('justify-content: flex-end'));
		assert.match(roomSource, /\.chatPane > :global\(\._gaps\) > :first-child \{[\s\S]*?margin-top: auto;/);
	});

	test('refreshes and scrolls to latest when returning from another chat tab', () => {
		assert.match(roomSource, /async function ensureLatestOnChatTabReturn/);
		assert.match(roomSource, /const previousTab = tab\.value;[\s\S]*if \(previousTab !== 'chat'\) \{[\s\S]*scheduleLatestOnChatTabReturn/);
		assert.match(roomSource, /function scheduleLatestOnChatTabReturn\(\) \{[\s\S]*ensureLatestOnChatTabReturn/);
		assert.match(roomSource, /v-show=\"tab === 'chat'\" ref=\"chatPaneEl\"/);
		assert.match(roomSource, /async function scrollToLatestAfterLayout/);
		assert.match(roomSource, /const sinceId = findNewestPersistedMessageId\(\);[\s\S]*flushIncomingMessagesNow\(\);[\s\S]*scrollToLatest\('instant', \{ flushReadReceipt: true \}\);[\s\S]*await fetchLatestGap\(sinceId\);[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: true, fillHistory: true \}\);/);
	});

	test('does not treat hidden chat tabs as being at latest', () => {
		assert.match(roomSource, /const tab = ref\('chat'\);/);
		assert.match(roomSource, /function canUseChatScrollMetrics\(\) \{[\s\S]*tab\.value === 'chat'[\s\S]*chatPaneEl\.value != null[\s\S]*chatPaneEl\.value\.clientHeight > 0/);
		assert.match(roomSource, /function isAtLatest\(\) \{[\s\S]*if \(!canUseChatScrollMetrics\(\)\) return false;/);
		assert.match(roomSource, /function scheduleStickToLatestAfterMutation\(\) \{[\s\S]*if \(!canUseChatScrollMetrics\(\) \|\| isRestoringHistoryScroll\.value \|\| isContextMode\.value\) return;/);
	});

	test('refreshes missing latest messages when opening the new message indicator', () => {
		assert.match(roomSource, /async function fetchLatestGap\(sinceId = findNewestPersistedMessageId\(\)\)/);
		assert.match(roomSource, /async function showLatestMessages\(behavior: ScrollBehavior = 'smooth'\)/);
		assert.match(roomSource, /const sinceId = findNewestPersistedMessageId\(\);[\s\S]*flushIncomingMessagesNow\(\);[\s\S]*scrollToLatest\(behavior, \{ flushReadReceipt: true \}\);[\s\S]*await fetchLatestGap\(sinceId\);[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: true \}\);/);
		assert.match(roomSource, /function onIndicatorClick\(\) \{[\s\S]*void showLatestMessages\('smooth'\);/);
	});

	test('shows a direct latest button while detached from the chat bottom', () => {
		assert.match(roomSource, /showScrollToLatestButton = ref\(false\)/);
		assert.match(roomSource, /showScrollToLatestButton\.value = latestDistance > SCROLL_TAIL_THRESHOLD/);
		assert.match(roomSource, /class="_buttonPrimary" :class="\$style\.toLatestButton"/);
	});

	test('labels the context search exit as newest message instead of unread message', () => {
		const contextButton = roomSource.match(/<button class="_buttonPrimary" :class="\$style\.contextModeButton" @click="exitContextToLatest">(?<body>[\s\S]*?)<\/button>/);

		assert.ok(contextButton?.groups?.body != null);
		assert.match(roomSource, /<div v-if="isContextMode" :class="\$style\.contextModeBar">[\s\S]*i18n\.ts\.searchResult/);
		assert.ok(contextButton.groups.body.includes('i18n.ts._chat.newestMessage'));
		assert.ok(!contextButton.groups.body.includes('i18n.ts._chat.newMessage'));
	});

	test('keeps message bubble arrows pointed at the avatar side', async () => {
		const source = await import('@/pages/chat/XMessage.vue?raw').then(module => module.default);

		assert.match(source, /\.bubble \{[\s\S]*?&::before \{[\s\S]*?top: 10px;/);
		assert.match(source, /\.bubble \{[\s\S]*?&::before \{[\s\S]*?clip-path: polygon\(100% 0, 100% 100%, 0 50%\);/);
		assert.match(source, /\.isMe \.bubble \{[\s\S]*?&::before \{[\s\S]*?clip-path: polygon\(0 0, 100% 50%, 0 100%\);/);
		assert.strictEqual(/\.bubble \{[\s\S]*?&::before \{[\s\S]*?bottom: 0;/.test(source), false);
	});

	test('keeps mention highlight aligned with the bubble and arrow', async () => {
		const source = await import('@/pages/chat/XMessage.vue?raw').then(module => module.default);
		const mentionedBubbleRule = source.match(/\.mentionedBubble \{(?<body>[\s\S]*?)\n\}/);

		assert.ok(mentionedBubbleRule?.groups?.body != null);
		assert.ok(!mentionedBubbleRule.groups.body.includes('border:'));
		assert.ok(!mentionedBubbleRule.groups.body.includes('0 0 0 3px'));
		assert.ok(mentionedBubbleRule.groups.body.includes('filter: drop-shadow('));
	});

	test('keeps overflowing room tabs reachable with scroll buttons', () => {
		assert.match(roomSource, /ref="localTabsEl"[\s\S]*@scroll="updateChatTabsScrollState"/);
		assert.match(roomSource, /@click="scrollChatTabs\('left'\)"/);
		assert.match(roomSource, /@click="scrollChatTabs\('right'\)"/);
		assert.match(roomSource, /const showChatTabsScrollControls = ref\(false\)/);
		assert.match(roomSource, /const canScrollChatTabsLeft = ref\(false\)/);
		assert.match(roomSource, /const canScrollChatTabsRight = ref\(false\)/);
		assert.match(roomSource, /function updateChatTabsScrollState\(\)/);
		assert.match(roomSource, /function scrollChatTabs\(direction: 'left' \| 'right'\)/);
		assert.match(roomSource, /scrollBy\(\{[\s\S]*left: direction === 'left' \? -distance : distance/);
		assert.match(roomSource, /function ensureSelectedChatTabVisible\(behavior: ScrollBehavior = 'smooth'\)/);
		assert.match(roomSource, /scrollIntoView\(\{[\s\S]*inline: 'nearest'/);
		assert.match(roomSource, /watch\(tab, \(\) => ensureSelectedChatTabVisible\(\)\);/);
	});

	test('sorts context/search messages by creation time before id', () => {
		const sorted = sortChatMessagesForTimeline([
			{ id: 'z', createdAt: '2026-06-01T00:00:00.000Z' },
			{ id: 'a', createdAt: '2026-06-03T00:00:00.000Z' },
			{ id: 'm', createdAt: '2026-06-02T00:00:00.000Z' },
			{ id: 'y', createdAt: '2026-06-03T00:00:00.000Z' },
		]);

		assert.deepStrictEqual(sorted.map(item => item.id), ['y', 'a', 'm', 'z']);
	});

	test('prepends realtime messages without sorting the whole room window', () => {
		const current = Array.from({ length: 500 }, (_, i) => ({
			id: `${(500 - i).toString().padStart(4, '0')}`,
			createdAt: '2026-06-01T00:00:00.000Z',
		}));

		const prepended = prependChatMessageForTimeline(current, {
			id: '0501',
			createdAt: '2026-06-01T00:00:01.000Z',
		}, { limit: 500 });

		assert.strictEqual(prepended.length, 500);
		assert.strictEqual(prepended[0].id, '0501');
		assert.strictEqual(prepended[1], current[0]);
		assert.strictEqual(prepended[499], current[498]);
	});

	test('buffers incoming room messages while browsing detached history', () => {
		const buffered = appendDetachedChatMessages([
			{ id: '103' },
			{ id: '102' },
		], [
			{ id: '104' },
			{ id: '103' },
			{ id: '100' },
		], [
			{ id: '101' },
			{ id: '100' },
		]);

		assert.deepStrictEqual(buffered.map(item => item.id), ['103', '102', '104']);
		assert.match(roomSource, /let detachedIncomingMessages: Misskey\.entities\.ChatMessageLite\[\] = \[\];/);
		assert.match(roomSource, /if \(!wasAtLatest\) \{[\s\S]*detachedIncomingMessages = appendDetachedChatMessages\(detachedIncomingMessages, batch, messages\.value\);[\s\S]*notifyNewMessages\(otherCount\);[\s\S]*return;/);
		assert.match(roomSource, /function scrollToLatest\(behavior: ScrollBehavior = 'smooth'[\s\S]*flushDetachedIncomingMessages\(\{ queueReadReceipt: true \}\)/);
		assert.match(roomSource, /if \(detachedIncomingMessages\.length > 0\) \{[\s\S]*scrollToLatest\('instant', \{ flushReadReceipt: true \}\);[\s\S]*return;/);
		assert.strictEqual(/const anchor = wasAtLatest \? null : getVisibleMessageAnchor\(\);[\s\S]*restoreVisibleMessageAnchorAfterLayout\(anchor\)/.test(roomSource), false);
	});

	test('keeps merge bounded for room timeline batches', () => {
		const current = [
			{ id: '100', createdAt: '2026-06-01T00:01:00.000Z' },
			{ id: '090', createdAt: '2026-06-01T00:00:00.000Z' },
		];
		const merged = mergeChatMessagesForTimeline(current, [
			{ id: '110', createdAt: '2026-06-01T00:02:00.000Z' },
			{ id: '080', createdAt: '2026-05-31T23:59:00.000Z' },
		], { limit: 3 });

		assert.deepStrictEqual(merged.map(item => item.id), ['110', '100', '090']);
	});

	test('coalesces read receipts to the newest queued message', () => {
		let now = 0;
		const scheduledTimers: (() => void)[] = [];
		const sent: string[] = [];
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			canSend: () => true,
			send: id => sent.push(id),
			now: () => now,
			setTimer: callback => {
				scheduledTimers.push(callback);
				return 1 as unknown as ReturnType<typeof setTimeout>;
			},
			clearTimer: () => {
				scheduledTimers.length = 0;
			},
		});

		batcher.queue('100');
		assert.deepStrictEqual(sent, ['100']);

		batcher.queue('101');
		batcher.queue('102');
		batcher.queue('099');
		assert.deepStrictEqual(sent, ['100']);
		assert.strictEqual(scheduledTimers.length, 1);

		now = 2000;
		scheduledTimers[0]();
		assert.deepStrictEqual(sent, ['100', '102']);
	});

	test('keeps read receipts pending while the room cannot send', () => {
		let active = false;
		const sent: string[] = [];
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			canSend: () => active,
			send: id => sent.push(id),
			now: () => 2000,
		});

		batcher.queue('200');
		assert.deepStrictEqual(sent, []);

		active = true;
		assert.strictEqual(batcher.flush(), true);
		assert.deepStrictEqual(sent, ['200']);
	});

	test('can force-flush a read receipt during teardown', () => {
		const sent: string[] = [];
		const batcher = new ChatReadReceiptBatcher({
			minIntervalMs: 2000,
			canSend: () => false,
			send: id => sent.push(id),
			now: () => 2000,
		});

		batcher.queue('300');
		assert.deepStrictEqual(sent, []);

		assert.strictEqual(batcher.flush({ force: true }), true);
		assert.deepStrictEqual(sent, ['300']);
	});
});
