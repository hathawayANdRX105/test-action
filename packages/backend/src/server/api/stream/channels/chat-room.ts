/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type { ChatEventPayload } from '@/core/GlobalEventService.js';
import type { JsonObject } from '@/misc/json-value.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatRoomShardRouter } from '@/core/ChatRoomShardRouter.js';
import type { ChatRoomsRepository } from '@/models/_.js';
import { Channel, type MiChannelService } from '../channel.js';
import { serializeChatChannelEventForWs } from './chat-channel-serialization.js';
import { ChatReadReceiptBatcher, STREAM_CHAT_READ_RECEIPT_MIN_INTERVAL_MS } from './chat-read-receipt-batcher.js';

class ChatRoomChannel extends Channel {
	public readonly chName = 'chatRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private roomId: string;
	private readonly readReceiptBatcher: ChatReadReceiptBatcher;

	constructor(
		id: string,
		connection: Channel['connection'],

		private chatRoomsRepository: ChatRoomsRepository,
		private chatService: ChatService,
		private shardRouter: ChatRoomShardRouter,
	) {
		super(id, connection);
		this.readReceiptBatcher = new ChatReadReceiptBatcher({
			minIntervalMs: STREAM_CHAT_READ_RECEIPT_MIN_INTERVAL_MS,
			run: () => {
				if (!this.roomId) return;
				return this.chatService.readRoomChatMessage(this.user!.id, this.roomId);
			},
			onError: err => {
				console.error('Failed to read room chat message:', err);
			},
		});
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (typeof params.roomId !== 'string') return false;
		this.roomId = params.roomId;

		const room = await this.chatRoomsRepository.findOne({
			select: { id: true, ownerId: true },
			where: { id: this.roomId },
		});

		if (room == null) return false;
		if (!await this.chatService.hasPermissionToViewRoomTimeline(this.user!, room)) return false;

		this.subscriber.on(this.shardRouter.channelFor(this.roomId), this.onEvent);

		return true;
	}

	@bindThis
	private onEvent(data: ChatEventPayload) {
		// batch 事件(多条 message/react/unreact 合并的包)体积明显大;开 permessage-deflate
		// 比省下 CPU 更划算(单条 message 维持 compress:false,避免小帧压缩反亏)。
		const compress = data.type === 'batch';

		// 自分がキック/BANされた場合は、そのイベントを通知した上で購読を解除し、
		// 以降のメッセージ等が(クライアントが切断しない場合でも)届かないようにする
		if (data.type === 'memberKicked' && data.body.userId === this.user?.id) {
			this.connection.sendSerializedMessageToWsFast(serializeChatChannelEventForWs(this.id, data), { compress: false });
			this.subscriber.off(this.shardRouter.channelFor(this.roomId), this.onEvent);
			return;
		}
		this.connection.sendSerializedMessageToWsFast(serializeChatChannelEventForWs(this.id, data), { compress });
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.roomId) {
					this.readReceiptBatcher.queue();
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.readReceiptBatcher.flush();
		this.subscriber.off(this.shardRouter.channelFor(this.roomId), this.onEvent);
	}
}

@Injectable()
export class ChatRoomChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatRoomChannel.shouldShare;
	public readonly requireCredential = ChatRoomChannel.requireCredential;
	public readonly kind = ChatRoomChannel.kind;

	constructor(
		@Inject(DI.chatRoomsRepository)
		private readonly chatRoomsRepository: ChatRoomsRepository,

		private readonly chatService: ChatService,
		private readonly shardRouter: ChatRoomShardRouter,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatRoomChannel {
		return new ChatRoomChannel(
			id,
			connection,
			this.chatRoomsRepository,
			this.chatService,
			this.shardRouter,
		);
	}
}
