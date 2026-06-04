/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const STREAM_CHAT_READ_RECEIPT_MIN_INTERVAL_MS = 2000;

type ReadReceiptTimer = ReturnType<typeof setTimeout>;

export class ChatReadReceiptBatcher {
	private pending = false;
	private timer: ReadReceiptTimer | null = null;
	private lastRunAt: number;
	private readonly minIntervalMs: number;
	private readonly run: () => void | Promise<void>;
	private readonly onError: (err: unknown) => void;
	private readonly now: () => number;
	private readonly setTimer: (callback: () => void, delay: number) => ReadReceiptTimer;
	private readonly clearTimer: (timer: ReadReceiptTimer) => void;

	constructor(options: {
		minIntervalMs: number;
		run: () => void | Promise<void>;
		onError?: (err: unknown) => void;
		now?: () => number;
		setTimer?: (callback: () => void, delay: number) => ReadReceiptTimer;
		clearTimer?: (timer: ReadReceiptTimer) => void;
	}) {
		this.minIntervalMs = options.minIntervalMs;
		this.run = options.run;
		this.onError = options.onError ?? (() => {});
		this.now = options.now ?? (() => Date.now());
		this.setTimer = options.setTimer ?? ((callback, delay) => setTimeout(callback, delay));
		this.clearTimer = options.clearTimer ?? (timer => clearTimeout(timer));
		this.lastRunAt = this.now() - this.minIntervalMs;
	}

	public queue(): void {
		this.pending = true;
		this.schedule();
	}

	public flush(): boolean {
		if (this.timer != null) {
			this.clearTimer(this.timer);
			this.timer = null;
		}

		if (!this.pending) return false;

		this.pending = false;
		this.lastRunAt = this.now();
		void Promise.resolve().then(this.run).catch(this.onError);
		return true;
	}

	public cancel(): void {
		if (this.timer != null) {
			this.clearTimer(this.timer);
			this.timer = null;
		}

		this.pending = false;
	}

	private schedule(): void {
		if (!this.pending || this.timer != null) return;

		const delay = Math.max(0, this.minIntervalMs - (this.now() - this.lastRunAt));
		if (delay === 0) {
			this.flush();
			return;
		}

		this.timer = this.setTimer(() => {
			this.timer = null;
			this.flush();
		}, delay);
		this.timer.unref?.();
	}
}
