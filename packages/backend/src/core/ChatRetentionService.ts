/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, type BeforeApplicationShutdown, type OnApplicationBootstrap } from '@nestjs/common';
import { IsNull, Not } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { ChatRoomsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { TimeService, type TimerHandle } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { ChatService, CHAT_ROOM_RETENTION_BATCH_SIZE } from './ChatService.js';
import { IdService } from './IdService.js';
import { AppLockService } from './AppLockService.js';

const CHAT_RETENTION_INTERVAL = 1000 * 60 * 60;
const CHAT_RETENTION_LOCK_TIMEOUT = 1000 * 60 * 55;

@Injectable()
export class ChatRetentionService implements OnApplicationBootstrap, BeforeApplicationShutdown {
	private timerId: TimerHandle | null = null;
	private running = false;

	constructor(
		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		private chatService: ChatService,
		private idService: IdService,
		private appLockService: AppLockService,
		private readonly timeService: TimeService,
		private readonly envService: EnvService,
	) {
	}

	@bindThis
	public onApplicationBootstrap(): void {
		if (this.envService.env.NODE_ENV === 'test') return;

		this.timerId = this.timeService.startTimer(() => {
			this.run().catch(err => {
				console.error('Failed to prune old chat messages:', err);
			});
		}, CHAT_RETENTION_INTERVAL, { repeated: true });

		this.run().catch(err => {
			console.error('Failed to prune old chat messages:', err);
		});
	}

	@bindThis
	public beforeApplicationShutdown(): void {
		this.timeService.stopTimer(this.timerId);
		this.timerId = null;
	}

	@bindThis
	public async run(): Promise<void> {
		if (this.running) return;
		this.running = true;
		const unlock = await this.appLockService.tryGetChatRetentionLock(CHAT_RETENTION_LOCK_TIMEOUT);
		if (unlock == null) {
			this.running = false;
			return;
		}
		try {
			const rooms = await this.chatRoomsRepository.findBy({
				messageRetentionDays: Not(IsNull()),
			});

			for (const room of rooms) {
				if (room.messageRetentionDays == null) continue;

				const cutoffTime = this.timeService.now - (room.messageRetentionDays * 24 * 60 * 60 * 1000);
				const cutoffId = this.idService.gen(cutoffTime);
				await this.chatService.pruneRoomMessages(room, cutoffId, CHAT_ROOM_RETENTION_BATCH_SIZE);
			}
		} finally {
			await unlock();
			this.running = false;
		}
	}
}
