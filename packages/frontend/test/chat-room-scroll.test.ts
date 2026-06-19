/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import { appendDetachedChatMessages, ChatAutoScrollState, ChatReadReceiptBatcher, findMissingChatMessageIdsInLatestWindow, getChatScrollMetrics, isChatMessageVisibleAtLatestEdge, isNearChatLatest, mergeChatMessagesForTimeline, prependChatMessageForTimeline, sortChatMessagesForTimeline } from '@/pages/chat/room-scroll.js';
import roomSource from '@/pages/chat/room.vue?raw';

describe('chat room scroll state', () => {
	test('keeps auto-follow while the user is still at latest', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		state.updateFromScroll(0);
		assert.strictEqual(state.canAutoFollowLatest(0), true);

		state.markUserInteraction();
		assert.strictEqual(state.canAutoFollowLatest(1), true);

		now = 1300;
		state.updateFromScroll(80);
		assert.strictEqual(state.canAutoFollowLatest(1), false);

		state.markLatest();
		assert.strictEqual(state.canAutoFollowLatest(0), true);
	});

	test('keeps mutation auto-stick limited to the real latest edge after detaching', () => {
		let now = 0;
		const state = new ChatAutoScrollState({
			latestThreshold: 24,
			interactionLockMs: 1200,
			now: () => now,
		});

		assert.strictEqual(state.shouldStickToLatest(3, 4), true);
		assert.strictEqual(state.shouldStickToLatest(20, 4), false);

		state.markUserInteraction();
		assert.strictEqual(state.shouldStickToLatest(0, 4), true);

		now = 1300;
		state.updateFromScroll(80);
		assert.strictEqual(state.shouldStickToLatest(0, 4), false);

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

	test('keeps local chat tabs visible beside the room title on wide screens', () => {
		assert.match(roomSource, /grid-template-columns:\s*minmax\(120px,\s*auto\)\s*minmax\(0,\s*1fr\)\s*auto;/);
		assert.match(roomSource, /grid-template-areas:\s*"title tabs menu";/);
		assert.match(roomSource, /@container \(max-width:\s*520px\)\s*\{[\s\S]*grid-template-areas:\s*"title menu"\s*"tabs tabs";/);
	});

	test('uses the shared layout width for the visible chat surface', () => {
		assert.match(roomSource, /\.chatPane\s*\{[\s\S]*width:\s*min\(100%,\s*var\(--layout-main-column-width,\s*100%\)\);/);
		assert.match(roomSource, /\.form\s*\{[\s\S]*max-width:\s*var\(--layout-main-column-width,\s*100%\);/);
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
			assert.match(roomSource, /const sinceId = findNewestPersistedMessageId\(\);[\s\S]*flushIncomingMessagesNow\(\{ stickToLatest: true \}\);[\s\S]*scrollToLatest\('instant', \{ flushReadReceipt: true \}\);[\s\S]*await fetchLatestGapWithRecoveryTimeout\(sinceId\);[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: true, fillHistory: true \}\);/);
	});

	test('keeps initial latest scrolling isolated from history observers', () => {
		assert.match(roomSource, /async function scrollToLatestAfterLayout\(options\?: \{ flushReadReceipt\?: boolean; fillHistory\?: boolean \}\) \{[\s\S]*beginScrollRestoration\(\);[\s\S]*try \{[\s\S]*scrollToLatest\('instant'\);[\s\S]*await fillInitialScrollableHistory\(\);[\s\S]*\} finally \{[\s\S]*endScrollRestoration\(\);[\s\S]*\}/);
		assert.match(roomSource, /if \(!isRestoringHistoryScroll\.value && canFetchMore\.value && !moreFetching\.value && messages\.value\.length > 0 && historyFetchArmed && historyDistance < SCROLL_HISTORY_THRESHOLD\) \{/);
		assert.match(roomSource, /if \(!isRestoringHistoryScroll\.value && canFetchNewer\.value && !newerFetching\.value && messages\.value\.length > 0 && newerFetchArmed && latestDistance < SCROLL_TAIL_THRESHOLD\) \{/);
	});

	test('does not treat hidden chat tabs as being at latest', () => {
		assert.match(roomSource, /const tab = ref\('chat'\);/);
			assert.match(roomSource, /function canUseChatScrollMetrics\(\) \{[\s\S]*tab\.value === 'chat'[\s\S]*chatPaneEl\.value != null[\s\S]*chatPaneEl\.value\.clientHeight > 0/);
			assert.match(roomSource, /function isAtLatest\(\) \{[\s\S]*if \(!canUseChatScrollMetrics\(\)\) return false;/);
			assert.match(roomSource, /function shouldAutoRevealLatestMessages\(\) \{[\s\S]*if \(!canUseChatScrollMetrics\(\)\) return false;/);
			assert.match(roomSource, /function scheduleStickToLatestAfterMutation\(\) \{[\s\S]*if \(!canUseChatScrollMetrics\(\) \|\| isRestoringHistoryScroll\.value \|\| isContextMode\.value\) return;/);
		});

	test('refreshes missing latest messages when opening the new message indicator', () => {
		assert.match(roomSource, /async function fetchLatestGap\(sinceId = findNewestPersistedMessageId\(\), options\?: \{ maxPages\?: number; bufferOnly\?: boolean; signal\?: AbortSignal \}\)/);
		assert.match(roomSource, /async function syncLatestMessages\(options\?: \{ stickToLatest\?: boolean; flushReadReceipt\?: boolean; sinceId\?: string; reconcileLatestWindow\?: boolean \}\)/);
		assert.match(roomSource, /const syncPromise = \(latestSyncPromise \?\? Promise\.resolve\(\)\)\.then\(run, run\);/);
		assert.match(roomSource, /async function showLatestMessages\(behavior: ScrollBehavior = 'smooth'\)/);
		assert.match(roomSource, /await reconcileLatestTimelineWindow\(\);[\s\S]*scrollToLatest\(behavior, \{ flushReadReceipt: true \}\);[\s\S]*await syncLatestMessages\(\{ stickToLatest: true, flushReadReceipt: true, reconcileLatestWindow: false \}\);/);
		assert.match(roomSource, /function onIndicatorClick\(\) \{[\s\S]*void showLatestMessages\('smooth'\);/);
	});

	test('recovers missed latest messages after stream reconnect and visibility restore', () => {
		assert.match(roomSource, /const STREAM_RECOVERY_DEBOUNCE_MS = 800;/);
		assert.match(roomSource, /const STREAM_RECOVERY_POLL_INTERVAL_MS = 1000 \* 60 \* 5;/);
		assert.match(roomSource, /const STREAM_RECOVERY_ERROR_RETRY_MS = 5000;/);
		assert.match(roomSource, /const STREAM_RECOVERY_STALE_MS = 60000;/);
		assert.match(roomSource, /const STREAM_LATEST_GAP_MAX_PAGES = 5;/);
		assert.match(roomSource, /let streamRecoveryTimer: number \| null = null;/);
		assert.match(roomSource, /let streamRecoveryPollingTimer: number \| null = null;/);
		assert.match(roomSource, /let streamRecoverySinceId: string \| undefined;/);
		assert.match(roomSource, /let isRoomViewDisposed = false;/);
			assert.match(roomSource, /function startStreamRecoveryPolling\(delay = STREAM_RECOVERY_POLL_INTERVAL_MS\)/);
			assert.match(roomSource, /if \(isRoomViewDisposed\) return;/);
			assert.match(roomSource, /let retryDelay = STREAM_RECOVERY_POLL_INTERVAL_MS;/);
			assert.match(roomSource, /Date\.now\(\) - latestStreamEventAt >= STREAM_RECOVERY_STALE_MS/);
			assert.match(roomSource, /retryDelay = STREAM_RECOVERY_ERROR_RETRY_MS;/);
			assert.match(roomSource, /startStreamRecoveryPolling\(retryDelay\);/);
			assert.match(roomSource, /function scheduleStreamRecovery\(reason: 'connected' \| 'visible' \| 'manual' = 'manual', options\?: \{ sinceId\?: string \}\)/);
			assert.match(roomSource, /const shouldStickToLatest = shouldAutoRevealLatestMessages\(\);/);
			assert.match(roomSource, /if \(reason === 'connected'\) \{[\s\S]*await waitChannelConnected\(\);[\s\S]*\}/);
			assert.match(roomSource, /await Promise\.race\(\[[\s\S]*channel\.waitConnected\(\),[\s\S]*STREAM_CONNECT_TIMEOUT/);
			assert.strictEqual(/const waitConnected = [\s\S]*\.waitConnected;/.test(roomSource), false);
			assert.match(roomSource, /await syncLatestMessages\(\{ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId \}\);/);
		assert.match(roomSource, /function onStreamConnected\(\) \{[\s\S]*scheduleStreamRecovery\('connected'\);[\s\S]*\}/);
		assert.match(roomSource, /function onStreamDisconnected\(\) \{[\s\S]*showScrollToLatestButton\.value = true;[\s\S]*startStreamRecoveryPolling\(STREAM_RECOVERY_ERROR_RETRY_MS\);[\s\S]*\}/);
		assert.match(roomSource, /function onVisibilitychange\(\) \{[\s\S]*readReceiptBatcher\.flush\(\);[\s\S]*startStreamRecoveryPolling\(STREAM_RECOVERY_ERROR_RETRY_MS\);[\s\S]*scheduleStreamRecovery\('visible'\);[\s\S]*\}/);
		assert.match(roomSource, /useStream\(\)\.on\('_connected_', onStreamConnected\);/);
		assert.match(roomSource, /useStream\(\)\.off\('_connected_', onStreamConnected\);/);
		assert.match(roomSource, /clearStreamRecoveryPollingTimer\(\);/);
	});

		test('fills realtime message gaps without blocking latest auto-scroll', () => {
			assert.match(roomSource, /function rememberStreamRecoverySinceId\(sinceId: string \| undefined\)/);
			assert.match(roomSource, /let pendingIncomingShouldStickToLatest = false;/);
			assert.match(roomSource, /function onMessage\(message: Misskey\.entities\.ChatMessageLite\) \{[\s\S]*pendingIncomingShouldStickToLatest = pendingIncomingShouldStickToLatest \|\| shouldAutoRevealLatestMessages\(\);[\s\S]*pendingIncomingMessages\.push\(message\);/);
			assert.match(roomSource, /function processIncomingMessageBatch\(batch: Misskey\.entities\.ChatMessageLite\[\], options\?: \{ stickToLatest\?: boolean \}\)/);
			assert.match(roomSource, /const batchNewestId = visibleBatch\.reduce<string \| null>/);
			assert.match(roomSource, /const shouldStickToLatest = options\?\.stickToLatest === true \|\| shouldAutoRevealLatestMessages\(\);/);
			assert.match(roomSource, /const wasAtLatest = shouldStickToLatest \|\| isAtLatest\(\);/);
			assert.match(roomSource, /const shouldRecoverGap = batchNewestId != null && findNewestPersistedMessageId\(\) != null && batchNewestId > findNewestPersistedMessageId\(\)!;/);
			assert.match(roomSource, /scheduleStreamRecovery\('manual'\);/);
			assert.match(roomSource, /newVisibleMessages = await fetchLatestGapWithRecoveryTimeout\(sinceId, \{ maxPages: STREAM_LATEST_GAP_MAX_PAGES, bufferOnly: !shouldStickToLatest \}\);/);
			assert.match(roomSource, /function bufferFetchedLatestMessages\(fetched: Misskey\.entities\.ChatMessageLite\[\]\): LatestGapMessage\[\]/);
			assert.match(roomSource, /if \(shouldStickToLatest\) \{[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: options\?\.flushReadReceipt \}\);[\s\S]*\} else \{[\s\S]*notifyNewMessages\(otherCount\);/);
			assert.match(roomSource, /void revealLatestMessagesAfterLayout\(\{ behavior: 'instant', flushReadReceipt: true \}\);/);
		});

	test('shows a direct latest button while detached from the chat bottom', () => {
			assert.match(roomSource, /showScrollToLatestButton = ref\(false\)/);
			assert.match(roomSource, /showScrollToLatestButton\.value = latestDistance > SCROLL_TAIL_THRESHOLD/);
			assert.match(roomSource, /v-show="tab === 'chat' && \(isContextMode \|\| showScrollToLatestButton\) && !showIndicator"/);
			assert.match(roomSource, /class="_buttonPrimary" :class="\$style\.toLatestButton"/);
		});

		test('removes the context search banner and exits context through the floating latest button', () => {
			assert.strictEqual(roomSource.includes('$style.contextModeBar'), false);
			assert.strictEqual(roomSource.includes('contextModeText'), false);
			assert.strictEqual(roomSource.includes('contextModeButton'), false);
			assert.strictEqual(roomSource.includes('i18n.ts.searchResult'), false);
			assert.match(roomSource, /function onIndicatorClick\(\) \{[\s\S]*if \(isContextMode\.value\) \{[\s\S]*void exitContextToLatest\(\);/);
		});

		test('exits context mode after newer pages reach the latest edge', () => {
			assert.match(roomSource, /const wasContextMode = isContextMode\.value;/);
			assert.match(roomSource, /reachedLatestInContext = wasContextMode && !canFetchNewer\.value;/);
			assert.match(roomSource, /if \(reachedLatestInContext\) \{[\s\S]*await finishContextAtLatest\(\);/);
			assert.match(roomSource, /async function finishContextAtLatest\(\) \{[\s\S]*clearMessageContextRoute\(\);[\s\S]*contextTargetMessageId\.value = null;[\s\S]*pendingContextScrollId\.value = null;[\s\S]*await syncLatestMessages\(\{ stickToLatest: true, flushReadReceipt: true \}\);/);
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
			assert.match(roomSource, /if \(!wasAtLatest\) \{[\s\S]*detachedIncomingMessages = appendDetachedChatMessages\(detachedIncomingMessages, visibleBatch, messages\.value\);[\s\S]*notifyNewMessages\(otherCount\);[\s\S]*return;/);
			assert.match(roomSource, /void revealLatestMessagesAfterLayout\(\{ behavior: 'instant', flushReadReceipt: true \}\);/);
			assert.match(roomSource, /function scrollToLatest\(behavior: ScrollBehavior = 'smooth'[\s\S]*flushDetachedIncomingMessages\(\{ queueReadReceipt: true \}\)/);
			assert.match(roomSource, /if \(!isContextMode\.value && detachedIncomingMessages\.length > 0\) \{[\s\S]*scrollToLatest\('instant', \{ flushReadReceipt: true \}\);[\s\S]*return;/);
			assert.strictEqual(/const anchor = wasAtLatest \? null : getVisibleMessageAnchor\(\);[\s\S]*restoreVisibleMessageAnchorAfterLayout\(anchor\)/.test(roomSource), false);
		});

	test('detects only local messages missing from the latest authoritative window', () => {
		const missing = findMissingChatMessageIdsInLatestWindow([
			{ id: '106' },
			{ id: '105' },
			{ id: '104' },
			{ id: '102' },
			{ id: '107', sendStatus: 'pending' },
		], [
			{ id: '105' },
			{ id: '104' },
			{ id: '103' },
		], {
			limit: 3,
			isPending: message => message.sendStatus === 'pending',
		});

		assert.deepStrictEqual([...missing], ['106']);

		const fullWindowMissing = findMissingChatMessageIdsInLatestWindow([
			{ id: '105' },
			{ id: '103' },
			{ id: '102', sendStatus: 'pending' },
		], [
			{ id: '105' },
		], {
			limit: 3,
			isPending: message => message.sendStatus === 'pending',
		});

		assert.deepStrictEqual([...fullWindowMissing], ['103']);
	});

	test('removes deleted unread buffered messages from every local queue', () => {
		assert.match(roomSource, /function removeLocalChatMessagesByIds\(ids: Iterable<string>\)/);
		assert.match(roomSource, /messages\.value = messages\.value\.filter\(message => !idSet\.has\(message\.id\)\);/);
		assert.match(roomSource, /pendingIncomingMessages = pendingIncomingMessages\.filter\(message => !idSet\.has\(message\.id\)\);/);
		assert.match(roomSource, /detachedIncomingMessages = detachedIncomingMessages\.filter\(message => \{[\s\S]*removedDetachedMessages\.push\(message\);[\s\S]*return false;[\s\S]*\}\);/);
		assert.match(roomSource, /decrementNewMessageIndicator\(removedDetachedMessages\.filter\(message => message\.fromUserId !== \$i\.id\)\.length\);/);
		assert.match(roomSource, /if \(replyTarget\.value != null && idSet\.has\(replyTarget\.value\.id\)\) \{[\s\S]*replyTarget\.value = null;/);
		assert.match(roomSource, /if \(quoteTarget\.value != null && idSet\.has\(quoteTarget\.value\.id\)\) \{[\s\S]*quoteTarget\.value = null;/);
		assert.match(roomSource, /function onDeleted\(id: string\) \{[\s\S]*markChatStreamEvent\(\);[\s\S]*removeLocalChatMessagesByIds\(\[id\]\);[\s\S]*\}/);
		assert.match(roomSource, /function onDeletedMany\(ids: string\[\]\) \{[\s\S]*markChatStreamEvent\(\);[\s\S]*removeLocalChatMessagesByIds\(ids\);[\s\S]*\}/);
	});

	test('reconciles deleted unread messages before revealing latest after background recovery', () => {
		assert.match(roomSource, /async function fetchLatestTimelineWindow\(signal\?: AbortSignal\): Promise<Misskey\.entities\.ChatMessageLite\[\]>/);
		assert.match(roomSource, /const TIMELINE_RECONCILE_LIMIT = 100;/);
		assert.match(roomSource, /const CHAT_RECONCILE_TIMEOUT_MS = 5000;/);
		assert.match(roomSource, /const CHAT_RECOVERY_FETCH_TIMEOUT_MS = 10000;/);
		assert.match(roomSource, /limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /function reconcileLocalMessagesWithLatestWindow\(latestWindow: Misskey\.entities\.ChatMessageLite\[\]\)/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(messages\.value, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT,[\s\S]*isPending: isPendingMessage/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(pendingIncomingMessages, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(detachedIncomingMessages, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /const initialSinceId = options\?\.sinceId \?\? findNewestPersistedMessageId\(\);/);
		assert.match(roomSource, /const sinceId = options\?\.sinceId \?\? findNewestPersistedMessageId\(\) \?\? initialSinceId;/);
		assert.match(roomSource, /if \(options\?\.reconcileLatestWindow !== false\) \{[\s\S]*await reconcileLatestTimelineWindow\(\);/);
		assert.match(roomSource, /await reconcileLatestTimelineWindow\(\);[\s\S]*scrollToLatest\(behavior, \{ flushReadReceipt: true \}\);/);
		assert.match(roomSource, /await syncLatestMessages\(\{ stickToLatest: true, flushReadReceipt: true, reconcileLatestWindow: false \}\);/);
		assert.match(roomSource, /async function ensureLatestOnChatTabReturn\(generation: number\) \{[\s\S]*await reconcileLatestTimelineWindow\(\);[\s\S]*flushIncomingMessagesNow\(\{ stickToLatest: true \}\);/);
		assert.match(roomSource, /const controller = new AbortController\(\);[\s\S]*const timeoutId = window\.setTimeout\(\(\) => controller\.abort\(\), CHAT_RECONCILE_TIMEOUT_MS\);[\s\S]*await fetchLatestTimelineWindow\(controller\.signal\);[\s\S]*window\.clearTimeout\(timeoutId\);/);
		assert.match(roomSource, /misskeyApi\('chat\/messages\/room-timeline'[\s\S]*undefined, signal\);/);
		assert.match(roomSource, /misskeyApi\('chat\/messages\/user-timeline'[\s\S]*undefined, signal\);/);
		assert.match(roomSource, /async function fetchLatestGapWithRecoveryTimeout\(sinceId: string \| undefined, options\?: \{ maxPages\?: number; bufferOnly\?: boolean \}\)/);
		assert.match(roomSource, /window\.setTimeout\(\(\) => controller\.abort\(\), CHAT_RECOVERY_FETCH_TIMEOUT_MS\)/);
		assert.match(roomSource, /return await fetchLatestGap\(sinceId, \{[\s\S]*signal: controller\.signal/);
		assert.match(roomSource, /newVisibleMessages = await fetchLatestGapWithRecoveryTimeout\(sinceId, \{ maxPages: STREAM_LATEST_GAP_MAX_PAGES, bufferOnly: !shouldStickToLatest \}\);/);
		assert.match(roomSource, /await fetchLatestGapWithRecoveryTimeout\(sinceId\);/);
		assert.match(roomSource, /scheduleStreamRecovery\('visible'\);/);
		assert.match(roomSource, /scheduleStreamRecovery\('connected'\);/);
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

	test('keeps the historical side of a bounded room timeline while paging upward', () => {
		const current = [
			{ id: '120', createdAt: '2026-06-01T00:03:00.000Z' },
			{ id: '110', createdAt: '2026-06-01T00:02:00.000Z' },
			{ id: '100', createdAt: '2026-06-01T00:01:00.000Z' },
		];
		const merged = mergeChatMessagesForTimeline(current, [
			{ id: '090', createdAt: '2026-06-01T00:00:00.000Z' },
			{ id: '080', createdAt: '2026-05-31T23:59:00.000Z' },
		], { limit: 3, keep: 'oldest', preserveExistingOrder: true });

		assert.deepStrictEqual(merged.map(item => item.id), ['100', '090', '080']);
		assert.match(roomSource, /const MAX_ROOM_MESSAGES = 240;/);
		assert.match(roomSource, /const MAX_CONTEXT_MESSAGES = 120;/);
		assert.match(roomSource, /const visibleTimeline = computed\(\(\) => timeline\.value\.toReversed\(\)\);/);
		assert.match(roomSource, /v-for="item in visibleTimeline"/);
		assert.strictEqual(roomSource.includes('v-for="item in timeline.toReversed()"'), false);
		assert.match(roomSource, /appendFetchedMessagesWithWindow\(newMessages, 'oldest'\);/);
		assert.match(roomSource, /mergeMessages\(\{ keep \}, current, normalized\);/);
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
