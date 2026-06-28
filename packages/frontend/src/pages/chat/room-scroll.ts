/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type ChatScrollContainerMetrics = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>;
export type ChatTimelineSortableMessage = {
	id: string;
	createdAt: string;
};
export type ChatTimelineIdentifiableMessage = {
	id: string;
};

export type ChatTimelineWindowKeep = 'newest' | 'oldest';
export type ChatTimelineWindowResult<T> = {
	items: T[];
	droppedNewest: boolean;
	droppedOldest: boolean;
};

function limitChatTimelineWindow<T>(items: T[], limit: number | undefined, keep: ChatTimelineWindowKeep | undefined): ChatTimelineWindowResult<T> {
	if (limit == null || items.length <= limit) {
		return {
			items,
			droppedNewest: false,
			droppedOldest: false,
		};
	}

	if (keep === 'oldest') {
		return {
			items: items.slice(-limit),
			droppedNewest: true,
			droppedOldest: false,
		};
	}

	return {
		items: items.slice(0, limit),
		droppedNewest: false,
		droppedOldest: true,
	};
}

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

export function isNearChatLatest(scrollContainer: ChatScrollContainerMetrics, threshold: number): boolean {
	return getChatScrollMetrics(scrollContainer).latestDistance <= threshold;
}

export type ChatVerticalRect = Pick<DOMRectReadOnly, 'top' | 'bottom'>;

