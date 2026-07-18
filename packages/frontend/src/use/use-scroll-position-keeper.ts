/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import { nextTick, onActivated, onBeforeUnmount, onDeactivated, onUnmounted, toValue, watch } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { useRouter } from '@/router.js';
import type { Router } from '@/router.js';
import { $i } from '@/i.js';

type ScrollPositionSnapshot = {
	anchorId: string | null;
	anchorTop: number | null;
	scrollTop: number;
	updatedAt: number;
	restoreOnNextVisit: boolean;
};

type ScrollAnchorSnapshot = {
	id: string;
	top: number;
};

const STORAGE_PREFIX = 'sharkey:scroll-position:';
const SNAPSHOT_TTL = 1000 * 60 * 30;
const RESTORE_RETRY_DELAYS = [0, 50, 150, 400, 900] as const;
const RESTORE_OBSERVER_TIMEOUT = 2000;
const lastRouteTransitions = new WeakMap<Router, {
	beforeFullPath: string;
	fullPath: string;
}>();
const trackedRouters = new WeakSet<Router>();

function isNotePath(path: string): boolean {
	return /^\/notes\/[^/?#]+/.test(path);
}

function ensureRouteTransitionTracking(router: Router): void {
	if (trackedRouters.has(router)) return;
	trackedRouters.add(router);

	router.addListener('change', ({ beforeFullPath, fullPath }) => {
		lastRouteTransitions.set(router, { beforeFullPath, fullPath });
	});
}

function wasLatestRouteChangeFromNoteTo(router: Router, fullPath: string): boolean {
	const transition = lastRouteTransitions.get(router);
	return transition?.fullPath === fullPath && isNotePath(transition.beforeFullPath);
}

function makeStorageKey(key: string): string {
	const accountKey = $i?.id ?? 'guest';
	return `${STORAGE_PREFIX}${encodeURIComponent(accountKey)}:${encodeURIComponent(key)}`;
}

function readSnapshot(storageKey: string | null): ScrollPositionSnapshot | null {
	if (storageKey == null) return null;

	try {
		const raw = window.sessionStorage.getItem(storageKey);
		if (raw == null) return null;

		const snapshot = JSON.parse(raw) as Partial<ScrollPositionSnapshot>;
		if (typeof snapshot.scrollTop !== 'number') return null;

		const updatedAt = typeof snapshot.updatedAt === 'number' ? snapshot.updatedAt : 0;
		if (Date.now() - updatedAt > SNAPSHOT_TTL) {
			window.sessionStorage.removeItem(storageKey);
			return null;
		}

		return {
			anchorId: typeof snapshot.anchorId === 'string' ? snapshot.anchorId : null,
			anchorTop: typeof snapshot.anchorTop === 'number' ? snapshot.anchorTop : null,
			scrollTop: snapshot.scrollTop,
			updatedAt,
			restoreOnNextVisit: snapshot.restoreOnNextVisit === true,
		};
	} catch {
		return null;
	}
}

function writeSnapshot(storageKey: string | null, snapshot: ScrollPositionSnapshot): void {
	if (storageKey == null) return;

	try {
		window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
	} catch {
		// 隐私模式或内嵌环境可能无法使用 sessionStorage。
	}
}

function escapeScrollAnchorId(id: string): string {
	if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
		return CSS.escape(id);
	}

	return id.replace(/["\\]/g, '\\$&');
}

function findScrollAnchor(scrollContainer: HTMLElement, id: string): HTMLElement | null {
	return scrollContainer.querySelector<HTMLElement>(`[data-scroll-anchor="${escapeScrollAnchorId(id)}"]`);
}

function captureVisibleScrollAnchor(scrollContainer: HTMLElement): ScrollAnchorSnapshot | null {
	const scrollContainerRect = scrollContainer.getBoundingClientRect();
	if (scrollContainerRect.height <= 0) return null;

	const containerTop = scrollContainerRect.top;
	const containerBottom = scrollContainerRect.bottom;
	const viewPosition = containerTop + (scrollContainerRect.height / 2);
	let fallback: (ScrollAnchorSnapshot & { distance: number }) | null = null;

	for (const anchorEl of scrollContainer.querySelectorAll<HTMLElement>('[data-scroll-anchor]')) {
		const id = anchorEl.getAttribute('data-scroll-anchor');
		if (id == null) continue;

		const anchorRect = anchorEl.getBoundingClientRect();
		if (anchorRect.bottom < containerTop || anchorRect.top > containerBottom) continue;

		const top = anchorRect.top - containerTop;
		if (anchorRect.top <= viewPosition && anchorRect.bottom >= viewPosition) {
			return { id, top };
		}

		const distance = Math.min(Math.abs(anchorRect.top - viewPosition), Math.abs(anchorRect.bottom - viewPosition));
		if (fallback == null || distance < fallback.distance) {
			fallback = { id, top, distance };
		}
	}

	return fallback == null ? null : {
		id: fallback.id,
		top: fallback.top,
	};
}

export function useScrollPositionKeeper(scrollContainerRef: Ref<HTMLElement | null | undefined>, options?: {
	reversed?: boolean;
	key?: MaybeRefOrGetter<string | null | undefined>;
}): void {
	const router = useRouter();
	ensureRouteTransitionTracking(router);
	const routeFullPath = router.getCurrentFullPath();
	let latestSnapshot: ScrollPositionSnapshot | null = null;
	let latestSnapshotStorageKey: string | null = null;
	let captureAnchor: (() => void) | null = null;
	let ready = true;
	let restoreArmed = false;
	let persistForNoteReturn = false;
	let restoreObserver: MutationObserver | null = null;
	let restoreObserverTimer: number | null = null;
	const restoreTimers = new Set<number>();
	const captureOptions: AddEventListenerOptions = { capture: true, passive: true };

	function getStorageKey(): string | null {
		const key = options?.key == null ? null : toValue(options.key);
		return key == null || key === '' ? null : makeStorageKey(key);
	}

	function loadSnapshot(): ScrollPositionSnapshot | null {
		const storageKey = getStorageKey();
		const snapshot = readSnapshot(storageKey) ?? (latestSnapshotStorageKey === storageKey ? latestSnapshot : null);
		if (snapshot == null) return null;
		if (storageKey == null) return snapshot;
		return restoreArmed || (snapshot.restoreOnNextVisit && wasLatestRouteChangeFromNoteTo(router, routeFullPath)) ? snapshot : null;
	}

	function clearRestoreTimers(): void {
		for (const timer of restoreTimers) {
			window.clearTimeout(timer);
		}
		restoreTimers.clear();

		if (restoreObserverTimer != null) {
			window.clearTimeout(restoreObserverTimer);
			restoreObserverTimer = null;
		}

		restoreObserver?.disconnect();
		restoreObserver = null;
	}

	function rememberSnapshot(scrollContainer: HTMLElement): void {
		if (!ready) return;
		if (!scrollContainer.isConnected) return;

		const anchor = captureVisibleScrollAnchor(scrollContainer);
		const snapshot: ScrollPositionSnapshot = {
			anchorId: anchor?.id ?? null,
			anchorTop: anchor?.top ?? null,
			scrollTop: scrollContainer.scrollTop,
			updatedAt: Date.now(),
			restoreOnNextVisit: false,
		};
		const storageKey = getStorageKey();
		latestSnapshot = snapshot;
		latestSnapshotStorageKey = storageKey;
		writeSnapshot(storageKey, snapshot);
	}

	function writeLatestSnapshot(restoreOnNextVisit: boolean): void {
		const storageKey = getStorageKey();
		if (latestSnapshot == null) return;
		latestSnapshot = {
			...latestSnapshot,
			updatedAt: Date.now(),
			restoreOnNextVisit,
		};
		latestSnapshotStorageKey = storageKey;
		writeSnapshot(storageKey, latestSnapshot);
	}

	function restoreSnapshot(snapshot: ScrollPositionSnapshot): boolean {
		const scrollContainer = scrollContainerRef.value;
		if (!scrollContainer) return false;

		if (snapshot.anchorId != null) {
			const scrollAnchorEl = findScrollAnchor(scrollContainer, snapshot.anchorId);
			if (scrollAnchorEl == null) return false;

			if (snapshot.anchorTop != null) {
				const scrollContainerRect = scrollContainer.getBoundingClientRect();
				const anchorTop = scrollAnchorEl.getBoundingClientRect().top - scrollContainerRect.top;
				const delta = anchorTop - snapshot.anchorTop;
				if (Math.abs(delta) >= 0.5) {
					scrollContainer.scrollTo({
						top: scrollContainer.scrollTop + delta,
						behavior: 'instant',
					});
				}
			} else {
				const isReversed = options?.reversed || scrollContainer.classList.contains('_pageScrollableReversed');
				scrollAnchorEl.scrollIntoView({
					behavior: 'instant',
					block: isReversed ? 'nearest' : 'center',
					inline: 'center',
				});
			}

			return true;
		}

		scrollContainer.scrollTo({
			top: snapshot.scrollTop,
			behavior: 'instant',
		});
		return true;
	}

	function scheduleRestore(): void {
		clearRestoreTimers();
		const snapshot = loadSnapshot();
		if (snapshot == null) {
			ready = true;
			restoreArmed = false;
			return;
		}

		ready = false;
		let restored = false;

		const finish = () => {
			clearRestoreTimers();
			ready = true;
			restoreArmed = false;
			writeLatestSnapshot(false);
		};
		const tryRestore = () => {
			if (restored) return true;
			restored = restoreSnapshot(snapshot);
			if (restored) finish();
			return restored;
		};

		for (const [i, delay] of RESTORE_RETRY_DELAYS.entries()) {
			const timer = window.setTimeout(() => {
				restoreTimers.delete(timer);
				if (tryRestore()) return;
				if (i === RESTORE_RETRY_DELAYS.length - 1 && restoreObserver == null) finish();
			}, delay);
			restoreTimers.add(timer);
		}

		const scrollContainer = scrollContainerRef.value;
		if (scrollContainer != null && snapshot.anchorId != null && typeof MutationObserver !== 'undefined') {
			restoreObserver = new MutationObserver(() => {
				tryRestore();
			});
			restoreObserver.observe(scrollContainer, {
				childList: true,
				subtree: true,
			});
			restoreObserverTimer = window.setTimeout(finish, RESTORE_OBSERVER_TIMEOUT);
		}
	}

	router.useListener('change', ({ beforeFullPath, fullPath }) => {
		if (beforeFullPath === routeFullPath && isNotePath(fullPath)) {
			captureAnchor?.();
			writeLatestSnapshot(true);
			persistForNoteReturn = true;
			return;
		}

		if (fullPath === routeFullPath && isNotePath(beforeFullPath)) {
			restoreArmed = true;
		}
	});

	watch(scrollContainerRef, (el, _oldEl, onCleanup) => {
		if (!el) return;

		const onScroll = () => {
			rememberSnapshot(el);
		};

		const throttledOnScroll = throttle(1000, onScroll);
		el.addEventListener('scroll', throttledOnScroll, { passive: true });
		el.addEventListener('pointerdown', onScroll, captureOptions);
		el.addEventListener('click', onScroll, captureOptions);
		captureAnchor = onScroll;
		const storageKey = getStorageKey();
		const storedSnapshot = readSnapshot(storageKey);
		if (storedSnapshot == null) {
			onScroll();
		} else {
			latestSnapshot = storedSnapshot;
			latestSnapshotStorageKey = storageKey;
		}
		nextTick(scheduleRestore);

		onCleanup(() => {
			el.removeEventListener('scroll', throttledOnScroll);
			el.removeEventListener('pointerdown', onScroll, captureOptions);
			el.removeEventListener('click', onScroll, captureOptions);
			if (captureAnchor === onScroll) captureAnchor = null;
		});
	}, {
		immediate: true,
	});

	onDeactivated(() => {
		captureAnchor?.();
		writeLatestSnapshot(persistForNoteReturn);
		persistForNoteReturn = false;
		clearRestoreTimers();
		ready = false;
	});

	onActivated(() => {
		scheduleRestore();
		nextTick(scheduleRestore);
	});

	onBeforeUnmount(() => {
		captureAnchor?.();
		if (persistForNoteReturn) {
			writeLatestSnapshot(true);
		}
	});

	onUnmounted(() => {
		clearRestoreTimers();
	});
}
