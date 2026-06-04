/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as mfm from 'mfm-js';
import { DI } from '@/di-symbols.js';
import type { MiUser, ChatMessagesRepository, MiChatMessage, ChatRoomsRepository, MiChatRoom, MiChatRoomInvitation, ChatRoomInvitationsRepository, MiChatRoomMembership, ChatRoomMembershipsRepository } from '@/models/_.js';
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
	constructor(
		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

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
	private async packMessageReference(
		src: MiChatMessage['id'] | MiChatMessage | null,
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
			reply: message.replyId ? await this.packMessageReference(message.reply ?? message.replyId, { _hint_: { packedUsers } }) : null,
			quoteId: message.quoteId,
			quote: message.quoteId ? await this.packMessageReference(message.quote ?? message.quoteId, { _hint_: { packedUsers } }) : null,
			mentionedUserIds: message.toRoomId ? mentionedUserIds : undefined,
			hasMentionForMe: message.toRoomId ? (me != null && message.fromUserId !== me.id && mentionedUserIds.includes(me.id)) : undefined,
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
			reactions,
		};
	}

	@bindThis
	public async packMessagesLiteFor1on1(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const [packedFiles] = await Promise.all([
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
		]);

		return await Promise.all(messages.map(message => this.packMessageLiteFor1on1(message, { _hint_: { packedFiles } })));
	}

	@bindThis
	public async packMessageLiteForRoom(
		src: MiChatMessage['id'] | MiChatMessage,
		options?: {
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
			reactions,
		};
	}

	@bindThis
	public async packMessagesLiteForRoom(
		messages: MiChatMessage[],
	) {
		if (messages.length === 0) return [];

		const users = messages.flatMap(x => [x.fromUser ?? x.fromUserId, x.reply?.fromUser ?? x.reply?.fromUserId, x.quote?.fromUser ?? x.quote?.fromUserId]).filter(x => x != null);
		const reactedUserIds = messages.flatMap(x => x.reactions.map(r => r.split('/')[0]));

		for (const reactedUserId of reactedUserIds) {
			if (!users.some(x => typeof x === 'string' ? x === reactedUserId : x.id === reactedUserId)) {
				users.push(reactedUserId);
			}
		}

		const [packedUsers, packedFiles, mentionedUserIdsByMessage] = await Promise.all([
			this.userEntityService.packMany(users)
				.then(users => new Map(users.map(u => [u.id, u]))),
			this.driveFileEntityService.packMany(messages.map(m => m.file).filter(x => x != null))
				.then(files => new Map(files.map(f => [f.id, f]))),
			this.getCachedMessagesMentionedUserIds(messages),
		]);

		return await Promise.all(messages.map(message => this.packMessageLiteForRoom(message, {
			mentionedUserIds: mentionedUserIdsByMessage.get(message.id) ?? [],
			_hint_: { packedFiles, packedUsers },
		})));
	}

	@bindThis
	public async packRoom(
		src: MiChatRoom['id'] | MiChatRoom,
		me?: { id: MiUser['id'] },
		options?: {
			_hint_?: {
				packedOwners: Map<MiChatRoom['id'], Packed<'UserLite'>>;
				memberships?: Map<MiChatRoom['id'], MiChatRoomMembership | null | undefined>;
			};
		},
	): Promise<Packed<'ChatRoom'>> {
		const room = typeof src === 'object' ? src : await this.chatRoomsRepository.findOneByOrFail({ id: src });

		const membership = me && me.id !== room.ownerId ? (options?._hint_?.memberships?.get(room.id) ?? await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId: me.id })) : null;
		const isJoined = me != null && (me.id === room.ownerId || membership != null);
		const [memberCount, isAdministrator, isModerator] = await Promise.all([
			this.chatRoomMembershipsRepository.countBy({ roomId: room.id }).then(count => count + 1),
			me != null ? this.roleService.isAdministrator(me) : false,
			me != null ? this.roleService.isModerator(me) : false,
		]);
		const canSeeOverride = me != null && (me.id === room.ownerId || isAdministrator);
		const canManage = me != null && isModerator;

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			joinMode: room.joinMode,
			memberLimit: room.memberLimitOverride ?? this.meta.chatRoomDefaultMemberLimit,
			memberLimitOverride: canSeeOverride ? room.memberLimitOverride : undefined,
			canManage,
			messageRetentionDays: canManage ? room.messageRetentionDays : undefined,
			memberCount,
			isJoined,
			ownerId: room.ownerId,
			owner: options?._hint_?.packedOwners.get(room.ownerId) ?? await this.userEntityService.pack(room.owner ?? room.ownerId, me),
			isMuted: membership != null ? membership.isMuted : false,
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

		const [packedOwners, memberships, memberCounts, isAdministrator, isModerator] = await Promise.all([
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
			this.roleService.isAdministrator(me),
			this.roleService.isModerator(me),
		]);

		const membershipsByRoomId = new Map<MiChatRoom['id'], MiChatRoomMembership>(
			memberships.map(membership => [membership.roomId, membership] as const),
		);

		return _rooms.map(room => this.packRoomWithHints(room, me, {
			packedOwners,
			membership: membershipsByRoomId.get(room.id) ?? null,
			memberCount: memberCounts.get(room.id) ?? 1,
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
			memberCount: number;
			isAdministrator: boolean;
			isModerator: boolean;
		},
	): Packed<'ChatRoom'> {
		const isJoined = me.id === room.ownerId || hints.membership != null;
		const canSeeOverride = me.id === room.ownerId || hints.isAdministrator;
		const canManage = hints.isModerator;

		return {
			id: room.id,
			createdAt: this.idService.parse(room.id).date.toISOString(),
			name: room.name,
			description: room.description,
			joinMode: room.joinMode,
			memberLimit: room.memberLimitOverride ?? this.meta.chatRoomDefaultMemberLimit,
			memberLimitOverride: canSeeOverride ? room.memberLimitOverride : undefined,
			canManage,
			messageRetentionDays: canManage ? room.messageRetentionDays : undefined,
			memberCount: hints.memberCount,
			isJoined,
			ownerId: room.ownerId,
			owner: hints.packedOwners.get(room.ownerId)!,
			isMuted: hints.membership != null ? hints.membership.isMuted : false,
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
			this.packRooms(rooms, me)
				.then(rooms => new Map(rooms.map(r => [r.id, r]))),
		]);

		return await Promise.all(memberships.map(membership => this.packRoomMembership(membership, me, { ...options, _hint_: { packedUsers, packedRooms } })));
	}
}