export function isChatMessageVisibleAtLatestEdge(containerRect: ChatVerticalRect, messageRect: ChatVerticalRect, threshold: number): boolean {
	return messageRect.top <= containerRect.bottom &&
		messageRect.bottom >= containerRect.top &&
		messageRect.bottom <= containerRect.bottom + threshold;
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

export function mergeChatMessagesWithWindowResult<T extends ChatTimelineSortableMessage>(
	current: T[],
	incoming: T[],
	options?: {
		limit?: number;
		preserveExistingOrder?: boolean;
		keep?: ChatTimelineWindowKeep;
	},
): ChatTimelineWindowResult<T> {
	const limit = options?.limit;
	const keep = options?.keep;

	if (incoming.length === 0) {
		return limitChatTimelineWindow(current, limit, keep);
	}

	const map = new Map<string, T>();
	for (const message of current) {
		map.set(message.id, message);
	}

	let hasNewMessage = false;
	for (const message of incoming) {
		if (map.get(message.id) !== message) {
			hasNewMessage = true;
		}
		map.set(message.id, message);
	}

	if (!hasNewMessage) {
		return limitChatTimelineWindow(current, options?.limit, options?.keep);
	}

	if (options?.preserveExistingOrder === true) {
		const next = [...current];
		const currentIds = new Set(current.map(message => message.id));
		for (const message of incoming) {
			if (currentIds.has(message.id)) continue;

			if (next.length === 0 || message.id > next[0].id) {
				next.unshift(message);
			} else if (message.id < next[next.length - 1].id) {
				next.push(message);
			} else {
				return limitChatTimelineWindow(sortChatMessagesForTimeline([...map.values()]), limit, keep);
			}
		}

		return limitChatTimelineWindow(next, limit, keep);
	}

	const merged = sortChatMessagesForTimeline([...map.values()]);
	return limitChatTimelineWindow(merged, limit, keep);
}

export function mergeChatMessagesForTimeline<T extends ChatTimelineSortableMessage>(
	current: T[],
	incoming: T[],
	options?: {
		limit?: number;
		preserveExistingOrder?: boolean;
		keep?: ChatTimelineWindowKeep;
	},
): T[] {
	return mergeChatMessagesWithWindowResult(current, incoming, options).items;
}

export function prependChatMessageForTimeline<T extends ChatTimelineSortableMessage>(
	current: T[],
	message: T,
	options?: {
		limit?: number;
	},
): T[] {
	const existingIndex = current.findIndex(item => item.id === message.id);
	if (existingIndex !== -1) {
		if (current[existingIndex] === message) return current;

		const next = [...current];
		next[existingIndex] = message;
		return options?.limit == null || next.length <= options.limit ? next : next.slice(0, options.limit);
	}

	if (current.length === 0 || message.id > current[0].id) {
		const next = [message, ...current];
		return options?.limit == null || next.length <= options.limit ? next : next.slice(0, options.limit);
	}

	return mergeChatMessagesForTimeline(current, [message], options);
}

export function appendDetachedChatMessages<T extends ChatTimelineIdentifiableMessage>(
	buffered: T[],
	incoming: T[],
	visible: ChatTimelineIdentifiableMessage[],
): T[] {
	if (buffered.length === 0 && incoming.length === 0) return buffered;

	const visibleIds = new Set(visible.map(message => message.id));
	const nextIds = new Set<string>();
	const next: T[] = [];

	for (const message of [...buffered, ...incoming]) {
		if (visibleIds.has(message.id) || nextIds.has(message.id)) continue;

		next.push(message);
		nextIds.add(message.id);
	}

	return next;
}

export function findMissingChatMessageIdsInLatestWindow<T extends ChatTimelineIdentifiableMessage>(
	local: T[],
	latestWindow: ChatTimelineIdentifiableMessage[],
	options: {
		limit: number;
		isPending?: (message: T) => boolean;
	},
): Set<string> {
	const missingIds = new Set<string>();
	if (local.length === 0) return missingIds;

	const latestIds = new Set(latestWindow.map(message => message.id));
	const coversAllHistory = latestWindow.length < options.limit;
	const oldestCoveredId = latestWindow.reduce<string | null>((oldestId, message) => {
		if (oldestId == null || message.id < oldestId) return message.id;
		return oldestId;
	}, null);

	for (const message of local) {
		if (options.isPending?.(message) === true) continue;
		if (latestIds.has(message.id)) continue;
		if (coversAllHistory || (oldestCoveredId != null && message.id >= oldestCoveredId)) {
			missingIds.add(message.id);
		}
	}

	return missingIds;
}

type ChatReadReceiptTimer = number;

export class ChatReadReceiptBatcher {
	private pendingMessageId: string | null = null;
	private timer: ChatReadReceiptTimer | null = null;
	private lastSentAt: number;
	private readonly minIntervalMs: number;
	private readonly send: (messageId: string) => void;
	private readonly canSend: () => boolean;
	private readonly now: () => number;
	private readonly setTimer: (callback: () => void, delay: number) => ChatReadReceiptTimer;
	private readonly clearTimer: (timer: ChatReadReceiptTimer) => void;

	constructor(options: {
		minIntervalMs: number;
		send: (messageId: string) => void;
		canSend: () => boolean;
		now?: () => number;
		setTimer?: (callback: () => void, delay: number) => ChatReadReceiptTimer;
		clearTimer?: (timer: ChatReadReceiptTimer) => void;
	}) {
		this.minIntervalMs = options.minIntervalMs;
		this.send = options.send;
		this.canSend = options.canSend;
		this.now = options.now ?? (() => Date.now());
		this.setTimer = options.setTimer ?? ((callback, delay): ChatReadReceiptTimer => window['setTimeout'](callback, delay));
		this.clearTimer = options.clearTimer ?? ((timer): void => {
			window['clearTimeout'](timer);
		});
		this.lastSentAt = this.now() - this.minIntervalMs;
	}

	public queue(messageId: string): void {
		if (this.pendingMessageId == null || messageId > this.pendingMessageId) {
			this.pendingMessageId = messageId;
		}

		this.schedule();
	}

	public flush(options?: { force?: boolean }): boolean {
		if (this.timer != null) {
			this.clearTimer(this.timer);
			this.timer = null;
		}

		if (this.pendingMessageId == null) return false;
		if (options?.force !== true && !this.canSend()) return false;

		const messageId = this.pendingMessageId;
		this.pendingMessageId = null;
		this.lastSentAt = this.now();
		this.send(messageId);
		return true;
	}

	public cancel(): void {
		if (this.timer != null) {
			this.clearTimer(this.timer);
			this.timer = null;
		}

		this.pendingMessageId = null;
	}

	private schedule(): void {
		if (this.pendingMessageId == null || this.timer != null) return;

		const delay = Math.max(0, this.minIntervalMs - (this.now() - this.lastSentAt));
		if (delay === 0) {
			this.flush();
			return;
		}

		this.timer = this.setTimer(() => {
			this.timer = null;
			this.flush();
		}, delay);
	}
}

export class ChatAutoScrollState {
	private userScrollLockUntil = 0;
	private detachedFromLatest = false;
	private wasAtLatest = false;
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
		this.wasAtLatest = true;
	}

	public updateFromScroll(latestDistance: number): void {
		const atLatest = latestDistance <= this.latestThreshold;
		this.wasAtLatest = atLatest;
		this.detachedFromLatest = !atLatest;
	}

	public isUserInteracting(): boolean {
		return this.now() < this.userScrollLockUntil;
	}

	public canAutoFollowLatest(latestDistance: number): boolean {
		return latestDistance <= this.latestThreshold && !this.detachedFromLatest && !this.isUserInteracting();
	}

	public shouldStickToLatest(latestDistance: number, stickThreshold: number): boolean {
		if (this.isUserInteracting()) return false;
		if (latestDistance <= stickThreshold && !this.detachedFromLatest) return true;
		return this.wasAtLatest && latestDistance <= this.latestThreshold && !this.detachedFromLatest;
	}
}
