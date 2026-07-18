/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import { appendDetachedChatMessages, ChatAutoScrollState, ChatReadReceiptBatcher, findMissingChatMessageIdsInLatestWindow, getChatScrollMetrics, isChatMessageVisibleAtLatestEdge, isNearChatLatest, mergeChatMessagesForTimeline, mergeChatMessagesWithWindowResult, prependChatMessageForTimeline, sortChatMessagesForTimeline } from '@/pages/chat/room-scroll.js';
import mediaListSource from '@/components/MkMediaList.vue?raw';
import roomSource from '@/pages/chat/room.vue?raw';
import roomInfoSource from '@/pages/chat/room.info.vue?raw';
import commonBootSource from '@/boot/common.ts?raw';
import frontendConsistencySource from '@/utility/frontend-consistency.ts?raw';

describe('chat room scroll state', () => {
	test('blocks auto-follow while the user is manually pulling away from latest', () => {
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
		assert.strictEqual(state.shouldStickToLatest(0, 4), false);

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

	test('uses the header action slot for a direct full chat-room reload', () => {
		assert.match(roomSource, /<button v-if="headerActions\.length > 0" class="_button" :class="\$style\.localMenu" :disabled="initializing" :title="headerActions\[0\]\.text" :aria-label="headerActions\[0\]\.text" @click="headerActions\[0\]\.handler">/);
		assert.match(roomSource, /const headerActions = computed<PageHeaderItem\[\]>\(\(\) => \{[\s\S]*if \(room\.value == null\) return \[\];[\s\S]*icon: 'ti ti-refresh',[\s\S]*text: i18n\.ts\.reload,[\s\S]*handler: \(\) => \{\s*void initialize\(\);\s*\},/);
		assert.notMatch(roomSource, /function showMenu\(/);
		assert.notMatch(roomSource, /icon: 'ti ti-dots'/);
	});

	test('puts the guarded leave action in the room about tab', () => {
		assert.match(roomSource, /<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated" @leave="leaveRoom"\/>/);
		assert.match(roomInfoSource, /const canLeaveRoom = computed\(\(\) => props\.room\.isJoined === true && !isOwner\.value\);/);
		assert.match(roomInfoSource, /\(ev: 'leave'\): void;/);
		assert.match(roomInfoSource, /<MkButton v-if="canLeaveRoom" danger @click="emit\('leave'\)">\{\{ i18n\.ts\._chat\.leave \}\}<\/MkButton>/);
	});

	test('uses the full available width for the visible chat surface', () => {
		assert.match(roomSource, /\.chatPane\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
		assert.match(roomSource, /\.form\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
		assert.notMatch(roomSource, /\.chatPane\s*\{[\s\S]*var\(--layout-main-column-width/);
		assert.notMatch(roomSource, /\.form\s*\{[\s\S]*var\(--layout-main-column-width/);
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

	test('refreshes latest without stealing scroll on page activation', () => {
		assert.match(roomSource, /async function ensureLatestOnChatTabReturn/);
		assert.match(roomSource, /onActivated\(\(\) => \{[\s\S]*scheduleLatestOnChatTabReturn\(\{ forceLatest: false \}\);/);
		assert.match(roomSource, /const previousTab = tab\.value;[\s\S]*if \(previousTab !== 'chat'\) \{[\s\S]*scheduleLatestOnChatTabReturn\(\{ forceLatest: true \}\);/);
		assert.match(roomSource, /function scheduleLatestOnChatTabReturn\(options: \{ forceLatest\?: boolean \} = \{\}\) \{[\s\S]*ensureLatestOnChatTabReturn\(chatTabLatestReturnGeneration, options\);/);
		assert.match(roomSource, /<div v-show=\"tab === 'chat'\" :class=\"\$style\.chatColumn\">[\s\S]*<div ref=\"chatPaneEl\" :class=\"\$style\.chatPane\">/);
		assert.match(roomSource, /async function scrollToLatestAfterLayout/);
		assert.match(roomSource, /const shouldStickToLatest = options\.forceLatest === true \|\| shouldAutoRevealLatestMessages\(\);/);
		assert.match(roomSource, /await syncLatestMessages\(\{ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId, reconcileLatestWindow: shouldStickToLatest \}\);/);
		assert.match(roomSource, /if \(shouldStickToLatest\) \{[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: true, fillHistory: true \}\);/);
	});

	test('keeps initial latest scrolling isolated from history observers', () => {
		assert.match(roomSource, /const INITIAL_LATEST_EDGE_LOCK_MS = 8000;/);
		assert.match(roomSource, /const INITIAL_LATEST_EDGE_RESCROLL_DELAYS = \[400, 1200, 2800, 5000, 7500\] as const;/);
		assert.match(roomSource, /let latestEdgeLockUntil = 0;/);
		assert.match(roomSource, /let latestEdgeLockGeneration = 0;/);
		assert.match(roomSource, /function lockLatestEdgeDuringInitialRender\(\): number/);
		assert.match(roomSource, /function clearLatestEdgeInitialLock\(\)/);
		assert.match(roomSource, /function isLatestEdgeInitialLockActive\(generation = latestEdgeLockGeneration\)/);
		assert.match(roomSource, /return generation === latestEdgeLockGeneration && Date\.now\(\) <= latestEdgeLockUntil && !autoScrollState\.isUserInteracting\(\);/);
		assert.match(roomSource, /function shouldInitialLatestEdgeLockStick\(metrics: ScrollMetricsSnapshot\)/);
		assert.match(roomSource, /if \(isLatestEdgeInitialLockActive\(\)\) return shouldInitialLatestEdgeLockStick\(metrics\);/);
		assert.match(roomSource, /const markUserScrollInteraction = \(\) => \{[\s\S]*clearLatestEdgeInitialLock\(\);[\s\S]*autoScrollState\.markUserInteraction\(\);[\s\S]*\};/);
		assert.match(roomSource, /async function scrollToLatestAfterLayout\(options\?: \{ flushReadReceipt\?: boolean; fillHistory\?: boolean; behavior\?: ScrollBehavior \}\) \{[\s\S]*let initialLatestEdgeLockGeneration: number \| null = null;[\s\S]*if \(!isContextMode\.value\) \{[\s\S]*initialLatestEdgeLockGeneration = lockLatestEdgeDuringInitialRender\(\);/);
		assert.match(roomSource, /async function scrollToLatestAfterLayout\(options\?: \{ flushReadReceipt\?: boolean; fillHistory\?: boolean; behavior\?: ScrollBehavior \}\) \{[\s\S]*beginScrollRestoration\(\);[\s\S]*try \{[\s\S]*scrollToLatest\('instant'\);[\s\S]*scrollToLatest\(options\?\.behavior \?\? 'instant', \{ flushReadReceipt: options\?\.flushReadReceipt \}\);[\s\S]*await fillInitialScrollableHistory\(\);[\s\S]*\} finally \{[\s\S]*endScrollRestoration\(\);[\s\S]*\}/);
		assert.match(roomSource, /scheduleLateInitialRescrolls\(initialLatestEdgeLockGeneration\);/);
		assert.match(roomSource, /if \(!isRestoringHistoryScroll\.value && canFetchMore\.value && !moreFetching\.value && !newerFetching\.value && messages\.value\.length > 0 && historyFetchArmed && historyDistance < SCROLL_HISTORY_THRESHOLD\) \{/);
		assert.match(roomSource, /if \(!isRestoringHistoryScroll\.value && canFetchNewer\.value && !newerFetching\.value && !moreFetching\.value && messages\.value\.length > 0 && newerFetchArmed && latestDistance < SCROLL_TAIL_THRESHOLD\) \{/);
	});

	test('cancels initial latest rescrolls before opening message context', () => {
		assert.match(roomSource, /function scheduleLateInitialRescrolls\(generation: number\) \{[\s\S]*if \(isContextMode\.value\) return;[\s\S]*if \(!isLatestEdgeInitialLockActive\(generation\)\) return;/);
		assert.match(roomSource, /async function openMessageContext\(messageId: string\) \{[\s\S]*clearLatestEdgeInitialLock\(\);[\s\S]*clearLateInitialRescrollTimers\(\);[\s\S]*clearIncomingMessageQueue/);
		assert.match(roomSource, /async function openReferenceMessage\(messageId: string\) \{[\s\S]*clearLatestEdgeInitialLock\(\);[\s\S]*clearLateInitialRescrollTimers\(\);[\s\S]*clearIncomingMessageQueue/);
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
		assert.match(roomSource, /await revealAuthoritativeLatestWindow\(\);[\s\S]*await scrollToLatestAfterLayout\(\{ behavior, flushReadReceipt: true \}\);/);
		assert.match(roomSource, /function onIndicatorClick\(\) \{[\s\S]*void showLatestMessages\('instant'\);/);
	});

	test('recovers missed latest messages after stream reconnect and visibility restore', () => {
		assert.match(roomSource, /const STREAM_RECOVERY_DEBOUNCE_MS = 800;/);
		assert.match(roomSource, /const STREAM_RECOVERY_POLL_INTERVAL_MS = 1000 \* 30;/);
		assert.match(roomSource, /const STREAM_RECOVERY_ERROR_RETRY_MS = 5000;/);
		assert.match(roomSource, /const STREAM_RECOVERY_STALE_MS = 60000;/);
		assert.match(roomSource, /const STREAM_LATEST_GAP_MAX_PAGES = 3;/);
		assert.match(roomSource, /let streamRecoveryTimer: number \| null = null;/);
		assert.match(roomSource, /let streamRecoveryPollingTimer: number \| null = null;/);
		assert.match(roomSource, /let streamRecoverySinceId: string \| undefined;/);
		assert.match(roomSource, /let isRoomViewDisposed = false;/);
		assert.match(roomSource, /function startStreamRecoveryPolling\(delay = STREAM_RECOVERY_POLL_INTERVAL_MS\)/);
		assert.match(roomSource, /if \(isRoomViewDisposed\) return;/);
		assert.match(roomSource, /let retryDelay = STREAM_RECOVERY_POLL_INTERVAL_MS;/);
		assert.match(roomSource, /const streamStale = Date\.now\(\) - latestStreamEventAt >= STREAM_RECOVERY_STALE_MS;/);
		assert.match(roomSource, /const shouldCheckLatest = shouldStickToLatest \|\| streamStale \|\| showIndicator\.value \|\| showScrollToLatestButton\.value \|\| canFetchNewer\.value;/);
		assert.match(roomSource, /retryDelay = STREAM_RECOVERY_ERROR_RETRY_MS;/);
		assert.match(roomSource, /startStreamRecoveryPolling\(retryDelay\);/);
		assert.match(roomSource, /function scheduleStreamRecovery\(reason: 'connected' \| 'visible' \| 'manual' = 'manual', options\?: \{ sinceId\?: string; force\?: boolean; reconcileLatestWindow\?: boolean \}\)/);
		assert.match(roomSource, /const shouldStickToLatest = shouldAutoRevealLatestMessages\(\);/);
		assert.match(roomSource, /options\?\.force !== true[\s\S]*isChatStreamHealthy\(\)/);
		assert.match(roomSource, /if \(reason === 'connected'\) \{[\s\S]*await waitChannelConnected\(\);[\s\S]*\}/);
		assert.match(roomSource, /await Promise\.race\(\[[\s\S]*channel\.waitConnected\(\),[\s\S]*STREAM_CONNECT_TIMEOUT/);
		assert.strictEqual(/const waitConnected = [\s\S]*\.waitConnected;/.test(roomSource), false);
		assert.match(roomSource, /await syncLatestMessages\(\{ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId, reconcileLatestWindow: shouldStickToLatest \|\| options\?\.force === true \|\| options\?\.reconcileLatestWindow === true \}\);/);
		assert.match(roomSource, /function onStreamConnected\(\) \{[\s\S]*scheduleStreamRecovery\('connected'\);[\s\S]*\}/);
		assert.match(roomSource, /function onStreamDisconnected\(\) \{[\s\S]*showScrollToLatestButton\.value = true;[\s\S]*startStreamRecoveryPolling\(STREAM_RECOVERY_ERROR_RETRY_MS\);[\s\S]*\}/);
		assert.match(roomSource, /function recoverLatestAfterMobileResume\(\) \{[\s\S]*readReceiptBatcher\.flush\(\);[\s\S]*scheduleStickToLatestAfterMutation\(\);[\s\S]*startStreamRecoveryPolling\(STREAM_RECOVERY_ERROR_RETRY_MS\);[\s\S]*scheduleStreamRecovery\('visible', \{ force: true, reconcileLatestWindow: true \}\);[\s\S]*\}/);
		assert.match(roomSource, /function onVisibilitychange\(\) \{[\s\S]*recoverLatestAfterMobileResume\(\);[\s\S]*\}/);
		assert.match(roomSource, /window\.addEventListener\('focus', onWindowFocus\);/);
		assert.match(roomSource, /window\.addEventListener\('pageshow', onPageShow\);/);
		assert.match(roomSource, /useStream\(\)\.on\('_connected_', onStreamConnected\);/);
		assert.match(roomSource, /useStream\(\)\.off\('_connected_', onStreamConnected\);/);
		assert.match(roomSource, /clearStreamRecoveryPollingTimer\(\);/);
	});

	test('keeps the mobile latest edge clear when the footer or visual viewport changes', () => {
		assert.match(roomSource, /ref="footerEl" :class="\$style\.footer"/);
		assert.match(roomSource, /const footerEl = ref<HTMLElement \| null>\(null\);/);
		assert.match(roomSource, /let chatPaneResizeObserver: ResizeObserver \| null = null;/);
		assert.match(roomSource, /let footerResizeObserver: ResizeObserver \| null = null;/);
		assert.match(roomSource, /watch\(chatPaneEl, \(to\) => \{[\s\S]*chatPaneResizeObserver = new ResizeObserver\(\(\) => \{[\s\S]*scheduleStickToLatestAfterMutation\(\);[\s\S]*\}\);[\s\S]*chatPaneResizeObserver\.observe\(to\);[\s\S]*\}, \{ immediate: true \}\);/);
		assert.match(roomSource, /watch\(footerEl, \(to\) => \{[\s\S]*footerResizeObserver = new ResizeObserver\(\(\) => \{[\s\S]*scheduleStickToLatestAfterMutation\(\);[\s\S]*\}\);[\s\S]*footerResizeObserver\.observe\(to\);[\s\S]*\}, \{ immediate: true \}\);/);
		assert.match(roomSource, /window\.visualViewport\?\.addEventListener\('resize', onVisualViewportChange\);/);
		assert.match(roomSource, /window\.visualViewport\?\.addEventListener\('scroll', onVisualViewportChange\);/);
		assert.match(roomSource, /--chat-room-footer-overlap: 18px;/);
		assert.match(roomSource, /padding:\s*14px 18px calc\(14px \+ var\(--chat-room-footer-overlap\)\);/);
		assert.match(roomSource, /height:\s*var\(--chat-room-footer-overlap\);/);
	});

	test('fills realtime message gaps without blocking latest auto-scroll', () => {
		assert.match(roomSource, /function rememberStreamRecoverySinceId\(sinceId: string \| undefined\)/);
		assert.match(roomSource, /let pendingIncomingShouldStickToLatest = false;/);
		assert.match(roomSource, /function onMessage\(message: Misskey\.entities\.ChatMessageLite\) \{[\s\S]*pendingIncomingShouldStickToLatest = pendingIncomingShouldStickToLatest \|\| shouldForceStickIncomingBatchToLatest\(\[message\]\) \|\| shouldAutoRevealLatestMessages\(\);[\s\S]*pendingIncomingMessages\.push\(message\);/);
		assert.match(roomSource, /function processIncomingMessageBatch\(batch: Misskey\.entities\.ChatMessageLite\[\], options\?: \{ stickToLatest\?: boolean \}\)/);
		assert.match(roomSource, /const batchNewestId = visibleBatch\.reduce<string \| null>/);
		assert.match(roomSource, /const shouldStickToLatest = options\?\.stickToLatest === true \|\| shouldForceStickIncomingBatchToLatest\(visibleBatch\) \|\| shouldAutoRevealLatestMessages\(\);/);
		assert.match(roomSource, /const wasAtLatest = shouldStickToLatest \|\| isAtLatest\(\);/);
		assert.match(roomSource, /const shouldRecoverGap = batchNewestId != null && findNewestPersistedMessageId\(\) != null && batchNewestId > findNewestPersistedMessageId\(\)!;/);
		assert.match(roomSource, /scheduleStreamRecovery\('manual'\);/);
		assert.match(roomSource, /newVisibleMessages = await fetchLatestGapWithRecoveryTimeout\(sinceId, \{ maxPages: STREAM_LATEST_GAP_MAX_PAGES, bufferOnly: !shouldStickToLatest \}\);/);
		assert.match(roomSource, /function bufferFetchedLatestMessages\(fetched: Misskey\.entities\.ChatMessageLite\[\]\): LatestGapMessage\[\]/);
		assert.match(roomSource, /if \(shouldStickToLatest\) \{[\s\S]*await scrollToLatestAfterLayout\(\{ flushReadReceipt: options\?\.flushReadReceipt \}\);[\s\S]*\} else \{[\s\S]*notifyNewMessages\(otherCount\);/);
		assert.match(roomSource, /void revealLatestMessagesAfterLayout\(\{ behavior: 'instant', flushReadReceipt: true \}\);/);
	});

	test('keeps locally sent and confirmed messages pinned to the bottom without showing the new-message indicator', () => {
		assert.match(roomSource, /const OUTGOING_MESSAGE_AUTO_STICK_MS = 3000;/);
		assert.match(roomSource, /function markOutgoingMessageAutoStick\(\)/);
		assert.match(roomSource, /function shouldForceStickIncomingBatchToLatest\(batch: Misskey\.entities\.ChatMessageLite\[\]\)/);
		assert.match(roomSource, /return Date\.now\(\) <= outgoingMessageAutoStickUntil \|\| batch\.some\(message => message\.fromUserId === \$i\.id\);/);
		assert.match(roomSource, /previousMetrics\.latestDistance <= SCROLL_AUTO_STICK_THRESHOLD &&[\s\S]*isNearLatestRevealDistance\(metrics\.latestDistance\)/);
		assert.match(roomSource, /const shouldStickToLatest = options\?\.stickToLatest === true \|\| shouldForceStickIncomingBatchToLatest\(visibleBatch\) \|\| shouldAutoRevealLatestMessages\(\);/);
		assert.match(roomSource, /pendingIncomingShouldStickToLatest = pendingIncomingShouldStickToLatest \|\| shouldForceStickIncomingBatchToLatest\(\[message\]\) \|\| shouldAutoRevealLatestMessages\(\);/);
		assert.match(roomSource, /function onSendingMessage\(message: NormalizedChatMessage\) \{[\s\S]*markOutgoingMessageAutoStick\(\);[\s\S]*void revealLatestMessagesAfterLayout\(\{ behavior: 'instant' \}\);/);
		assert.match(roomSource, /function onSentMessage\(message: Misskey\.entities\.ChatMessageLite, clientId\?: string\) \{[\s\S]*markOutgoingMessageAutoStick\(\);/);
	});

	test('does not auto-jump mobile users who are pulling upward near latest', () => {
		assert.match(roomSource, /latestThreshold: SCROLL_AUTO_STICK_THRESHOLD/);
		assert.match(roomSource, /function isAtLatestEdgeDistance\(latestDistance: number\): boolean \{[\s\S]*return latestDistance <= SCROLL_AUTO_STICK_THRESHOLD;[\s\S]*\}/);
		assert.match(roomSource, /function isNearLatestRevealDistance\(latestDistance: number\): boolean \{[\s\S]*return latestDistance <= SCROLL_LATEST_THRESHOLD;[\s\S]*\}/);
		assert.match(roomSource, /function shouldAutoRevealLatestMessages\(\) \{[\s\S]*if \(autoScrollState\.isUserInteracting\(\)\) \{[\s\S]*autoScrollState\.updateFromScroll\(metrics\.latestDistance\);[\s\S]*return false;[\s\S]*\}/);
		assert.match(roomSource, /function isAtLatest\(\) \{[\s\S]*if \(autoScrollState\.isUserInteracting\(\)\) \{[\s\S]*autoScrollState\.updateFromScroll\(latestDistance\);[\s\S]*return false;[\s\S]*\}/);
		assert.match(roomSource, /const shouldRevealNearLatest = !autoScrollState\.isUserInteracting\(\) && isNearLatestRevealDistance\(latestDistance\);/);
		assert.match(roomSource, /if \(isAtLatestEdgeDistance\(latestDistance\) \|\| shouldRevealNearLatest\) \{[\s\S]*detachedIncomingMessages\.length > 0 \|\| canFetchNewer\.value[\s\S]*void showLatestMessages\('instant'\);/);
		assert.match(roomSource, /if \(!isContextMode\.value\) \{[\s\S]*if \(isAtLatestEdgeDistance\(latestDistance\) \|\| shouldRevealNearLatest\) \{[\s\S]*void showLatestMessages\('instant'\);[\s\S]*\} else \{[\s\S]*showScrollToLatestButton\.value = true;/);
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
		assert.match(roomSource, /function onIndicatorClick\(\) \{[\s\S]*if \(isContextMode\.value\) \{[\s\S]*void finishContextAtLatest\(\);/);
	});

	test('exits context mode after newer pages reach the latest edge', () => {
		assert.match(roomSource, /const wasContextMode = isContextMode\.value;/);
		assert.match(roomSource, /reachedLatestInContext = wasContextMode && !canFetchNewer\.value;/);
		assert.match(roomSource, /if \(reachedLatestInContext\) \{[\s\S]*await finishContextAtLatest\(\);/);
		assert.match(roomSource, /async function finishContextAtLatest\(\) \{[\s\S]*clearMessageContextRoute\(\);[\s\S]*contextTargetMessageId\.value = null;[\s\S]*pendingContextScrollId\.value = null;[\s\S]*await showLatestMessages\('instant'\);[\s\S]*await fillInitialScrollableHistory\(\);/);
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

	test('expands media chat bubbles while keeping text bubbles compact', async () => {
		const source = await import('@/pages/chat/XMessage.vue?raw').then(module => module.default);

		assert.match(source, /const hasFile = computed\(\(\) => props\.message\.file != null\);/);
		assert.match(source, /const hasVideoFile = computed\(\(\) => props\.message\.file\?\.type\.startsWith\('video'\) === true\);/);
		assert.match(source, /\[\$style\.mediaBubble\]: hasFile/);
		assert.match(source, /\[\$style\.videoBubble\]: hasVideoFile/);
		assert.match(source, /\.mediaBubble\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
		assert.match(source, /\.file\s*\{[\s\S]*width:\s*100%;[\s\S]*min-width:\s*min\(100%,\s*320px\);/);
		assert.match(source, /\.videoBubble\s*\{[\s\S]*\.file\s*\{[\s\S]*min-width:\s*min\(100%,\s*420px\);/);
	});

	test('gives single video media a readable responsive size', () => {
		assert.match(mediaListSource, /const hasSingleVideo = computed\(\(\) => previewableMediaList\.value\.length === 1 && previewableMediaList\.value\[0\]\?\.type\.startsWith\('video'\) === true\);/);
		assert.match(mediaListSource, /\[\$style\.singleVideo\]: hasSingleVideo/);
		assert.match(mediaListSource, /\.singleVideo\s*\{[\s\S]*aspect-ratio:\s*16 \/ 9;[\s\S]*min-height:\s*clamp\(220px,\s*32vw,\s*420px\);[\s\S]*max-height:\s*min\(70vh,\s*560px\);/);
		assert.match(mediaListSource, /\.singleVideo\s*>\s*\.media\s*\{[\s\S]*min-height:\s*inherit;/);
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
		assert.match(roomSource, /if \(!wasAtLatest\) \{[\s\S]*detachedIncomingMessages = trimDetachedIncomingMessages\(appendDetachedChatMessages\(detachedIncomingMessages, visibleBatch, messages\.value\)\);[\s\S]*messages\.value = adopted;[\s\S]*notifyNewMessages\(otherCount\);[\s\S]*return;/);
		assert.match(roomSource, /void revealLatestMessagesAfterLayout\(\{ behavior: 'instant', flushReadReceipt: true \}\);/);
		assert.match(roomSource, /function scrollToLatest\(behavior: ScrollBehavior = 'smooth'[\s\S]*flushDetachedIncomingMessages\(\{ queueReadReceipt: true \}\)/);
		assert.match(roomSource, /if \(!isContextMode\.value && \(detachedIncomingMessages\.length > 0 \|\| canFetchNewer\.value\)\) \{[\s\S]*void showLatestMessages\('instant'\);[\s\S]*return;/);
		assert.strictEqual(/const anchor = wasAtLatest \? null : getVisibleMessageAnchor\(\);[\s\S]*restoreVisibleMessageAnchorAfterLayout\(anchor\)/.test(roomSource), false);
	});

	test('reports when a bounded timeline window drops newest or oldest messages', () => {
		const current = [
			{ id: '120', createdAt: '2026-06-01T00:03:00.000Z' },
			{ id: '110', createdAt: '2026-06-01T00:02:00.000Z' },
			{ id: '100', createdAt: '2026-06-01T00:01:00.000Z' },
		];

		const historyWindow = mergeChatMessagesWithWindowResult(current, [
			{ id: '090', createdAt: '2026-06-01T00:00:00.000Z' },
			{ id: '080', createdAt: '2026-05-31T23:59:00.000Z' },
		], { limit: 3, keep: 'oldest', preserveExistingOrder: true });
		assert.deepStrictEqual(historyWindow.items.map(item => item.id), ['100', '090', '080']);
		assert.strictEqual(historyWindow.droppedNewest, true);
		assert.strictEqual(historyWindow.droppedOldest, false);

		const latestWindow = mergeChatMessagesWithWindowResult(historyWindow.items, [
			{ id: '130', createdAt: '2026-06-01T00:04:00.000Z' },
			{ id: '140', createdAt: '2026-06-01T00:05:00.000Z' },
		], { limit: 3, keep: 'newest', preserveExistingOrder: true });
		assert.deepStrictEqual(latestWindow.items.map(item => item.id), ['140', '130', '100']);
		assert.strictEqual(latestWindow.droppedNewest, false);
		assert.strictEqual(latestWindow.droppedOldest, true);
	});

	test('tracks real latest and history availability when the mobile data window is trimmed', () => {
		assert.match(roomSource, /type MergeMessagesResult = \{[\s\S]*messages: NormalizedChatMessage\[\];[\s\S]*droppedNewest: boolean;[\s\S]*droppedOldest: boolean;[\s\S]*\};/);
		assert.match(roomSource, /function mergeMessagesWithResult\(first: NormalizedChatMessage\[\] \| \{ keep\?: 'newest' \| 'oldest' \}, \.\.\.rest: NormalizedChatMessage\[\]\[\]\): MergeMessagesResult/);
		assert.match(roomSource, /function applyWindowTrimFlags\(result: MergeMessagesResult\) \{[\s\S]*if \(result\.droppedNewest\) \{[\s\S]*canFetchNewer\.value = true;[\s\S]*showScrollToLatestButton\.value = true;[\s\S]*\}[\s\S]*if \(result\.droppedOldest\) \{[\s\S]*canFetchMore\.value = true;/);
		assert.match(roomSource, /const result = mergeMessagesWithResult\(\{ keep \}, current, normalized\);[\s\S]*messages\.value = result\.messages;[\s\S]*applyWindowTrimFlags\(result\);/);
		assert.match(roomSource, /async function fetchMore\(options: \{ keepLatest\?: boolean \} = \{\}\) \{[\s\S]*appendFetchedMessagesWithWindow\(newMessages, options\.keepLatest \? 'newest' : 'oldest'\);[\s\S]*canFetchMore\.value = newMessages\.length === LIMIT;/);
		assert.match(roomSource, /async function fetchNewer\(\) \{[\s\S]*appendFetchedMessagesWithWindow\(newMessages, 'newest'\);[\s\S]*canFetchNewer\.value = newMessages\.length === LIMIT;/);
	});

	test('keeps mobile room windows large enough for fast bidirectional paging', () => {
		const makeMessage = (id: number) => ({
			id: id.toString().padStart(6, '0'),
			createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString(),
			fromUserId: `user-${id % 12}`,
		});

		const mobileLimit = 240;
		const detachedLimit = 160;
		const latestMessages = Array.from({ length: 300 }, (_, i) => makeMessage(1000 - i));
		const latestWindow = mergeChatMessagesWithWindowResult([], latestMessages, { limit: mobileLimit, keep: 'newest' });
		assert.strictEqual(latestWindow.items.length, mobileLimit);
		assert.strictEqual(latestWindow.droppedOldest, true);
		assert.strictEqual(latestWindow.items[0].id, '001000');
		assert.strictEqual(latestWindow.items.at(-1)?.id, '000761');

		const historyMessages = Array.from({ length: 100 }, (_, i) => makeMessage(760 - i));
		const historyWindow = mergeChatMessagesWithWindowResult(latestWindow.items, historyMessages, { limit: mobileLimit, keep: 'oldest', preserveExistingOrder: true });
		assert.strictEqual(historyWindow.items.length, mobileLimit);
		assert.strictEqual(historyWindow.droppedNewest, true);
		assert.strictEqual(historyWindow.items[0].id, '000900');
		assert.strictEqual(historyWindow.items.at(-1)?.id, '000661');

		const activeRoomBurst = Array.from({ length: 500 }, (_, i) => makeMessage(1001 + i));
		const rawDetachedBuffer = appendDetachedChatMessages([], activeRoomBurst, historyWindow.items);
		const trimmedDetachedBuffer = mergeChatMessagesForTimeline([], rawDetachedBuffer, { limit: detachedLimit, keep: 'newest' });
		assert.strictEqual(rawDetachedBuffer.length, 500);
		assert.strictEqual(trimmedDetachedBuffer.length, detachedLimit);
		assert.strictEqual(trimmedDetachedBuffer[0].id, '001500');
		assert.strictEqual(trimmedDetachedBuffer.at(-1)?.id, '001341');

		const revealedWindow = mergeChatMessagesWithWindowResult(historyWindow.items, [...trimmedDetachedBuffer, ...latestWindow.items], { limit: mobileLimit, keep: 'newest' });
		assert.strictEqual(revealedWindow.items.length, mobileLimit);
		assert.strictEqual(revealedWindow.items[0].id, '001500');
		assert.strictEqual(revealedWindow.items.at(-1)?.id, '000921');
		assert.match(roomSource, /const MAX_DETACHED_INCOMING_MESSAGES = 160;/);
		assert.match(roomSource, /function trimDetachedIncomingMessages\(items: Misskey\.entities\.ChatMessageLite\[\]\): Misskey\.entities\.ChatMessageLite\[\]/);
		assert.match(roomSource, /detachedIncomingMessages = trimDetachedIncomingMessages\(appendDetachedChatMessages\(detachedIncomingMessages, visibleBatch, messages\.value\)\);/);
		assert.match(roomSource, /const MAX_ROOM_MESSAGES_MOBILE = 240;/);
	});

	test('reveals the authoritative latest window before jumping to the real room bottom', () => {
		assert.match(roomSource, /async function showLatestMessages\(behavior: ScrollBehavior = 'smooth'\) \{[\s\S]*await revealAuthoritativeLatestWindow\(\);[\s\S]*await scrollToLatestAfterLayout\(\{ behavior, flushReadReceipt: true \}\);/);
		assert.match(roomSource, /async function revealAuthoritativeLatestWindow\(\) \{[\s\S]*const latestWindow = await reconcileLatestTimelineWindow\(\);[\s\S]*flushIncomingMessagesNow\(\{ stickToLatest: true \}\);[\s\S]*const latestResult = appendFetchedMessagesWithWindow\(latestWindow, 'newest'\);[\s\S]*flushDetachedIncomingMessages\(\{ queueReadReceipt: true, keep: 'newest' \}\);[\s\S]*if \(latestResult\.length > 0 \|\| detachedIncomingMessages\.length === 0\) \{[\s\S]*canFetchNewer\.value = false;/);
		assert.match(roomSource, /if \(!isRestoringHistoryScroll\.value && canFetchNewer\.value && !newerFetching\.value && !moreFetching\.value && messages\.value\.length > 0 && newerFetchArmed && latestDistance < SCROLL_TAIL_THRESHOLD\) \{[\s\S]*if \(!isContextMode\.value\) \{[\s\S]*if \(isAtLatestEdgeDistance\(latestDistance\) \|\| shouldRevealNearLatest\) \{[\s\S]*newerFetchArmed = false;[\s\S]*void showLatestMessages\('instant'\);/);
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
		assert.match(roomSource, /const TIMELINE_RECONCILE_LIMIT = 50;/);
		assert.match(roomSource, /const CHAT_RECONCILE_TIMEOUT_MS = 5000;/);
		assert.match(roomSource, /const CHAT_RECOVERY_FETCH_TIMEOUT_MS = 10000;/);
		assert.match(roomSource, /limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /function reconcileLocalMessagesWithLatestWindow\(latestWindow: Misskey\.entities\.ChatMessageLite\[\]\)/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(messages\.value, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT,[\s\S]*isPending: isPendingMessage/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(pendingIncomingMessages, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /findMissingChatMessageIdsInLatestWindow\(detachedIncomingMessages, latestWindow, \{[\s\S]*limit: TIMELINE_RECONCILE_LIMIT/);
		assert.match(roomSource, /const initialSinceId = options\?\.sinceId \?\? findNewestPersistedMessageId\(\);/);
		assert.match(roomSource, /const sinceId = options\?\.sinceId \?\? findNewestPersistedMessageId\(\) \?\? initialSinceId;/);
		assert.match(roomSource, /if \(options\?\.reconcileLatestWindow === true\) \{[\s\S]*await reconcileLatestTimelineWindow\(\);/);
		assert.match(roomSource, /await revealAuthoritativeLatestWindow\(\);[\s\S]*await scrollToLatestAfterLayout\(\{ behavior, flushReadReceipt: true \}\);/);
		assert.match(roomSource, /async function ensureLatestOnChatTabReturn\(generation: number, options: \{ forceLatest\?: boolean \} = \{\}\) \{[\s\S]*const shouldStickToLatest = options\.forceLatest === true \|\| shouldAutoRevealLatestMessages\(\);[\s\S]*await syncLatestMessages\(\{ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId, reconcileLatestWindow: shouldStickToLatest \}\);/);
		assert.match(roomSource, /const controller = new AbortController\(\);[\s\S]*const timeoutId = window\.setTimeout\(\(\) => controller\.abort\(\), CHAT_RECONCILE_TIMEOUT_MS\);[\s\S]*await fetchLatestTimelineWindow\(controller\.signal\);[\s\S]*window\.clearTimeout\(timeoutId\);/);
		assert.match(roomSource, /misskeyApi\('chat\/messages\/room-timeline'[\s\S]*undefined, signal\);/);
		assert.match(roomSource, /misskeyApi\('chat\/messages\/user-timeline'[\s\S]*undefined, signal\);/);
		assert.match(roomSource, /async function fetchLatestGapWithRecoveryTimeout\(sinceId: string \| undefined, options\?: \{ maxPages\?: number; bufferOnly\?: boolean \}\)/);
		assert.match(roomSource, /window\.setTimeout\(\(\) => controller\.abort\(\), CHAT_RECOVERY_FETCH_TIMEOUT_MS\)/);
		assert.match(roomSource, /return await fetchLatestGap\(sinceId, \{[\s\S]*signal: controller\.signal/);
		assert.match(roomSource, /newVisibleMessages = await fetchLatestGapWithRecoveryTimeout\(sinceId, \{ maxPages: STREAM_LATEST_GAP_MAX_PAGES, bufferOnly: !shouldStickToLatest \}\);/);
		assert.match(roomSource, /scheduleStreamRecovery\('visible', \{ force: true, reconcileLatestWindow: true \}\);/);
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
		assert.match(roomSource, /const MAX_ROOM_MESSAGES_MOBILE = 240;/);
		assert.match(roomSource, /const MAX_CONTEXT_MESSAGES = 120;/);
		assert.match(roomSource, /const visibleTimeline = computed\(\(\) => timeline\.value\.toReversed\(\)\.map\(item => \(\{/);
		assert.match(roomSource, /v-for="item in visibleTimeline"/);
		assert.strictEqual(roomSource.includes('v-for="item in timeline.toReversed()"'), false);
		assert.match(roomSource, /appendFetchedMessagesWithWindow\(newMessages, options\.keepLatest \? 'newest' : 'oldest'\);/);
		assert.match(roomSource, /const limit = messageLimit\(\);[\s\S]*if \(limit != null && messages\.value\.length >= limit\) return;[\s\S]*await fetchMore\(\{ keepLatest: true \}\);/);
		assert.match(roomSource, /mergeMessagesWithResult\(\{ keep \}, current, normalized\);/);
	});

	test('serializes upward and downward paging to keep mobile anchors stable', () => {
		assert.match(roomSource, /async function fetchMore\(options: \{ keepLatest\?: boolean \} = \{\}\) \{[\s\S]*if \(!canFetchMore\.value \|\| moreFetching\.value \|\| newerFetching\.value \|\| untilId == null\) return;/);
		assert.match(roomSource, /async function fetchNewer\(\) \{[\s\S]*if \(!canFetchNewer\.value \|\| newerFetching\.value \|\| moreFetching\.value \|\| sinceId == null\) return;/);
		assert.match(roomSource, /for \(let i = 0; i < 14; i\+\+\) \{[\s\S]*restoreVisibleMessageAnchor\(anchor\);/);
	});

	test('does not use content-visibility for chat message rows on mobile WebKit', () => {
		const messageItemRule = roomSource.match(/\.messageItem\s*\{(?<body>[\s\S]*?)\n\}/);
		assert.ok(messageItemRule?.groups?.body != null);
		assert.ok(!messageItemRule.groups.body.includes('content-visibility: auto'));
		assert.ok(!messageItemRule.groups.body.includes('contain-intrinsic-size'));
	});

	test('prompts active clients when a new frontend entry is deployed', () => {
		assert.match(commonBootSource, /import \{ reloadChannel, unisonReload \} from '@\/utility\/unison-reload\.js';/);
		assert.match(commonBootSource, /import \* as os from '@\/os\.js';/);
		assert.match(commonBootSource, /type FrontendDeploymentFingerprint = \{[\s\S]*version: string;[\s\S]*clientEntry: string;[\s\S]*\};/);
		assert.match(commonBootSource, /CLIENT_ENTRY/);
		assert.match(commonBootSource, /function parseFrontendDeploymentFingerprint\(html: string\): FrontendDeploymentFingerprint \| null/);
		assert.match(commonBootSource, /html\.match\(\/\\bvar\\s\+VERSION/);
		assert.match(commonBootSource, /html\.match\(\/\\bvar\\s\+CLIENT_ENTRY/);
		assert.match(commonBootSource, /function isDifferentFrontendDeployment\(next: FrontendDeploymentFingerprint\): boolean \{[\s\S]*next\.clientEntry\.length > 0 && next\.clientEntry !== currentFrontendDeployment\.clientEntry/);
		assert.match(commonBootSource, /function shouldPromptFrontendDeploymentUpdate\(next: FrontendDeploymentFingerprint\): boolean \{[\s\S]*next\.version !== currentFrontendDeployment\.version/);
		assert.match(commonBootSource, /const FRONTEND_UPDATE_DECLINED_MS = 24 \* 60 \* 60_000;/);
		assert.match(commonBootSource, /const FRONTEND_UPDATE_RELOAD_ATTEMPT_MS = 24 \* 60 \* 60_000;/);
		assert.match(commonBootSource, /function frontendUpdateReloadingKey\(next: FrontendDeploymentFingerprint\): string/);
		assert.match(commonBootSource, /function clearFrontendUpdateReloadMarkerIfCurrent\(\): void \{[\s\S]*frontendUpdateReloadedTo\(\) !== currentFrontendDeployment\.clientEntry[\s\S]*url\.searchParams\.delete\('_frontendUpdatedTo'\);[\s\S]*window\.history\.replaceState\(window\.history\.state, '', url\.toString\(\)\);[\s\S]*\}/);
		assert.match(commonBootSource, /function markFrontendUpdateReloadAttempt\(next: FrontendDeploymentFingerprint\): void \{[\s\S]*window\.sessionStorage\.setItem\(frontendUpdateReloadingKey\(next\), value\);[\s\S]*window\.localStorage\.setItem\(frontendUpdateReloadingKey\(next\), value\);[\s\S]*\}/);
		assert.match(commonBootSource, /function repairAcceptedFrontendUpdateIfStillStale\(next: FrontendDeploymentFingerprint\): Promise<void> \{[\s\S]*frontendUpdateReloadedTo\(\) !== next\.clientEntry && !wasFrontendUpdateReloadRecentlyAttempted\(next\)[\s\S]*repairFrontendRuntimeCaches\([\s\S]*frontend-update:\$\{currentFrontendDeployment\.clientEntry\}:\$\{next\.clientEntry\}/);
		assert.match(commonBootSource, /function reloadToFrontendDeployment\(next: FrontendDeploymentFingerprint\): never \{[\s\S]*frontendUpdateReloading = true;[\s\S]*markFrontendUpdateReloadAttempt\(next\);[\s\S]*url\.searchParams\.set\('_frontendUpdatedTo', next\.clientEntry\);[\s\S]*unisonReload\(url\.toString\(\)\);/);
		assert.match(commonBootSource, /const \{ canceled \} = await os\.confirm\(\{[\s\S]*text: i18n\.ts\.youShouldUpgradeClient,[\s\S]*okText: i18n\.ts\.reload/);
		assert.match(commonBootSource, /if \(canceled\) \{[\s\S]*const value = Date\.now\(\)\.toString\(\);[\s\S]*window\.sessionStorage\.setItem\(frontendUpdateDeclinedKey\(next\), value\);[\s\S]*window\.localStorage\.setItem\(frontendUpdateDeclinedKey\(next\), value\);[\s\S]*return;/);
		assert.match(commonBootSource, /url\.searchParams\.delete\('_frontendUpdatedTo'\);[\s\S]*url\.searchParams\.set\('_frontendUpdateCheck', Date\.now\(\)\.toString\(\)\);/);
		assert.match(commonBootSource, /await repairAcceptedFrontendUpdateIfStillStale\(next\);[\s\S]*if \(!shouldPromptFrontendDeploymentUpdate\(next\)\) return;/);
		assert.match(commonBootSource, /await repairAcceptedFrontendUpdateIfStillStale\(next\);[\s\S]*if \(wasFrontendUpdateReloadRecentlyAttempted\(next\)\) return;/);
		assert.match(commonBootSource, /if \(!_DEV_\) \{[\s\S]*clearFrontendUpdateReloadMarkerIfCurrent\(\);[\s\S]*const scheduleFrontendDeploymentUpdateCheck/);
		assert.match(commonBootSource, /window\.setInterval\(\(\) => \{[\s\S]*checkFrontendDeploymentUpdate\(\);[\s\S]*\}, 60_000\);/);
	});

	test('checks frontend asset freshness with update markers removed from the URL', () => {
		assert.match(frontendConsistencySource, /url\.searchParams\.delete\('_frontendUpdatedTo'\);/);
		assert.match(frontendConsistencySource, /url\.searchParams\.delete\('_frontendRepair'\);/);
		assert.match(frontendConsistencySource, /url\.searchParams\.delete\('_frontendUpdateCheck'\);/);
		assert.match(frontendConsistencySource, /url\.searchParams\.set\('_frontendAssetCheck', Date\.now\(\)\.toString\(\)\);/);
		assert.match(frontendConsistencySource, /window\.fetch\(`\$\{url\.pathname\}\$\{url\.search\}`,[\s\S]*cache: 'no-store'/);
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
				return 1;
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
