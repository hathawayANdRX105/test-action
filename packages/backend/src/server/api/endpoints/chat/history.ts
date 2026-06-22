/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ChatService } from '@/core/ChatService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApiError } from '@/server/api/error.js';
import { CacheManagementService, type ManagedMemoryKVCache } from '@/global/CacheManagementService.js';
import type { Packed } from '@/misc/json-schema.js';

export const meta = {
	tags: ['chat'],

	requireCredential: true,

	kind: 'read:chat',

	limit: {
		type: 'bucket',
		size: 60,
		dripRate: 1000,
	},

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'ChatMessage',
		},
	},

	errors: {
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		room: { type: 'boolean', default: false },
	},
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	// 群聊列表 / DM 列表的 per-user 3s 内存缓存。同一个用户在 3s 内多次拉同一组
	// (room boolean × limit)只算一次,极大降低进出 chat tab 时的 HTTP 压力。
	// 新消息到达会通过 WS chatRoom batch event 实时推到客户端,3s 延迟仅影响"右
	// 侧房间列表"上的最后一条预览,可接受。
	private readonly historyCache: ManagedMemoryKVCache<Packed<'ChatMessage'>[]>;

	constructor(
		private chatEntityService: ChatEntityService,
		private chatService: ChatService,
		cacheManagementService: CacheManagementService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const cacheKey = `${me.id}:${ps.room ? 'r' : 'u'}:${ps.limit}`;
			const cached = this.historyCache.get(cacheKey);
			if (cached != null) return cached;
			const result = await this.compute(ps, me);
			this.historyCache.set(cacheKey, result);
			return result;
		});

		this.historyCache = cacheManagementService.createMemoryKVCache<Packed<'ChatMessage'>[]>('apiChatHistory', 1000 * 3);
	}

	private async compute(ps: { limit: number; room: boolean }, me: { id: string }): Promise<Packed<'ChatMessage'>[]> {
		await this.chatService.checkChatAvailability(me.id, 'read');

		const history = ps.room ? await this.chatService.roomHistory(me.id, ps.limit) : await this.chatService.userHistory(me.id, ps.limit);

		const packedMessages = await this.chatEntityService.packMessagesDetailed(history, me);

		if (ps.room) {
			const roomIds = history.map(m => m.toRoomId!);
			const [readStateMap, mentionStateMap] = await Promise.all([
				this.chatService.getRoomReadStateMap(me.id, roomIds),
				this.chatService.getRoomMentionStateMap(me.id, roomIds),
			]);

			for (const message of packedMessages) {
				message.isRead = readStateMap[message.toRoomId!] ?? false;
				message.hasUnreadMention = mentionStateMap[message.toRoomId!] ?? false;
			}
		} else {
			const otherIds = history.map(m => m.fromUserId === me.id ? m.toUserId! : m.fromUserId!);
			const readStateMap = await this.chatService.getUserReadStateMap(me.id, otherIds);

			for (const message of packedMessages) {
				const otherId = message.fromUserId === me.id ? message.toUserId! : message.fromUserId!;
				message.isRead = readStateMap[otherId] ?? false;
			}
		}

		return packedMessages;
	}
}
