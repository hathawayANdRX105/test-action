/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { throttle } from 'throttle-debounce';
import { nextTick, onActivated, onDeactivated, onUnmounted, watch } from 'vue';
import type { Ref } from 'vue';

// note render skippingがオンだとズレるため、遷移直前にスクロール範囲に表示されているdata-scroll-anchor要素を特定して、復元時に当該要素までスクロールするようにする

// TODO: data-scroll-anchor がひとつも存在しない場合、または手動で useAnchor みたいなフラグをfalseで呼ばれた場合、単純にスクロール位置を使用する処理にフォールバックするようにする

export function useScrollPositionKeeper(scrollContainerRef: Ref<HTMLElement | null | undefined>, options?: {
	reversed?: boolean;
}): void {
	let anchorId: string | null = null;
	let captureAnchor: (() => void) | null = null;
	let ready = true;
	const captureOptions: AddEventListenerOptions = { capture: true, passive: true };

	watch(scrollContainerRef, (el) => {
		if (!el) return;

		const onScroll = () => {
			if (!el) return;
			if (!ready) return;
			if (!el.isConnected) return;

			const scrollContainerRect = el.getBoundingClientRect();
			if (scrollContainerRect.height <= 0) return;
			const viewPosition = scrollContainerRect.top + (scrollContainerRect.height / 2);

			const anchorEls = el.querySelectorAll('[data-scroll-anchor]');
			for (let i = anchorEls.length - 1; i > -1; i--) { // 下から見た方が速い
				const anchorEl = anchorEls[i] as HTMLElement;
				const anchorRect = anchorEl.getBoundingClientRect();
				const anchorTop = anchorRect.top;
				const anchorBottom = anchorRect.bottom;
				if (anchorTop <= viewPosition && anchorBottom >= viewPosition) {
					anchorId = anchorEl.getAttribute('data-scroll-anchor');
					break;
				}
			}
		};

		// ほんとはscrollイベントじゃなくてonBeforeDeactivatedでやりたい
		// https://github.com/vuejs/vue/issues/9454
		// https://github.com/vuejs/rfcs/pull/284
		const throttledOnScroll = throttle(1000, onScroll);
		el.addEventListener('scroll', throttledOnScroll, { passive: true });
		el.addEventListener('pointerdown', onScroll, captureOptions);
		el.addEventListener('click', onScroll, captureOptions);
		captureAnchor = onScroll;
		onScroll();

		onUnmounted(() => {
			el.removeEventListener('scroll', throttledOnScroll);
			el.removeEventListener('pointerdown', onScroll, captureOptions);
			el.removeEventListener('click', onScroll, captureOptions);
			if (captureAnchor === onScroll) captureAnchor = null;
		});
	}, {
		immediate: true,
	});

	const restore = () => {
		if (!anchorId) return;
		const scrollContainer = scrollContainerRef.value;
		if (!scrollContainer) return;
		const scrollAnchorEl = scrollContainer.querySelector(`[data-scroll-anchor="${anchorId}"]`);
		if (!scrollAnchorEl) return;
		const isReversed = options?.reversed || scrollContainer.classList.contains('_pageScrollableReversed');
		scrollAnchorEl.scrollIntoView({
			behavior: 'instant',
			block: isReversed ? 'nearest' : 'center',
			inline: 'center',
		});
	};

	onDeactivated(() => {
		captureAnchor?.();
		ready = false;
	});

	onActivated(() => {
		restore();
		nextTick(() => {
			restore();
			window.setTimeout(() => {
				restore();

				ready = true;
			}, 100);
		});
	});
}
