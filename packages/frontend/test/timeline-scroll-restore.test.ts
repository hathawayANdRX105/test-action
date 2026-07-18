/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { Ref as VueRef } from 'vue';
import { afterEach, assert, beforeEach, describe, test, vi } from 'vitest';
import paginationSource from '@/components/MkPagination.vue?raw';
import followingRecentNotesSource from '@/components/SkFollowingRecentNotes.vue?raw';
import timelineSource from '@/components/MkTimeline.vue?raw';
import pageWithHeaderSource from '@/components/global/PageWithHeader.vue?raw';
import routerViewSource from '@/components/global/RouterView.vue?raw';
import antennaTimelinePageSource from '@/pages/antenna-timeline.vue?raw';
import channelPageSource from '@/pages/channel.vue?raw';
import explorePageSource from '@/pages/explore.vue?raw';
import followingFeedPageSource from '@/pages/following-feed.vue?raw';
import homeTimelinePageSource from '@/pages/timeline.vue?raw';
import searchPageSource from '@/pages/search.vue?raw';
import tagPageSource from '@/pages/tag.vue?raw';
import userListTimelinePageSource from '@/pages/user-list-timeline.vue?raw';
import userPageSource from '@/pages/user/index.vue?raw';
import clearCacheSource from '@/utility/clear-cache.ts?raw';
import scrollKeeperSource from '@/use/use-scroll-position-keeper.ts?raw';

const routerMockState = vi.hoisted(() => ({
	currentFullPath: '/timeline',
	listeners: {
		change: [] as ((ctx: { beforeFullPath: string; fullPath: string }) => void)[],
		same: [] as (() => void)[],
	},
}));

vi.mock('@/router.js', () => ({
	useRouter: () => ({
		getCurrentFullPath: () => routerMockState.currentFullPath,
		addListener: (event: 'change' | 'same', listener: ((ctx: { beforeFullPath: string; fullPath: string }) => void) | (() => void)) => {
			if (event === 'change') {
				routerMockState.listeners.change.push(listener as (ctx: { beforeFullPath: string; fullPath: string }) => void);
			} else {
				routerMockState.listeners.same.push(listener as () => void);
			}
		},
		useListener: (event: 'change' | 'same', listener: ((ctx: { beforeFullPath: string; fullPath: string }) => void) | (() => void)) => {
			if (event === 'change') {
				routerMockState.listeners.change.push(listener as (ctx: { beforeFullPath: string; fullPath: string }) => void);
			} else {
				routerMockState.listeners.same.push(listener as () => void);
			}
		},
	}),
}));

vi.mock('@/i.js', () => ({
	$i: { id: 'account-a' },
}));

function emitRouteChange(beforeFullPath: string, fullPath: string): void {
	routerMockState.currentFullPath = fullPath;
	for (const listener of routerMockState.listeners.change) {
		listener({ beforeFullPath, fullPath });
	}
}

function rect(top: number, bottom: number): DOMRect {
	return {
		x: 0,
		y: top,
		top,
		bottom,
		left: 0,
		right: 100,
		width: 100,
		height: bottom - top,
		toJSON: () => ({}),
	} as DOMRect;
}

function installScrollGeometry(scrollContainer: HTMLElement, options: {
	scrollTop: number;
	anchorTops: Record<string, number>;
}): ReturnType<typeof vi.fn> {
	let currentScrollTop = options.scrollTop;
	Object.defineProperty(scrollContainer, 'scrollTop', {
		get: () => currentScrollTop,
		set: (value: number) => {
			currentScrollTop = value;
		},
		configurable: true,
	});
	scrollContainer.getBoundingClientRect = () => rect(0, 300);
	const scrollTo = vi.fn((value: ScrollToOptions) => {
		if (typeof value.top === 'number') {
			currentScrollTop = value.top;
		}
	});
	scrollContainer.scrollTo = scrollTo as unknown as typeof scrollContainer.scrollTo;

	for (const [anchorId, top] of Object.entries(options.anchorTops)) {
		const anchor = scrollContainer.querySelector<HTMLElement>(`[data-scroll-anchor="${anchorId}"]`);
		assert.isNotNull(anchor);
		anchor.getBoundingClientRect = () => rect(top, top + 60);
	}

	return scrollTo;
}

