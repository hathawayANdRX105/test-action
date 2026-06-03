/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type ChatScrollContainerMetrics = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>;
export type ChatTimelineSortableMessage = {
	id: string;
	createdAt: string;
};

export function getChatScrollMetrics(scrollContainer: ChatScrollContainerMetrics): {
	maxScrollTop: number;
	scrollTop: number;
	latestDistance: number;
	historyDistance: number;
} {
	const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
	const scrollTop = Math.min(maxScrollTop, Math.max(0, scrollContainer.scrollTop));

	return {
		maxScrollTop,
		scrollTop,
		latestDistance: maxScrollTop - scrollTop,
		historyDistance: scrollTop,
	};
}

export function sortChatMessagesForTimeline<T extends ChatTimelineSortableMessage>(items: T[]): T[] {
	return [...items].sort((a, b) => {
		const aTime = Date.parse(a.createdAt);
		const bTime = Date.parse(b.createdAt);
		const normalizedATime = Number.isNaN(aTime) ? 0 : aTime;
		const normalizedBTime = Number.isNaN(bTime) ? 0 : bTime;

		if (normalizedATime !== normalizedBTime) {
			return normalizedATime > normalizedBTime ? -1 : 1;
		}

		return a.id > b.id ? -1 : a.id < b.id ? 1 : 0;
	});
}

export class ChatAutoScrollState {
	private userScrollLockUntil = 0;
	private detachedFromLatest = false;
	private readonly latestThreshold: number;
	private readonly interactionLockMs: number;
	private readonly now: () => number;

	constructor(options: {
		latestThreshold: number;
		interactionLockMs: number;
		now?: () => number;
	}) {
		this.latestThreshold = options.latestThreshold;
		this.interactionLockMs = options.interactionLockMs;
		this.now = options.now ?? (() => Date.now());
	}

	public markUserInteraction(): void {
		this.userScrollLockUntil = this.now() + this.interactionLockMs;
	}

	public markLatest(): void {
		this.userScrollLockUntil = 0;
		this.detachedFromLatest = false;
	}

	public updateFromScroll(latestDistance: number): void {
		this.detachedFromLatest = latestDistance > this.latestThreshold;
	}

	public isUserInteracting(): boolean {
		return this.now() < this.userScrollLockUntil;
	}

	public canAutoFollowLatest(latestDistance: number): boolean {
		return latestDistance <= this.latestThreshold && !this.detachedFromLatest && !this.isUserInteracting();
	}

	public shouldStickToLatest(latestDistance: number, stickThreshold: number): boolean {
		return latestDistance <= stickThreshold && !this.detachedFromLatest && !this.isUserInteracting();
	}
}
