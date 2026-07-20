/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as mfm from 'mfm-js';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, DriveFilesRepository, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository, MiChatRoomUserSetting, ChatRoomUserSettingsRepository, MiChatRoomUserMuting, ChatRoomUserMutingsRepository, MiChatRoomBanning, ChatRoomBanningsRepository } from '@/models/_.js';
import { awaitAll } from '@/misc/prelude/await-all.js';
import type { Packed } from '@/misc/json-schema.js';
import type { } from '@/models/Blocking.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { RoleService } from '@/core/RoleService.js';
import type { MiMeta } from '@/models/Meta.js';
import { UserEntityService } from './UserEntityService.js';
import { DriveFileEntityService } from './DriveFileEntityService.js';
import { In } from 'typeorm';
import * as Redis from 'ioredis';
import { MfmService } from '@/core/MfmService.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { isLocalUser } from '@/models/User.js';
import { promiseMap } from '@/misc/promise-map.js';

export const CHAT_MESSAGE_MENTION_CACHE_TTL = 60 * 60 * 24 * 30;

export function chatMessageMentionCacheKey(messageId: MiChatMessage['id']): string {
	return `chatMessageMentionedUserIds:${messageId}`;
}

@Injectable()
export class ChatEntityService {
	private readonly roomMemberCountLoads = new Map<MiChatRoom['id'], Promise<number>>();

	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.chatRoomUserSettingsRepository)
		private chatRoomUserSettingsRepository: ChatRoomUserSettingsRepository,

		@Inject(DI.chatRoomUserMutingsRepository)
		private chatRoomUserMutingsRepository: ChatRoomUserMutingsRepository,

		@Inject(DI.chatRoomBanningsRepository)
		private chatRoomBanningsRepository: ChatRoomBanningsRepository,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		private userEntityService: UserEntityService,
		private driveFileEntityService: DriveFileEntityService,
		private idService: IdService,
		private roleService: RoleService,
		private mfmService: MfmService,
		private remoteUserResolveService: RemoteUserResolveService,
	) {
	}

	private userChatReadWatermarkKey(readerId: MiUser['id'], peerId: MiUser['id']): string {
		return `readUserChatMessage:${readerId}:${peerId}`;
	}

	private roomChatReadWatermarkKey(readerId: MiUser['id'], roomId: MiChatRoom['id']): string {
		return `readRoomChatMessage:${readerId}:${roomId}`;
	}

	/** Snowflake ids are lexicographically ordered by time — safe for watermark compares. */
	private isMessageAtOrBeforeWatermark(messageId: string, watermark: string | null | undefined): boolean {
		return watermark != null && messageId <= watermark;
	}

	@bindThis
	private async extractMessageMentionedUserIds(text: string | null | undefined): Promise<MiUser['id'][]> {
		if (text == null || !text.includes('@')) return [];

		let nodes: mfm.MfmNode[];
		try {
			nodes = mfm.parse(text);
		} catch {
			return [];
		}

		const mentions = this.mfmService.extractMentions(nodes);
		if (mentions.length === 0) return [];

		const mentionedUsers = await promiseMap(
			mentions,
			async mention => await this.remoteUserResolveService.resolveUser(mention.username, mention.host).catch(() => null),
			{ limiter: 2 },
		);

		return Array.from(new Map(
			mentionedUsers
				.filter(user => user != null && isLocalUser(user))
				.map(user => [user.id, user.id]),
		).values());
	}

	@bindThis
	private async getCachedMessageMentionedUserIds(message: MiChatMessage): Promise<MiUser['id'][]> {
		if (message.text == null || !message.text.includes('@')) return [];

		const cacheKey = chatMessageMentionCacheKey(message.id);
		const cached = await this.redisClient.get(cacheKey);
		if (cached != null) {
			try {
				const parsed = JSON.parse(cached) as unknown;
				if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) return parsed;
			} catch {
				// Ignore stale malformed cache entries and refresh below.
			}
		}

		const mentionedUserIds = await this.extractMessageMentionedUserIds(message.text);
		await this.redisClient.set(cacheKey, JSON.stringify(mentionedUserIds), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
		return mentionedUserIds;
	}

	@bindThis
	private async getCachedMessagesMentionedUserIds(messages: MiChatMessage[]): Promise<Map<MiChatMessage['id'], MiUser['id'][]>> {
		const result = new Map<MiChatMessage['id'], MiUser['id'][]>();
		const targets = messages.filter(message => message.toRoomId != null && message.text != null && message.text.includes('@'));
		if (targets.length === 0) return result;

		const cacheKeys = targets.map(message => chatMessageMentionCacheKey(message.id));
		const cachedValues = await this.redisClient.mget(...cacheKeys);
		const misses: MiChatMessage[] = [];

		for (let i = 0; i < targets.length; i++) {
			const cached = cachedValues[i];
			if (cached != null) {
				try {
					const parsed = JSON.parse(cached) as unknown;
					if (Array.isArray(parsed) && parsed.every(x => typeof x === 'string')) {
						result.set(targets[i].id, parsed);
						continue;
					}
				} catch {
					// Ignore stale malformed cache entries and refresh below.
				}
			}

			misses.push(targets[i]);
		}

		if (misses.length === 0) return result;

		const resolved = await promiseMap(
			misses,
			async message => ({
				id: message.id,
				mentionedUserIds: await this.extractMessageMentionedUserIds(message.text),
			}),
			{ limiter: 2 },
		);

		const redisPipeline = this.redisClient.pipeline();
		for (const item of resolved) {
			result.set(item.id, item.mentionedUserIds);
			redisPipeline.set(chatMessageMentionCacheKey(item.id), JSON.stringify(item.mentionedUserIds), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
		}
		await redisPipeline.exec();

		return result;
	}

	@bindThis
	private async getRoomAvatarUrl(room: MiChatRoom): Promise<string | null> {
		const avatarUrls = await this.getRoomAvatarUrls([room]);
		return avatarUrls.get(room.id) ?? null;
	}

	@bindThis
	private async getRoomAvatarUrls(rooms: MiChatRoom[]): Promise<Map<MiChatRoom['id'], string | null>> {
		const result = new Map<MiChatRoom['id'], string | null>();
		const avatarIds = Array.from(new Set(
			rooms
				.filter(room => room.avatarId != null && room.avatarUrl == null && room.avatar == null)
				.map(room => room.avatarId!),
		));
		const avatars = avatarIds.length > 0 ? await this.driveFilesRepository.findBy({ id: In(avatarIds) }) : [];
		const avatarsById = new Map(avatars.map(avatar => [avatar.id, avatar]));
		const updates: Promise<unknown>[] = [];

		for (const room of rooms) {
			if (room.avatarId == null) {
				result.set(room.id, null);
				continue;
			}

			if (room.avatarUrl != null) {
				result.set(room.id, room.avatarUrl);
				continue;
			}

			const avatar = room.avatar ?? avatarsById.get(room.avatarId) ?? null;
			if (avatar == null) {
				room.avatarId = null;
				room.avatarUrl = null;
				result.set(room.id, null);
				updates.push(this.chatRoomsRepository.update(room.id, { avatarId: null, avatarUrl: null }));
				continue;
			}

			const avatarUrl = this.driveFileEntityService.getPublicUrl(avatar, 'avatar');
			room.avatarUrl = avatarUrl;
			result.set(room.id, avatarUrl);
			updates.push(this.chatRoomsRepository.update(room.id, { avatarUrl }));
		}

		if (updates.length > 0) {
			await Promise.all(updates);
		}

		return result;
	}

	@bindThis
	private async packMessageReference(
		src: MiChatMessage['id'] | MiChatMessage | null,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
		): Promise<Packed<'ChatMessageReference'> | null> {
		if (src == null) return null;

		const packedUsers = options?._hint_?.packedUsers;
		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneBy({ id: src });
		if (message == null) return null;
		if (me != null && message.toRoomId != null && message.fromUserId !== me.id) {
			const muted = await this.chatRoomUserMutingsRepository.existsBy({
				roomId: message.toRoomId,
				muterId: me.id,
				muteeId: message.fromUserId,
			});
			if (muted) return null;
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId),
			toUserId: message.toUserId,
			toRoomId: message.toRoomId,
			fileId: message.fileId,
			file: message.fileId ? await this.driveFileEntityService.pack(message.file ?? message.fileId) : null,
			reactions: [],
		};
	}

	@bindThis
	public async packMessageDetailed(
		src: MiChatMessage['id'] | MiChatMessage,
		me?: { id: MiUser['id'] },
		options?: {
			mentionedUserIds?: MiUser['id'][];
			_hint_?: {
				packedFiles?: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers?: Map<MiUser['id'], Packed<'UserLite'>>;
				packedRooms?: Map<MiChatMessage['toRoomId'], Packed<'ChatRoom'> | null>;
			};
		},
	): Promise<Packed<'ChatMessage'>> {
		const packedUsers = options?._hint_?.packedUsers;
		const packedFiles = options?._hint_?.packedFiles;
		const packedRooms = options?._hint_?.packedRooms;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });
		const mentionedUserIds = message.toRoomId ? (options?.mentionedUserIds ?? await this.getCachedMessageMentionedUserIds(message)) : [];

		const reactions: { user: Packed<'UserLite'>; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId),
				reaction,
			});
		}

		let isRead: boolean | undefined;
		let readCount: number | undefined;
		if (me != null && message.fromUserId === me.id) {
			if (message.toUserId != null) {
				const peerWatermark = await this.redisClient.get(this.userChatReadWatermarkKey(message.toUserId, me.id));
				isRead = this.isMessageAtOrBeforeWatermark(message.id, peerWatermark);
			} else if (message.toRoomId != null) {
				// Best-effort single-message pack: count members who have read up to this id.
				const memberships = await this.chatRoomMembershipsRepository.find({
					select: { userId: true },
					where: { roomId: message.toRoomId },
				});
				const memberIds = memberships.map(m => m.userId).filter(id => id !== me.id);
				if (memberIds.length > 0) {
					const keys = memberIds.map(id => this.roomChatReadWatermarkKey(id, message.toRoomId!));
					const values = await this.redisClient.mget(...keys);
					readCount = values.reduce((acc, wm) => acc + (this.isMessageAtOrBeforeWatermark(message.id, wm) ? 1 : 0), 0);
				} else {
					readCount = 0;
				}
			}
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId, me),
			toUserId: message.toUserId,
			toUser: message.toUserId ? (packedUsers?.get(message.toUserId) ?? await this.userEntityService.pack(message.toUser ?? message.toUserId, me)) : undefined,
			toRoomId: message.toRoomId,
			toRoom: message.toRoomId ? (packedRooms?.get(message.toRoomId) ?? await this.packRoom(message.toRoom ?? message.toRoomId, me)) : undefined,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			replyId: message.replyId,
			reply: message.replyId ? await this.packMessageReference(message.reply ?? message.replyId, me, { _hint_: { packedUsers } }) : null,
			quoteId: message.quoteId,
			quote: message.quoteId ? await this.packMessageReference(message.quote ?? message.quoteId, me, { _hint_: { packedUsers } }) : null,
			mentionedUserIds: message.toRoomId ? mentionedUserIds : undefined,
			hasMentionForMe: message.toRoomId ? (me != null && message.fromUserId !== me.id && mentionedUserIds.includes(me.id)) : undefined,
			isRead,
			readCount,
			reactions,
		};
	}

	@bindThis
	public async packMessagesDetailed(
		messages: MiChatMessage[],
		me: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const excludeMe = (x: MiUser | string) => {
			if (typeof x === 'string') {
				return x !== me.id;
			} else {
				return x.id !== me.id;
			}
		};

		const users = [
			...messages.map((m) => m.fromUser ?? m.fromUserId).filter(excludeMe),
			...messages.map((m) => m.toUser ?? m.toUserId).filter(x => x != null).filter(excludeMe),
			...messages.map((m) => m.reply?.fromUser ?? m.reply?.fromUserId).filter(x => x != null).filter(excludeMe),
			...messages.map((m) => m.quote?.fromUser ?? m.quote?.fromUserId).filter(x => x != null).filter(excludeMe),
		];

		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const [packedUsers, packedFiles, packedRooms, mentionedUserIdsByMessage] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.packRooms(messages.map(m => m.toRoom ?? m.toRoomId).filter(x => x != null), me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
			this.getCachedMessagesMentionedUserIds(messages),
		]);

		return await Promise.all(messages.map(message => this.packMessageDetailed(message, me, {
			mentionedUserIds: message.toRoomId ? (mentionedUserIdsByMessage.get(message.id) ?? []) : undefined,
			_hint_: { packedUsers, packedFiles, packedRooms },
		})));
	}

	@bindThis
	public async packMessageLiteFor1on1(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			meId?: MiUser['id'];
			/** Peer's last-read watermark for messages I sent (peer = the other user). */
			peerReadWatermark?: string | null;
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
			};
		},
	): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		const packedFiles = options?._hint_?.packedFiles;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });

		const reactions: { reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				reaction,
			});
		}

		const meId = options?.meId;
		let isRead: boolean | undefined;
		if (meId != null && message.fromUserId === meId) {
			isRead = this.isMessageAtOrBeforeWatermark(message.id, options?.peerReadWatermark);
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			toUserId: message.toUserId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			replyId: message.replyId,
			reply: message.replyId ? await this.packMessageReference(message.reply ?? message.replyId) : null,
			quoteId: message.quoteId,
			quote: message.quoteId ? await this.packMessageReference(message.quote ?? message.quoteId) : null,
			isRead,
			reactions,
		};
	}

	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
		me?: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const meId = me?.id;
		// For 1:1 history, all messages share the same peer pair.
		let peerReadWatermark: string | null = null;
		if (meId != null) {
			const sample = messages[0];
			const peerId = sample.fromUserId === meId ? sample.toUserId : sample.fromUserId;
			if (peerId != null) {
				peerReadWatermark = await this.redisClient.get(this.userChatReadWatermarkKey(peerId, meId));
			}
		}

		const [packedFiles] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return await Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, {
			meId,
			peerReadWatermark,
			_hint_: { packedFiles },
		})));
	}

	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
			meId?: MiUser['id'];
			/** Map of memberId -> lastReadMessageId. */
			memberReadWatermarks?: Map<MiUser['id'], string | null>;
			mentionedUserIds?: MiUser['id'][];
			_hint_?: {
				packedFiles: Map<MiChatMessage['fileId'], Packed<'DriveFile'> | null>;
				packedUsers: Map<MiUser['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const packedFiles = options?._hint_?.packedFiles;
		const packedUsers = options?._hint_?.packedUsers;

		const message = typeof src === 'object' ? src : await this.chatMessagesRepository.findOneByOrFail({ id: src });
		const mentionedUserIds = options?.mentionedUserIds ?? await this.getCachedMessageMentionedUserIds(message);

		const reactions: { user: Packed<'UserLite'>; reaction: string; }[] = [];

		for (const record of message.reactions) {
			const [userId, reaction] = record.split('/');
			reactions.push({
				user: packedUsers?.get(userId) ?? await this.userEntityService.pack(userId),
				reaction,
			});
		}

		const meId = options?.meId;
		let readCount: number | undefined;
		if (meId != null && message.fromUserId === meId && options?.memberReadWatermarks != null) {
			let count = 0;
			for (const [memberId, watermark] of options.memberReadWatermarks) {
				if (memberId === meId) continue;
				if (this.isMessageAtOrBeforeWatermark(message.id, watermark)) count++;
			}
			readCount = count;
		}

		return {
			id: message.id,
			createdAt: this.idService.parse(message.id).date.toISOString(),
			text: message.text,
			fromUserId: message.fromUserId,
			fromUser: packedUsers?.get(message.fromUserId) ?? await this.userEntityService.pack(message.fromUser ?? message.fromUserId),
			toRoomId: message.toRoomId!,
			fileId: message.fileId,
			file: message.fileId ? (packedFiles?.get(message.fileId) ?? await this.driveFileEntityService.pack(message.file ?? message.fileId)) : null,
			replyId: message.replyId,
			reply: message.replyId ? await this.packMessageReference(message.reply ?? message.replyId) : null,
			quoteId: message.quoteId,
			quote: message.quoteId ? await this.packMessageReference(message.quote ?? message.quoteId) : null,
			mentionedUserIds,
			readCount,
			reactions,
		};
	}

	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
		me?: { id: MiUser['id'] },
	) {
		if (messages.length === 0) return [];

		const meId = me?.id;
		const roomId = messages[0].toRoomId;

		const users = messages.flatMap(x => [x.fromUser ?? x.fromUserId, x.reply?.fromUser ?? x.reply?.fromUserId, x.quote?.fromUser ?? x.quote?.fromUserId]).filter(x => x != null);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const memberIdsPromise: Promise<MiUser['id'][]> = (async () => {
			if (meId == null || roomId == null) return [];
			const memberships = await this.chatRoomMembershipsRepository.find({
				select: { userId: true },
				where: { roomId },
			});
			const ids = memberships.map(m => m.userId);
			// Owner may not have a membership row on some older rooms.
			const room = await this.chatRoomsRepository.findOne({ select: { ownerId: true }, where: { id: roomId } });
			if (room?.ownerId && !ids.includes(room.ownerId)) ids.push(room.ownerId);
			return ids;
		})();

		const [packedUsers, packedFiles, mentionedUserIdsByMessage, memberIds] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.getCachedMessagesMentionedUserIds(messages),
			memberIdsPromise,
		]);

		let memberReadWatermarks: Map<MiUser['id'], string | null> | undefined;
		if (meId != null && roomId != null && memberIds.length > 0) {
			const keys = memberIds.map(id => this.roomChatReadWatermarkKey(id, roomId));
			const values = await this.redisClient.mget(...keys);
			memberReadWatermarks = new Map();
			for (let i = 0; i < memberIds.length; i++) {
				memberReadWatermarks.set(memberIds[i], values[i]);
			}
		}

		return await Promise.all(messages.map(message => this.packMessageLiteForRoom(message, {
			meId,
			memberReadWatermarks,
			mentionedUserIds: mentionedUserIdsByMessage.get(message.id) ?? [],
			_hint_: { packedUsers, packedFiles },
		})));
	}

	@bindThis
	/**
	 * Overlay viewer-specific readCount onto already-packed room messages.
	 * Safe to call on shared-cache payloads (mutates a shallow copy per message).
	 */
	public async applyRoomReadReceipts(
		messages: Packed<'ChatMessageLiteForRoom'>[],
		meId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<Packed<'ChatMessageLiteForRoom'>[]> {
		if (messages.length === 0) return messages;

		const memberships = await this.chatRoomMembershipsRepository.find({
			select: { userId: true },
			where: { roomId },
		});
		const memberIds = memberships.map(m => m.userId);
		const room = await this.chatRoomsRepository.findOne({ select: { ownerId: true }, where: { id: roomId } });
		if (room?.ownerId && !memberIds.includes(room.ownerId)) memberIds.push(room.ownerId);
		if (memberIds.length === 0) {
			return messages.map(m => m.fromUserId === meId ? { ...m, readCount: 0 } : m);
		}

		const keys = memberIds.map(id => this.roomChatReadWatermarkKey(id, roomId));
		const values = await this.redisClient.mget(...keys);
		const watermarks = new Map<MiUser['id'], string | null>();
		for (let i = 0; i < memberIds.length; i++) {
			watermarks.set(memberIds[i], values[i]);
		}

		return messages.map(message => {
			if (message.fromUserId !== meId) return message;
			let count = 0;
			for (const [memberId, watermark] of watermarks) {
				if (memberId === meId) continue;
				if (this.isMessageAtOrBeforeWatermark(message.id, watermark)) count++;
			}
			return { ...message, readCount: count };
		});
	}

	@bindThis
	private async getRoomMemberCount(roomId: MiChatRoom['id']): Promise<number> {
		const loading = this.roomMemberCountLoads.get(roomId);
		if (loading != null) return await loading;

		const load = this.chatRoomMembershipsRepository
			.countBy({ roomId })
			.then(count => count + 1);
		this.roomMemberCountLoads.set(roomId, load);

		try {
			return await load;
		} finally {
			if (this.roomMemberCountLoads.get(roomId) === load) {
				this.roomMemberCountLoads.delete(roomId);
			}
		}
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				memberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
				userSettings?: Map<MiChatRoom['id'], MiChatRoomUserSetting | null | undefined>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });

		const membership = me && me.id !== room.ownerId ? (options?._hint_?.memberships?.get(room.id) ?? await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const userSetting = me != null ? (options?._hint_?.userSettings?.get(room.id) ?? await this.chatRoomUserSettingsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const isJoined = me != null && (me.id === room.ownerId || membership != null);
		const [memberCount, isAdministrator, isModerator, avatarUrl] = await Promise.all([
			this.getRoomMemberCount(room.id),
			me != null ? this.roleService.isAdministrator(me) : false,
			me != null ? this.roleService.isModerator(me) : false,
			this.getRoomAvatarUrl(room),
		]);
		const canSeeOverride = me != null && (me.id === room.ownerId || isAdministrator);
		const canModerateRoom = me != null && (me.id === room.ownerId || isModerator || membership?.role === 'manager');
		const canManageRoomRoles = me != null && (me.id === room.ownerId || isModerator);
		const canEditRoomProfile = canManageRoomRoles;
		const canDeleteRoom = canManageRoomRoles;

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			avatarUrl,
			isSilenced: room.isSilenced,
			announcement: room.announcement,
			announcementPinned: room.announcementPinned,
			announcementHistory: Array.isArray(room.announcementHistory) ? room.announcementHistory : [],
			joinMode: room.joinMode,
			memberLimit: room.memberLimitOverride ?? this.meta.chatRoomDefaultMemberLimit,
			memberLimitOverride: canSeeOverride ? room.memberLimitOverride : undefined,
			canManage: canModerateRoom,
			canModerateRoom,
			canManageRoomRoles,
			canEditRoomProfile,
			canDeleteRoom,
			messageRetentionDays: canManageRoomRoles ? room.messageRetentionDays : undefined,
			slowModeSeconds: room.slowModeSeconds,
			bannedKeywords: canModerateRoom ? room.bannedKeywords : undefined,
			keywordMuteSeconds: canModerateRoom ? room.keywordMuteSeconds : undefined,
			memberCount,
			isJoined,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			isMuted: membership != null ? membership.isMuted : false,
			myMutedUntil: membership?.mutedUntil?.toISOString() ?? null,
			myNickname: userSetting?.nickname ?? null,
			myFolder: userSetting?.folder ?? null,
		};
	}

	@bindThis
	public async packRooms(
		rooms: (MiChatRoom | MiChatRoom['id'])[],
		me: { id: MiUser['id'] },
	) {
		if (rooms.length === 0) return [];

		const roomsById = new Map<MiChatRoom['id'], MiChatRoom>();
		for (const room of rooms) {
			if (typeof room !== 'string') {
				roomsById.set(room.id, room);
			}
		}

		const missingRoomIds = Array.from(new Set(rooms.filter((room): room is string => typeof room === 'string').filter(id => !roomsById.has(id))));
		if (missingRoomIds.length > 0) {
			const foundRooms = await this.chatRoomsRepository.find({
				where: {
					id: In(missingRoomIds),
				},
				relations: ['owner'],
			});

			for (const room of foundRooms) {
				roomsById.set(room.id, room);
			}
		}

		const _rooms = Array.from(roomsById.values());
		if (_rooms.length === 0) return [];

		const owners = Array.from(new Map(_rooms.map(room => {
			const owner = room.owner ?? room.ownerId;
			return [typeof owner === 'string' ? owner : owner.id, owner];
		})).values());
		const roomIds = _rooms.map(room => room.id);
		const shouldLoadMemberships = _rooms.some(room => room.ownerId !== me.id);

		const [packedOwners, memberships, memberCounts, userSettings, avatarUrls, isAdministrator, isModerator] = await Promise.all([
			this.userEntityService.packMany(owners, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			shouldLoadMemberships ? this.chatRoomMembershipsRepository.find({
				where: {
					roomId: In(roomIds),
					userId: me.id,
				},
			}) : [],
			this.chatRoomMembershipsRepository
				.createQueryBuilder('membership')
				.select('membership.roomId', 'roomId')
				.addSelect('COUNT(*)', 'count')
				.where('membership.roomId IN (:...roomIds)', { roomIds })
				.groupBy('membership.roomId')
				.getRawMany<{ roomId: MiChatRoom['id']; count: string; }>()
				.then(rows => new Map<MiChatRoom['id'], number>(rows.map(row => [row.roomId, Number.parseInt(row.count, 10) + 1]))),
			this.chatRoomUserSettingsRepository.find({
				where: {
					roomId: In(roomIds),
					userId: me.id,
				},
			}),
			this.getRoomAvatarUrls(_rooms),
			this.roleService.isAdministrator(me),
			this.roleService.isModerator(me),
		]);

		const membershipsByRoomId = new Map<MiChatRoom['id'], MiChatRoomMembership>(
			memberships.map(membership => [membership.roomId, membership] as const),
		);
		const userSettingsByRoomId = new Map<MiChatRoom['id'], MiChatRoomUserSetting>(
			userSettings.map(setting => [setting.roomId, setting] as const),
		);

		return _rooms.map(room => this.packRoomWithHints(room, me, {
			packedOwners,
			membership: membershipsByRoomId.get(room.id) ?? null,
			userSetting: userSettingsByRoomId.get(room.id) ?? null,
			memberCount: memberCounts.get(room.id) ?? 1,
			avatarUrl: avatarUrls.get(room.id) ?? null,
			isAdministrator,
			isModerator,
		}));
	}

	private packRoomWithHints(
		room: MiChatRoom,
		me: { id: MiUser['id'] },
		hints: {
			packedOwners: Map<MiUser['id'], Packed<'UserLite'>>;
			membership: MiChatRoomMembership | null;
			userSetting: MiChatRoomUserSetting | null;
			memberCount: number;
			avatarUrl: string | null;
			isAdministrator: boolean;
			isModerator: boolean;
		},
	): Packed<'ChatRoom'> {
		const isJoined = me.id === room.ownerId || hints.membership != null;
		const canSeeOverride = me.id === room.ownerId || hints.isAdministrator;
		const canModerateRoom = me.id === room.ownerId || hints.isModerator || hints.membership?.role === 'manager';
		const canManageRoomRoles = me.id === room.ownerId || hints.isModerator;
		const canEditRoomProfile = canManageRoomRoles;
		const canDeleteRoom = canManageRoomRoles;

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			avatarUrl: hints.avatarUrl,
			isSilenced: room.isSilenced,
			announcement: room.announcement,
			announcementPinned: room.announcementPinned,
			announcementHistory: Array.isArray(room.announcementHistory) ? room.announcementHistory : [],
			joinMode: room.joinMode,
			memberLimit: room.memberLimitOverride ?? this.meta.chatRoomDefaultMemberLimit,
			memberLimitOverride: canSeeOverride ? room.memberLimitOverride : undefined,
			canManage: canModerateRoom,
			canModerateRoom,
			canManageRoomRoles,
			canEditRoomProfile,
			canDeleteRoom,
			messageRetentionDays: canManageRoomRoles ? room.messageRetentionDays : undefined,
			slowModeSeconds: room.slowModeSeconds,
			bannedKeywords: canModerateRoom ? room.bannedKeywords : undefined,
			keywordMuteSeconds: canModerateRoom ? room.keywordMuteSeconds : undefined,
			memberCount: hints.memberCount,
			isJoined,
			ownerId: room.ownerId,
			owner: hints.packedOwners.get(room.ownerId)!,
			isMuted: hints.membership != null ? hints.membership.isMuted : false,
			myMutedUntil: hints.membership?.mutedUntil?.toISOString() ?? null,
			myNickname: hints.userSetting?.nickname ?? null,
			myFolder: hints.userSetting?.folder ?? null,
		};
	}

	@bindThis
	public async packRoomInvitation(
		src: MiChatRoomInvitation['id'] | MiChatRoomInvitation,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedRooms: Map<MiChatRoomInvitation['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomInvitation['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomInvitation'>> {
		const invitation = typeof src === 'object' ? src : await this.chatRoomInvitationsRepository.findOneByOrFail({ id: src });

		return {
			id: invitation.id,
			createdAt: this.idService.parse(invitation.id).date.toISOString(),
			roomId: invitation.roomId,
			room: options?._hint_?.packedRooms.get(invitation.roomId) ?? await this.packRoom(invitation.room ?? invitation.roomId, me),
			userId: invitation.userId,
			user: options?._hint_?.packedUsers.get(invitation.userId) ?? await this.userEntityService.pack(invitation.user ?? invitation.userId, me),
		};
	}

	@bindThis
	public async packRoomInvitations(
		invitations: MiChatRoomInvitation[],
		me: { id: MiUser['id'] },
	) {
		if (invitations.length === 0) return [];

		return await Promise.all(invitations.map(invitation => this.packRoomInvitation(invitation, me)));
	}

	@bindThis
	public async packRoomMembership(
		src: MiChatRoomMembership['id'] | MiChatRoomMembership,
		me: { id: MiUser['id'] },
		options?: {
			populateUser?: boolean;
			populateRoom?: boolean;
			_hint_?: {
				packedRooms: Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>;
				packedUsers: Map<MiChatRoomMembership['id'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomMembership'>> {
		const membership = typeof src === 'object' ? src : await this.chatRoomMembershipsRepository.findOneByOrFail({ id: src });

		return {
			id: membership.id,
			createdAt: this.idService.parse(membership.id).date.toISOString(),
			userId: membership.userId,
			user: options?.populateUser ? (options._hint_?.packedUsers.get(membership.userId) ?? await this.userEntityService.pack(membership.user ?? membership.userId, me)) : undefined,
			roomId: membership.roomId,
			room: options?.populateRoom ? (options._hint_?.packedRooms.get(membership.roomId) ?? await this.packRoom(membership.room ?? membership.roomId, me)) : undefined,
			role: membership.role,
			mutedUntil: membership.mutedUntil?.toISOString() ?? null,
		};
	}

	@bindThis
	public async packRoomMemberships(
		memberships: MiChatRoomMembership[],
		me: { id: MiUser['id'] },
		options: {
			populateUser?: boolean;
			populateRoom?: boolean;
		} = {},
	) {
		if (memberships.length === 0) return [];

		const users = memberships.map(x => x.user ?? x.userId);
		const rooms = memberships.map(x => x.room ?? x.roomId);

		const [packedUsers, packedRooms] = await Promise.all([
			this.userEntityService.packMany(users, me)
				.then(users => new Map(users.map(u => [u.id, u]))),
			options.populateRoom
				? this.packRooms(rooms, me)
					.then(rooms => new Map(rooms.map(r => [r.id, r])))
				: new Map<MiChatRoomMembership['roomId'], Packed<'ChatRoom'>>(),
		]);

		return await Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}

	@bindThis
	public async packRoomUserMuting(
		src: MiChatRoomUserMuting['id'] | MiChatRoomUserMuting,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedUsers: Map<MiChatRoomUserMuting['muteeId'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomUserMuting'>> {
		const muting = typeof src === 'object' ? src : await this.chatRoomUserMutingsRepository.findOneByOrFail({ id: src });

		return {
			id: muting.id,
			createdAt: muting.createdAt.toISOString(),
			roomId: muting.roomId,
			muterId: muting.muterId,
			muteeId: muting.muteeId,
			user: options?._hint_?.packedUsers.get(muting.muteeId) ?? await this.userEntityService.pack(muting.mutee ?? muting.muteeId, me),
		};
	}

	@bindThis
	public async packRoomUserMutings(
		mutings: MiChatRoomUserMuting[],
		me: { id: MiUser['id'] },
	) {
		if (mutings.length === 0) return [];

		const users = mutings.map(x => x.mutee ?? x.muteeId);
		const packedUsers = await this.userEntityService.packMany(users, me)
			.then(users => new Map(users.map(u => [u.id, u])));

		return await Promise.all(mutings.map(muting => this.packRoomUserMuting(muting, me, { _hint_: { packedUsers } })));
	}

	@bindThis
	public async packRoomBanning(
		src: MiChatRoomBanning['id'] | MiChatRoomBanning,
		me: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedUsers: Map<MiChatRoomBanning['userId'], Packed<'UserLite'>>;
			};
		},
	): Promise<Packed<'ChatRoomBanning'>> {
		const banning = typeof src === 'object' ? src : await this.chatRoomBanningsRepository.findOneByOrFail({ id: src });

		return {
			id: banning.id,
			createdAt: banning.createdAt.toISOString(),
			roomId: banning.roomId,
			userId: banning.userId,
			user: options?._hint_?.packedUsers.get(banning.userId) ?? await this.userEntityService.pack(banning.user ?? banning.userId, me),
		};
	}

	@bindThis
	public async packRoomBannings(
		bannings: MiChatRoomBanning[],
		me: { id: MiUser['id'] },
	) {
		if (bannings.length === 0) return [];

		const users = bannings.map(x => x.user ?? x.userId);
		const packedUsers = await this.userEntityService.packMany(users, me)
			.then(users => new Map(users.map(u => [u.id, u])));

		return await Promise.all(bannings.map(banning => this.packRoomBanning(banning, me, { _hint_: { packedUsers } })));
	}
}
