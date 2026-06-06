/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Directive } from 'vue';
import { prefer } from '@/preferences.js';

type ClickAnimeState = {
	target: Element;
	onMousedown: () => void;
	onClick: () => void;
	onAnimationEnd: () => void;
};

const states = new WeakMap<HTMLElement, ClickAnimeState>();

export default {
	mounted(el: HTMLElement) {
		if (!prefer.s.animation) return;

		const target = el.children[0];

		if (target == null) return;

		target.classList.add('_anime_bounce_standBy');

		const onMousedown = () => {
			target.classList.remove('_anime_bounce');

			target.classList.add('_anime_bounce_standBy');
			target.classList.add('_anime_bounce_ready');

			target.addEventListener('mouseleave', () => {
				target.classList.remove('_anime_bounce_ready');
			}, { once: true });
		};

		const onClick = () => {
			target.classList.add('_anime_bounce');
			target.classList.remove('_anime_bounce_ready');
		};

		const onAnimationEnd = () => {
			target.classList.remove('_anime_bounce');
			target.classList.add('_anime_bounce_standBy');
		};

		el.addEventListener('mousedown', onMousedown);
		el.addEventListener('click', onClick);
		el.addEventListener('animationend', onAnimationEnd);
		states.set(el, { target, onMousedown, onClick, onAnimationEnd });
	},

	unmounted(el: HTMLElement) {
		const state = states.get(el);
		if (!state) return;

		el.removeEventListener('mousedown', state.onMousedown);
		el.removeEventListener('click', state.onClick);
		el.removeEventListener('animationend', state.onAnimationEnd);
		state.target.classList.remove('_anime_bounce', '_anime_bounce_standBy', '_anime_bounce_ready');
		states.delete(el);
	},
} as Directive;
