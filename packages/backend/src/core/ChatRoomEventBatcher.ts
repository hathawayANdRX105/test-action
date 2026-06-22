/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import type * as Redis from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { Packed } from '@/misc/json-schema.js';
import type { MiChatMessage, MiChatRoom } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { ChatRoomShardRouter } from '@/core/ChatRoomShardRouter.js';

// Batcher 合并的高频事件类型(与 GlobalEventService.ChatEventTypes.batch 元素对应)
export type ChatBatchEventEntry =
	| { type: 'message'; body: Packed<'ChatMessageLite'> }
	| { type: 'react'; body: { reaction: string; user?: Packed<'UserLite'>; messageId: MiChatMessage['id'] } }
	| { type: 'unreact'; body: { reaction: string; user?: Packed<'UserLite'>; messageId: MiChatMessage['id'] } };

// 60ms 窗口足够把"短时间内连发"的小事件聚合到一起,又不会让单条消息延迟可感
const FLUSH_WINDOW_MS = 60;

interface RoomBuffer {
	events: ChatBatchEventEntry[];
	timer: NodeJS.Timeout;
}

/**
 * 群聊(chatRoom)的高频事件批合并器。
 * 同一 roomId 在 FLUSH_WINDOW_MS 内的 message/react/unreact 合并成一次 publish,
 * 让 Redis fanout × WS write 的总量在大房间(1500+ 在线)显著降低。
 */
@Injectable()
export class ChatRoomEventBatcher implements OnApplicationShutdown {
	private readonly buffers = new Map<MiChatRoom['id'], RoomBuffer>();

	constructor(
		@Inject(DI.config)
		private readonly config: Config,
		@Inject(DI.redisForPub)
		private readonly redisForPub: Redis.Redis,
		private readonly shardRouter: ChatRoomShardRouter,
	) {}

	@bindThis
	public enqueue(roomId: MiChatRoom['id'], entry: ChatBatchEventEntry): void {
		let buf = this.buffers.get(roomId);
		if (buf == null) {
			buf = {
				events: [],
				timer: setTimeout(() => this.flush(roomId), FLUSH_WINDOW_MS),
			};
			this.buffers.set(roomId, buf);
		}
		buf.events.push(entry);
	}

	@bindThis
	private flush(roomId: MiChatRoom['id']): void {
		const buf = this.buffers.get(roomId);
		if (buf == null) return;
		this.buffers.delete(roomId);
		clearTimeout(buf.timer);
		if (buf.events.length === 0) return;
		this.publishBatch(roomId, buf.events);
	}

	@bindThis
	private publishBatch(roomId: MiChatRoom['id'], events: ChatBatchEventEntry[]): void {
		// 直接走 Redis,不绕回 GlobalEventService.publish,避免循环依赖。envelope 格式与
		// GlobalEventService.publish 保持完全一致,这样订阅侧(Connection.ts onRedisGlobalEvent)
		// 不需要额外分支。
		const payload = JSON.stringify({
			channel: this.shardRouter.channelFor(roomId),
			message: { type: 'batch', body: events },
		});
		// fire-and-forget;publish 失败由 ioredis 自己 log,不阻塞调用方
		this.redisForPub.publish(this.config.host, payload).catch(err => {
			// eslint-disable-next-line no-console
			console.error(`[ChatRoomEventBatcher] redis publish failed for room ${roomId}:`, err);
		});
	}

	@bindThis
	public flushAll(): void {
		for (const roomId of this.buffers.keys()) this.flush(roomId);
	}

	// systemd 重启 / process exit 时把还没冲掉的事件落地,避免最后 60ms 的消息丢失。
	public onApplicationShutdown(): void {
		this.flushAll();
	}
}
