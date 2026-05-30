/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

type RecommendationEvent = Misskey.Endpoints['notes/recommendation-feedback']['req']['event'];

const MIN_EVENT_INTERVAL = 1000 * 45;
const MIN_IMPRESSION_INTERVAL = 1000 * 60 * 60 * 6;
const MIN_DWELL_MS = 1600;
const lastSentAt = new Map<string, number>();

export function sendRecommendationFeedback(noteId: string, event: RecommendationEvent, dwellMs?: number): void {
	const key = `${noteId}:${event}`;
	const now = Date.now();
	if ((lastSentAt.get(key) ?? 0) + MIN_EVENT_INTERVAL > now) return;
	lastSentAt.set(key, now);

	misskeyApi('notes/recommendation-feedback', {
		noteId,
		event,
		dwellMs,
	}).catch(() => {});
}

export function setupRecommendationVisibilityFeedback(noteId: string, target: () => HTMLElement | null | undefined): () => void {
	let visibleSince: number | null = null;
	let impressionSent = false;
	let dwellSent = false;
	let observer: IntersectionObserver | null = null;

	function sendDwell(): void {
		if (visibleSince == null || dwellSent) return;
		const dwellMs = Date.now() - visibleSince;
		if (dwellMs < MIN_DWELL_MS) return;
		dwellSent = true;
		sendRecommendationFeedback(noteId, 'dwell', dwellMs);
	}

	if (!('IntersectionObserver' in window)) return () => {};

	window.setTimeout(() => {
		const el = target();
		if (el == null) return;

		observer = new IntersectionObserver(entries => {
			const entry = entries[0];
			if (entry == null) return;

			if (entry.isIntersecting && entry.intersectionRatio >= 0.55) {
				visibleSince ??= Date.now();
				if (!impressionSent) {
					impressionSent = true;
					const key = `impression:${noteId}`;
					const now = Date.now();
					if ((lastSentAt.get(key) ?? 0) + MIN_IMPRESSION_INTERVAL <= now) {
						lastSentAt.set(key, now);
						misskeyApi('notes/recommendation-feedback', {
							noteId,
							event: 'impression',
						}).catch(() => {});
					}
				}
			} else {
				sendDwell();
				visibleSince = null;
			}
		}, { threshold: [0, 0.55, 0.8] });
		observer.observe(el);
	}, 0);

	return () => {
		sendDwell();
		observer?.disconnect();
	};
}