async function renderScrollKeeper(key: string | VueRef<string> = 'timeline:home', withAnchors = true) {
	const { useScrollPositionKeeper } = await import('@/use/use-scroll-position-keeper.js');
	const TestComponent = defineComponent({
		setup() {
			const rootEl = ref<HTMLElement | null>(null);
			useScrollPositionKeeper(rootEl, { key });

			const notes = withAnchors
				? [
					h('article', { 'data-scroll-anchor': 'note-1' }, 'note 1'),
					h('article', { 'data-scroll-anchor': 'note-2' }, 'note 2'),
					h('article', { 'data-scroll-anchor': 'note-3' }, 'note 3'),
				]
				: [
					h('article', 'note 1'),
					h('article', 'note 2'),
					h('article', 'note 3'),
				];

			return () => h('div', { ref: rootEl, 'data-testid': 'scroll-container' }, notes);
		},
	});
	const result = render(TestComponent);
	return result;
}

function installScrollRange(scrollContainer: HTMLElement, metrics: {
	scrollHeight: number;
	clientHeight: number;
}): void {
	Object.defineProperty(scrollContainer, 'scrollHeight', {
		get: () => metrics.scrollHeight,
		configurable: true,
	});
	Object.defineProperty(scrollContainer, 'clientHeight', {
		get: () => metrics.clientHeight,
		configurable: true,
	});
}

beforeEach(() => {
	routerMockState.currentFullPath = '/timeline';
	routerMockState.listeners.change.length = 0;
	routerMockState.listeners.same.length = 0;
	window.sessionStorage.clear();
	vi.useFakeTimers();
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
	window.sessionStorage.clear();
});

