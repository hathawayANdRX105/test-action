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
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import type { UsersRepository } from '@/models/_.js';
import { Channel, type MiChannelService } from '../channel.js';
import { serializeChatChannelEventForWs } from './chat-channel-serialization.js';
import { ChatReadReceiptBatcher, STREAM_CHAT_READ_RECEIPT_MIN_INTERVAL_MS } from './chat-read-receipt-batcher.js';

class ChatUserChannel extends Channel {
	public readonly chName = 'chatUser';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:chat';
	private otherId: string;
	private readonly readReceiptBatcher: ChatReadReceiptBatcher;

	constructor(
		id: string,
		connection: Channel['connection'],

		private usersRepository: UsersRepository,
		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
		super(id, connection);
		this.readReceiptBatcher = new ChatReadReceiptBatcher({
			minIntervalMs: STREAM_CHAT_READ_RECEIPT_MIN_INTERVAL_MS,
			run: () => {
				if (!this.otherId) return;
				return this.chatService.readUserChatMessage(this.user!.id, this.otherId);
			},
			onError: err => {
				console.error('Failed to read user chat message:', err);
			},
		});
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (!this.user) return false;
		if (typeof params.otherId !== 'string') return false;
		this.otherId = params.otherId;

		const other = await this.usersRepository.findOneBy({ id: this.otherId });
		if (other == null) return false;

		const availability = await this.chatService.getChatAvailability(this.user.id);
		if (!availability.read) return false;

		this.subscriber.on(`chatUserStream:${this.user.id}-${this.otherId}`, this.onEvent);

		// 异步推 bootstrap:替代 chat/messages/user-timeline 初次 HTTP。
		void this.sendBootstrap();

		return true;
	}

	@bindThis
	private async sendBootstrap(): Promise<void> {
		try {
			if (!this.user) return;
			const raw = await this.chatService.userTimeline(this.user.id, this.otherId, 30);
			const messages = await this.chatEntityService.packMessagesLiteFor1on1(raw, this.user);
			// ChatMessageLiteFor1on1 跟 ChatMessageLite 在 ChatEventTypes.bootstrap 中没分;
			// 序列化层只 JSON.stringify,not 类型敏感,直接 as any 简化
			this.connection.sendSerializedMessageToWsFast(
				serializeChatChannelEventForWs(this.id, {
					type: 'bootstrap',
					body: { messages } as any,
				}),
				{ compress: true },
			);
		} catch (err) {
			console.error('[chatUser bootstrap] failed:', err);
		}
	}

	@bindThis
	private onEvent(data: ChatEventPayload) {
		this.connection.sendSerializedMessageToWsFast(serializeChatChannelEventForWs(this.id, data), { compress: false });
	}

	@bindThis
	public onMessage(type: string, body: any) {
		switch (type) {
			case 'read':
				if (this.otherId) {
					this.readReceiptBatcher.queue();
				}
				break;
		}
	}

	@bindThis
	public dispose() {
		this.readReceiptBatcher.flush();
		this.subscriber.off(`chatUserStream:${this.user!.id}-${this.otherId}`, this.onEvent);
	}
}

@Injectable()
export class ChatUserChannelService implements MiChannelService<true> {
	public readonly shouldShare = ChatUserChannel.shouldShare;
	public readonly requireCredential = ChatUserChannel.requireCredential;
	public readonly kind = ChatUserChannel.kind;

	constructor(
		@Inject(DI.usersRepository)
		private readonly usersRepository: UsersRepository,

		private chatService: ChatService,
		private chatEntityService: ChatEntityService,
	) {
	}

	@bindThis
	public create(id: string, connection: Channel['connection']): ChatUserChannel {
		return new ChatUserChannel(
			id,
			connection,
			this.usersRepository,
			this.chatService,
			this.chatEntityService,
		);
	}
}
