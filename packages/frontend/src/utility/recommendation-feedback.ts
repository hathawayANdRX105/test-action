/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { misskeyApi } from '@/utility/misskey-api.js';

type RecommendationEvent = Misskey.Endpoints['notes/recommendation-feedback']['req']['event'];

const MIN_EVENT_INTERVAL = 1000 * 45;
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