describe('timeline scroll restoration', () => {
	test('keeps queued timeline notes from forcing return-to-latest after viewing a note', () => {
		assert.match(paginationSource, /let lastKnownHeadState = false;/);
		assert.match(paginationSource, /function setupHeadStateScrollListener\(\)/);
		assert.match(paginationSource, /const scrollTarget = scrollableElement\.value;[\s\S]*scrollTarget\.addEventListener\('scroll', onScroll, \{ passive: true \}\);/);
		assert.match(paginationSource, /function isCurrentScrollAtHead\(\): boolean \{[\s\S]*props\.pagination\.reversed \? isTailVisible : isHeadVisible/);
		assert.match(paginationSource, /const isHead = \(\): boolean => isBackTop\.value \|\| isCurrentScrollAtHead\(\);/);
		assert.match(paginationSource, /onDeactivated\(\(\) => \{[\s\S]*isBackTop\.value = lastKnownHeadState;[\s\S]*\}\);/);
		assert.notMatch(paginationSource, /onDeactivated\(\(\) => \{[\s\S]*window\.scrollY[\s\S]*\}\);/);
	});

	test('captures the visible note anchor immediately before route deactivation', () => {
		assert.match(scrollKeeperSource, /type ScrollPositionSnapshot = \{[\s\S]*anchorId: string \| null;[\s\S]*anchorTop: number \| null;[\s\S]*scrollTop: number;/);
		assert.match(scrollKeeperSource, /restoreOnNextVisit: boolean;/);
		assert.match(scrollKeeperSource, /const STORAGE_PREFIX = 'sharkey:scroll-position:';/);
		assert.match(scrollKeeperSource, /const SNAPSHOT_TTL = 1000 \* 60 \* 30;/);
		assert.match(scrollKeeperSource, /const accountKey = \$i\?\.id \?\? 'guest';/);
		assert.match(scrollKeeperSource, /encodeURIComponent\(accountKey\).*encodeURIComponent\(key\)/);
		assert.match(scrollKeeperSource, /key\?: MaybeRefOrGetter<string \| null \| undefined>;/);
		assert.match(scrollKeeperSource, /let latestSnapshot: ScrollPositionSnapshot \| null = null;/);
		assert.match(scrollKeeperSource, /let latestSnapshotStorageKey: string \| null = null;/);
		assert.match(scrollKeeperSource, /let captureAnchor: \(\(\) => void\) \| null = null;/);
		assert.match(scrollKeeperSource, /const captureOptions: AddEventListenerOptions = \{ capture: true, passive: true \};/);
		assert.match(scrollKeeperSource, /window\.sessionStorage\.setItem\(storageKey, JSON\.stringify\(snapshot\)\);/);
		assert.match(scrollKeeperSource, /Date\.now\(\) - updatedAt > SNAPSHOT_TTL/);
		assert.match(scrollKeeperSource, /if \(!scrollContainer\.isConnected\) return;/);
		assert.match(scrollKeeperSource, /if \(scrollContainerRect\.height <= 0\) return null;/);
		assert.match(scrollKeeperSource, /const top = anchorRect\.top - containerTop;/);
		assert.match(scrollKeeperSource, /el\.addEventListener\('pointerdown', onScroll, captureOptions\);/);
		assert.match(scrollKeeperSource, /el\.addEventListener\('click', onScroll, captureOptions\);/);
		assert.match(scrollKeeperSource, /const snapshot = readSnapshot\(storageKey\) \?\? \(latestSnapshotStorageKey === storageKey \? latestSnapshot : null\);/);
		assert.match(scrollKeeperSource, /function loadLatestSnapshotForCurrentKey\(\): void \{[\s\S]*const storedSnapshot = readSnapshot\(storageKey\);[\s\S]*latestSnapshot = storedSnapshot;[\s\S]*latestSnapshotStorageKey = storageKey;[\s\S]*\}/);
		assert.match(scrollKeeperSource, /watch\(\(\) => getStorageKey\(\), \([\s\S]*loadLatestSnapshotForCurrentKey\(\);[\s\S]*nextTick\(scheduleRestore\);[\s\S]*\}\);/);
		assert.match(scrollKeeperSource, /if \(scrollAnchorEl == null\) return false;/);
		assert.match(scrollKeeperSource, /const maxScrollTop = scrollContainer\.scrollHeight - scrollContainer\.clientHeight;[\s\S]*if \(maxScrollTop < targetScrollTop - 1\) return false;/);
		assert.match(scrollKeeperSource, /new MutationObserver\(\(\) => \{[\s\S]*tryRestore\(\);[\s\S]*\}\);/);
		assert.match(scrollKeeperSource, /const RESTORE_OBSERVER_TIMEOUT = 2000;/);
		assert.include(scrollKeeperSource, 'return snapshot.restoreOnNextVisit && (restoreArmed || wasLatestRouteChangeFromNoteTo(router, routeFullPath)) ? snapshot : null;');
		assert.match(scrollKeeperSource, /onDeactivated\(\(\) => \{[\s\S]*captureAnchor\?\.\(\);[\s\S]*clearRestoreTimers\(\);[\s\S]*ready = false;[\s\S]*\}\);/);
	});

	test('only arms persisted restoration when navigating back from note detail', () => {
		assert.match(scrollKeeperSource, /const lastRouteTransitions = new WeakMap/);
		assert.match(scrollKeeperSource, /const trackedRouters = new WeakSet/);
		assert.match(scrollKeeperSource, /function ensureRouteTransitionTracking\(router: Router\): void \{[\s\S]*router\.addListener\('change', \(\{ beforeFullPath, fullPath \}\) => \{[\s\S]*lastRouteTransitions\.set\(router, \{ beforeFullPath, fullPath \}\);[\s\S]*\}\);[\s\S]*\}/);
		assert.match(scrollKeeperSource, /function wasLatestRouteChangeFromNoteTo\(router: Router, fullPath: string\): boolean \{[\s\S]*transition\?\.fullPath === fullPath && isNotePath\(transition\.beforeFullPath\);[\s\S]*\}/);
		assert.match(scrollKeeperSource, /ensureRouteTransitionTracking\(router\);/);
		assert.match(scrollKeeperSource, /const routeFullPath = router\.getCurrentFullPath\(\);/);
		assert.include(scrollKeeperSource, 'return /^\\/notes\\/[^/?#]+/.test(path);');
		assert.include(scrollKeeperSource, 'snapshot.restoreOnNextVisit && (restoreArmed || wasLatestRouteChangeFromNoteTo(router, routeFullPath))');
		assert.match(scrollKeeperSource, /if \(beforeFullPath === routeFullPath && isNotePath\(fullPath\)\) \{[\s\S]*captureAnchor\?\.\(\);[\s\S]*writeLatestSnapshot\(true\);[\s\S]*persistForNoteReturn = true;/);
		assert.match(scrollKeeperSource, /if \(fullPath === routeFullPath && isNotePath\(beforeFullPath\)\) \{[\s\S]*restoreArmed = true;/);
		assert.match(scrollKeeperSource, /writeLatestSnapshot\(persistForNoteReturn\);[\s\S]*persistForNoteReturn = false;/);
		assert.match(scrollKeeperSource, /restoreArmed = false;[\s\S]*writeLatestSnapshot\(false\);/);
	});

	test('restores a session-persisted anchor after returning from note detail', async () => {
		const firstRender = await renderScrollKeeper();
		const firstScrollContainer = firstRender.getByTestId('scroll-container');
		installScrollGeometry(firstScrollContainer, {
			scrollTop: 100,
			anchorTops: {
				'note-1': 20,
				'note-2': 120,
				'note-3': 220,
			},
		});
		await nextTick();
		firstScrollContainer.dispatchEvent(new Event('click', { bubbles: true }));

		emitRouteChange('/timeline', '/notes/note-2');

		const storageKey = 'sharkey:scroll-position:account-a:timeline%3Ahome';
		const storedSnapshot = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}');
		assert.equal(storedSnapshot.anchorId, 'note-2');
		assert.equal(storedSnapshot.anchorTop, 120);
		assert.equal(storedSnapshot.scrollTop, 100);
		assert.equal(storedSnapshot.restoreOnNextVisit, true);

		firstRender.unmount();
		routerMockState.currentFullPath = '/timeline';

		const secondRender = await renderScrollKeeper();
		const secondScrollContainer = secondRender.getByTestId('scroll-container');
		const scrollTo = installScrollGeometry(secondScrollContainer, {
			scrollTop: 100,
			anchorTops: {
				'note-1': 160,
				'note-2': 260,
				'note-3': 360,
			},
		});
		emitRouteChange('/notes/note-2', '/timeline');

		await nextTick();
		await vi.runOnlyPendingTimersAsync();

		assert.equal(secondScrollContainer.scrollTop, 240);
		assert.deepEqual(scrollTo.mock.calls[0]?.[0], {
			top: 240,
			behavior: 'instant',
		});

		const restoredSnapshot = JSON.parse(window.sessionStorage.getItem(storageKey) ?? '{}');
		assert.equal(restoredSnapshot.restoreOnNextVisit, false);
	});

	test('does not restore a stored anchor on ordinary remount without a note-detail return', async () => {
		const firstRender = await renderScrollKeeper();
		const firstScrollContainer = firstRender.getByTestId('scroll-container');
		installScrollGeometry(firstScrollContainer, {
			scrollTop: 100,
			anchorTops: {
				'note-1': 20,
				'note-2': 120,
				'note-3': 220,
			},
		});
		await nextTick();
		firstScrollContainer.dispatchEvent(new Event('click', { bubbles: true }));
		firstRender.unmount();

		const secondRender = await renderScrollKeeper();
		const secondScrollContainer = secondRender.getByTestId('scroll-container');
		const scrollTo = installScrollGeometry(secondScrollContainer, {
			scrollTop: 100,
			anchorTops: {
				'note-1': 160,
				'note-2': 260,
				'note-3': 360,
			},
		});

		await nextTick();
		await vi.runOnlyPendingTimersAsync();

		assert.equal(secondScrollContainer.scrollTop, 100);
		assert.equal(scrollTo.mock.calls.length, 0);
	});

	test('waits for an async scroll key before restoring a note-return anchor', async () => {
		const storageKey = 'sharkey:scroll-position:account-a:user%3Auser-id%3Anotes';
		window.sessionStorage.setItem(storageKey, JSON.stringify({
			anchorId: 'note-2',
			anchorTop: 120,
			scrollTop: 100,
			updatedAt: Date.now(),
			restoreOnNextVisit: true,
		}));

		const key = ref('user:acct:notes');
		const result = await renderScrollKeeper(key);
		const scrollContainer = result.getByTestId('scroll-container');
		const scrollTo = installScrollGeometry(scrollContainer, {
			scrollTop: 100,
			anchorTops: {
				'note-1': 160,
				'note-2': 260,
				'note-3': 360,
			},
		});

		emitRouteChange('/notes/note-2', '/timeline');
		await nextTick();
		await vi.runOnlyPendingTimersAsync();
		assert.equal(scrollTo.mock.calls.length, 0);

		key.value = 'user:user-id:notes';
		await nextTick();
		await vi.runOnlyPendingTimersAsync();

		assert.equal(scrollContainer.scrollTop, 240);
		assert.deepEqual(scrollTo.mock.calls[0]?.[0], {
			top: 240,
			behavior: 'instant',
		});
	});

	test('waits for scroll range before using the scrollTop fallback', async () => {
		const storageKey = 'sharkey:scroll-position:account-a:plain%3Afeed';
		window.sessionStorage.setItem(storageKey, JSON.stringify({
			anchorId: null,
			anchorTop: null,
			scrollTop: 180,
			updatedAt: Date.now(),
			restoreOnNextVisit: true,
		}));

		const result = await renderScrollKeeper('plain:feed', false);
		const scrollContainer = result.getByTestId('scroll-container');
		const metrics = {
			scrollHeight: 200,
			clientHeight: 100,
		};
		installScrollRange(scrollContainer, metrics);
		const scrollTo = installScrollGeometry(scrollContainer, {
			scrollTop: 0,
			anchorTops: {},
		});

		emitRouteChange('/notes/note-2', '/timeline');
		await nextTick();
		await vi.advanceTimersByTimeAsync(0);
		assert.equal(scrollTo.mock.calls.length, 0);

		metrics.scrollHeight = 360;
		await vi.advanceTimersByTimeAsync(50);

		assert.equal(scrollContainer.scrollTop, 180);
		assert.deepEqual(scrollTo.mock.calls[0]?.[0], {
			top: 180,
			behavior: 'instant',
		});
	});

	test('keeps mobile feed surfaces cached when returning from a note page', () => {
		const uncachedRoutesLine = routerViewSource.match(/const UNCACHED_ROUTES = [^\n]+/)?.[0] ?? '';

		assert.match(routerViewSource, /Feed-like pages must stay cached/);
		assert.notMatch(uncachedRoutesLine, /['"]\/['"]/);
		assert.notMatch(uncachedRoutesLine, /['"]\/explore['"]/);
		assert.notMatch(uncachedRoutesLine, /['"]\/search['"]/);
		assert.match(routerViewSource, /<KeepAlive v-if="isCacheable" :max="prefer\.s\.numberOfPageCache">/);
		assert.match(pageWithHeaderSource, /scrollKey\?: string;/);
		assert.match(pageWithHeaderSource, /const defaultScrollKey = router\.getCurrentFullPath\(\);/);
		assert.match(pageWithHeaderSource, /const scrollKey = computed\(\(\) => props\.scrollKey \?\? defaultScrollKey\);/);
		assert.match(pageWithHeaderSource, /useScrollPositionKeeper\(rootEl, \{ reversed: props\.reversed, key: scrollKey \}\);/);
	});

	test('isolates stored feed anchors by route, timeline type, and filters', () => {
		assert.include(homeTimelinePageSource, ':scrollKey="timelineScrollKey"');
		assert.include(homeTimelinePageSource, 'const timelineScrollKey = computed(() => `timeline:${router.getCurrentFullPath()}:${timelineKey.value}`);');
		assert.include(homeTimelinePageSource, 'categoryHashtag.value ?? \'__all__\'');
		assert.include(homeTimelinePageSource, 'withReplies.value');
		assert.include(homeTimelinePageSource, 'withSensitive.value');

		assert.include(channelPageSource, ':scrollKey="channelScrollKey"');
		assert.include(channelPageSource, 'const channelScrollKey = computed(() => `channel:${props.channelId}:${tab.value}:${timelineKey.value}`);');

		assert.include(userListTimelinePageSource, ':scrollKey="listScrollKey"');
		assert.include(userListTimelinePageSource, 'const listScrollKey = computed(() => `user-list:${props.listId}:${withRenotes.value}:${onlyFiles.value}`);');

		assert.include(antennaTimelinePageSource, ':scrollKey="antennaScrollKey"');
		assert.include(antennaTimelinePageSource, 'const antennaScrollKey = computed(() => `antenna:${props.antennaId}`);');

		assert.include(userPageSource, ':scrollKey="userScrollKey"');
		assert.include(userPageSource, 'const userScrollKey = computed(() => `user:${user.value?.id ?? props.acct}:${tab.value}`);');

		assert.include(explorePageSource, ':scrollKey="exploreScrollKey"');
		assert.include(explorePageSource, 'const exploreScrollKey = computed(() => `explore:${tab.value}:${exploreScope.value}:${viewMode.value}:${submittedQuery.value || \'__recommended__\'}`);');
		assert.match(explorePageSource, /<DynamicNote v-for="note in (noteResults|activeNotes)"[\s\S]*:data-scroll-anchor="note\.id"/);

		assert.include(tagPageSource, ':scrollKey="`tag:${tag}`"');
		assert.include(searchPageSource, ':scrollKey="`search:${tab}:${query}:${origin}:${userId ?? \'\'}:${username ?? \'\'}:${host ?? \'\'}`"');
		assert.include(followingFeedPageSource, 'const feedScrollKey = computed(() => `following-feed:list:${userList.value}:${withNonPublic.value}:${withQuotes.value}:${withBots.value}:${withReplies.value}:${onlyFiles.value}`);');
		assert.include(followingFeedPageSource, 'const userScrollKey = computed(() => selectedUserId.value == null ? null : `following-feed:user:${selectedUserId.value}:${userList.value}:${withNonPublic.value}:${withQuotes.value}:${withBots.value}:${withReplies.value}:${onlyFiles.value}`);');
		assert.include(followingRecentNotesSource, ':data-scroll-anchor="note.id"');
	});

	test('clears frontend cache without forcing a full reload to the top', () => {
		assert.match(clearCacheSource, /export function clearCache\(\): Promise<void>/);
		assert.match(clearCacheSource, /os\.promiseDialog/);
		assert.match(clearCacheSource, /window\.caches\.keys\(\)/);
		assert.notMatch(clearCacheSource, /unisonReload/);
		assert.notMatch(clearCacheSource, /window\.location\.(reload|href|replace)/);
	});

	test('bounds retained timeline items and restores the visible anchor after pagination trimming', () => {
		assert.match(timelineSource, /:displayLimit="TIMELINE_DISPLAY_LIMIT"/);
		assert.match(timelineSource, /const TIMELINE_DISPLAY_LIMIT = 160;/);
		assert.match(paginationSource, /function retainedItemsLimit\(\): number/);
		assert.match(paginationSource, /function limitItemEntries\(entries: \[string, MisskeyEntity\]\[], side: ItemRetentionSide\): MisskeyEntityMap/);
		assert.match(paginationSource, /function captureVisibleScrollAnchor\(\): ScrollAnchorSnapshot \| null/);
		assert.match(paginationSource, /function restoreVisibleScrollAnchor\(snapshot: ScrollAnchorSnapshot \| null\): void/);
		assert.match(paginationSource, /async function appendItemsWithLimit\(newItems: MisskeyEntity\[], retentionSide: ItemRetentionSide\): Promise<void>/);
		assert.match(paginationSource, /items\.value = limitItemEntries\(\[\.\.\.Array\.from\(items\.value\), \.\.\.arrayToEntries\(newItems\)\], retentionSide\);/);
		assert.match(paginationSource, /await nextTick\(\);[\s\S]*restoreVisibleScrollAnchor\(anchor\);/);
	});
});
