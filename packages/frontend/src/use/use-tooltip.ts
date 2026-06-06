/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref, watch, onUnmounted } from 'vue';
import type { Ref } from 'vue';

export function useTooltip(
	elRef: Ref<HTMLElement | { $el: HTMLElement } | null | undefined>,
	onShow: (showing: Ref<boolean>) => void,
	delay = 300,
): void {
	let isHovering = false;

	let timeoutId: number | undefined;
	let boundEl: HTMLElement | undefined;

	let changeShowingState: (() => void) | null;

	let autoHidingTimer: number | undefined;

	const open = () => {
		close();
		if (!isHovering) return;
		if (elRef.value == null) return;
		const el = elRef.value instanceof Element ? elRef.value : elRef.value.$el;
		if (!window.document.body.contains(el)) return; // openしようとしたときに既に元要素がDOMから消えている場合があるため

		const showing = ref(true);
		onShow(showing);
		changeShowingState = () => {
			showing.value = false;
		};

		autoHidingTimer = window.setInterval(() => {
			if (elRef.value == null || !window.document.body.contains(elRef.value instanceof Element ? elRef.value : elRef.value.$el)) {
				if (!isHovering) return;
				isHovering = false;
				window.clearTimeout(timeoutId);
				close();
				window.clearInterval(autoHidingTimer);
			}
		}, 1000);
	};

	const close = () => {
		if (timeoutId != null) {
			window.clearTimeout(timeoutId);
			timeoutId = undefined;
		}
		if (autoHidingTimer != null) {
			window.clearInterval(autoHidingTimer);
			autoHidingTimer = undefined;
		}
		if (changeShowingState != null) {
			changeShowingState();
			changeShowingState = null;
		}
	};

	const onPointerover = (event: PointerEvent) => {
		if (event.pointerType === 'touch') return;
		if (isHovering) return;
		isHovering = true;
		timeoutId = window.setTimeout(open, delay);
	};

	const onMouseleave = () => {
		if (!isHovering) return;
		isHovering = false;
		window.clearTimeout(timeoutId);
		window.clearInterval(autoHidingTimer);
		close();
	};

	const onTouchstart = () => {
		if (isHovering) return;
		isHovering = true;
		timeoutId = window.setTimeout(open, delay);
	};

	const onTouchend = () => {
		if (!isHovering) return;
		isHovering = false;
		window.clearTimeout(timeoutId);
		window.clearInterval(autoHidingTimer);
		close();
	};

	const removeListeners = () => {
		if (!boundEl) return;
		boundEl.removeEventListener('pointerover', onPointerover);
		boundEl.removeEventListener('mouseleave', onMouseleave);
		boundEl.removeEventListener('touchstart', onTouchstart);
		boundEl.removeEventListener('touchend', onTouchend);
		boundEl.removeEventListener('click', close);
		boundEl = undefined;
	};

	const stop = watch(elRef, () => {
		removeListeners();
		if (elRef.value) {
			const el = elRef.value instanceof Element ? elRef.value : elRef.value.$el;
			boundEl = el;
			boundEl.addEventListener('pointerover', onPointerover, { passive: true });
			boundEl.addEventListener('mouseleave', onMouseleave, { passive: true });
			boundEl.addEventListener('touchstart', onTouchstart, { passive: true });
			boundEl.addEventListener('touchend', onTouchend, { passive: true });
			boundEl.addEventListener('click', close, { passive: true });
		}
	}, {
		immediate: true,
		flush: 'post',
	});

	onUnmounted(() => {
		stop();
		removeListeners();
		close();
	});
}
