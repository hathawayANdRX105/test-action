/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as mfm from 'mfm-js';
import * as Redis from 'ioredis';
import { Brackets, In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ChatEntityService } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomInvitationsRepository, ChatRoomMembershipsRepository, ChatRoomsRepository, MiChatMessage, MiChatRoom, MiChatRoomMembership, MiDriveFile, MiUser, MutingsRepository, UsersRepository } from '@/models/_.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { QueryService } from '@/core/QueryService.js';
import { RoleService } from '@/core/RoleService.js';
import { UserFollowingService } from '@/core/UserFollowingService.js';
import { MiChatRoomInvitation } from '@/models/ChatRoomInvitation.js';
import { chatRoomJoinModes, type ChatRoomJoinMode } from '@/models/ChatRoom.js';
import { Packed } from '@/misc/json-schema.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { CustomEmojiService } from '@/core/CustomEmojiService.js';
import { emojiRegex } from '@/misc/emoji-regex.js';
import { NotificationService } from '@/core/NotificationService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { TimeService } from '@/global/TimeService.js';
import { CacheService } from '@/core/CacheService.js';
import { isLocalUser } from '@/models/User.js';
import { MiMeta } from '@/models/Meta.js';
import { AppLockService } from '@/core/AppLockService.js';
import { MfmService } from '@/core/MfmService.js';
import { RemoteUserResolveService } from '@/core/RemoteUserResolveService.js';
import { promiseMap } from '@/misc/promise-map.js';

export const MIN_CHAT_ROOM_MEMBER_LIMIT = 1;
export const MAX_CHAT_ROOM_MEMBER_LIMIT = 10000;
export const LARGE_CHAT_ROOM_MEMBER_THRESHOLD = 500;
export const MIN_CHAT_ROOM_MESSAGE_RETENTION_DAYS = 1;
export const MAX_CHAT_ROOM_MESSAGE_RETENTION_DAYS = 3650;
export const CHAT_ROOM_RETENTION_BATCH_SIZE = 1000;
const ROOM_MEMBER_COUNT_CACHE_TTL = 60;
const MAX_REACTIONS_PER_MESSAGE = 100;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;
type ChatMessageReference = Pick<MiChatMessage, 'id' | 'toUserId' | 'toRoomId'>;

// TODO: ReactionServiceのやつと共通化
function normalizeEmojiString(x: string) {
	const match = emojiRegex.exec(x);
	if (match) {
		// 合字を含む1つの絵文字
		const unicode = match[0];

		// 異体字セレクタ除去
		return unicode.match('\u200d') ? unicode : unicode.replace(/\ufe0f/g, '');
	} else {
		throw new Error('invalid emoji');
	}
}

function normalizeMessageText(text: string | null | undefined): string | null {
	const normalized = text?.trim();
	return normalized && normalized.length > 0 ? normalized : null;
}

@Injectable()
export class ChatService {
	private readonly roomMemberCountLoads = new Map<MiChatRoom['id'], Promise<number>>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.chatMessagesRepository)
		private chatMessagesRepository: ChatMessagesRepository,

		@Inject(DI.chatApprovalsRepository)
		private chatApprovalsRepository: ChatApprovalsRepository,

		@Inject(DI.chatRoomsRepository)
		private chatRoomsRepository: ChatRoomsRepository,

		@Inject(DI.chatRoomInvitationsRepository)
		private chatRoomInvitationsRepository: ChatRoomInvitationsRepository,

		@Inject(DI.chatRoomMembershipsRepository)
		private chatRoomMembershipsRepository: ChatRoomMembershipsRepository,

		@Inject(DI.mutingsRepository)
		private mutingsRepository: MutingsRepository,

		private userEntityService: UserEntityService,
		private chatEntityService: ChatEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private apRendererService: ApRendererService,
		private queueService: QueueService,
		private pushNotificationService: PushNotificationService,
		private notificationService: NotificationService,
		private userBlockingService: UserBlockingService,
		private queryService: QueryService,
		private roleService: RoleService,
		private userFollowingService: UserFollowingService,
		private customEmojiService: CustomEmojiService,
		private moderationLogService: ModerationLogService,
		private readonly timeService: TimeService,
		private readonly cacheService: CacheService,
		private readonly appLockService: AppLockService,
		private readonly mfmService: MfmService,
		private readonly remoteUserResolveService: RemoteUserResolveService,
	) {
	}

	@bindThis
	private async extractMentionedLocalUserIds(text: string | null, selfHost: MiUser['host']): Promise<MiUser['id'][]> {
		if (text == null || !text.includes('@')) return [];

		let nodes: mfm.MfmNode[];
		try {
			nodes = mfm.parse(text);
		} catch {
			return [];
		}

		const mentions = this.mfmService.extractMentions(nodes, selfHost);
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
	private async filterRoomMentionedUserIds(
		room: MiChatRoom,
		senderId: MiUser['id'],
		mentionedUserIds: MiUser['id'][],
	): Promise<MiUser['id'][]> {
		const targetUserIds = Array.from(new Set(mentionedUserIds)).filter(userId => userId !== senderId);
		if (targetUserIds.length === 0) return [];

		const memberUserIds = new Set<MiUser['id']>();
		if (targetUserIds.includes(room.ownerId)) {
			memberUserIds.add(room.ownerId);
		}

		const membershipTargetUserIds = targetUserIds.filter(userId => userId !== room.ownerId);
		if (membershipTargetUserIds.length > 0) {
			const memberships = await this.chatRoomMembershipsRepository.find({
				select: {
					userId: true,
				},
				where: {
					roomId: room.id,
					userId: In(membershipTargetUserIds),
				},
			});

			for (const membership of memberships) {
				memberUserIds.add(membership.userId);
			}
		}

		return targetUserIds.filter(userId => memberUserIds.has(userId));
	}

	@bindThis
	public async getChatAvailability(userId: MiUser['id']): Promise<{ read: boolean; write: boolean; }> {
		const policies = await this.roleService.getUserPolicies(userId);

		switch (policies.chatAvailability) {
			case 'available':
				return {
					read: true,
					write: true,
				};
			case 'readonly':
				return {
					read: true,
					write: false,
				};
			case 'unavailable':
				return {
					read: false,
					write: false,
				};
			default:
				throw new Error('invalid chat availability (unreachable)');
		}
	}

	/** getChatAvailabilityの糖衣。主にAPI呼び出し時に走らせて、権限的に問題ない場合はそのまま続行する */
	@bindThis
	public async checkChatAvailability(userId: MiUser['id'], permission: 'read' | 'write') {
		const policy = await this.getChatAvailability(userId);
		if (policy[permission] === false) {
			throw new Error('ROLE_PERMISSION_DENIED');
		}
	}

	@bindThis
	public async createMessageToUser(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toUser: MiUser, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		reply?: ChatMessageReference | null;
		quote?: ChatMessageReference | null;
	}): Promise<Packed<'ChatMessageLiteFor1on1'>> {
		if (fromUser.id === toUser.id) {
			throw new Error('yourself');
		}

		const approvals = await this.chatApprovalsRepository.createQueryBuilder('approval')
			.where(new Brackets(qb => { // 自分が相手を許可しているか
				qb.where('approval.userId = :fromUserId', { fromUserId: fromUser.id })
					.andWhere('approval.otherId = :toUserId', { toUserId: toUser.id });
			}))
			.orWhere(new Brackets(qb => { // 相手が自分を許可しているか
				qb.where('approval.userId = :toUserId', { toUserId: toUser.id })
					.andWhere('approval.otherId = :fromUserId', { fromUserId: fromUser.id });
			}))
			.take(2)
			.getMany();

		const otherApprovedMe = approvals.some(approval => approval.userId === toUser.id);
		const iApprovedOther = approvals.some(approval => approval.userId === fromUser.id);

		if (!otherApprovedMe) {
			if (toUser.chatScope === 'none') {
				throw new Error('recipient is cannot chat (none)');
			} else if (toUser.chatScope === 'followers') {
				const isFollower = await this.userFollowingService.isFollowing(fromUser.id, toUser.id);
				if (!isFollower) {
					throw new Error('recipient is cannot chat (followers)');
				}
			} else if (toUser.chatScope === 'following') {
				const isFollowing = await this.userFollowingService.isFollowing(toUser.id, fromUser.id);
				if (!isFollowing) {
					throw new Error('recipient is cannot chat (following)');
				}
			} else if (toUser.chatScope === 'mutual') {
				const isMutual = await this.userFollowingService.isMutual(fromUser.id, toUser.id);
				if (!isMutual) {
					throw new Error('recipient is cannot chat (mutual)');
				}
			}
		}

		if (!(await this.getChatAvailability(toUser.id)).write) {
			throw new Error('recipient is cannot chat (policy)');
		}

		const blocked = await this.userBlockingService.checkBlocked(toUser.id, fromUser.id);
		if (blocked) {
			throw new Error('blocked');
		}

		const text = normalizeMessageText(params.text);
		if (text == null && params.file == null && params.reply == null && params.quote == null) {
			throw new Error('content required');
		}

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toUserId: toUser.id,
			text,
			fileId: params.file ? params.file.id : null,
			replyId: params.reply?.id ?? null,
			quoteId: params.quote?.id ?? null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		// 相手を許可しておく
		if (!iApprovedOther) {
			this.chatApprovalsRepository.insertOne({
				id: this.idService.gen(),
				userId: fromUser.id,
				otherId: toUser.id,
			});
		}

		const packedMessage = await this.chatEntityService.packMessageLiteFor1on1(inserted);

		if (isLocalUser(toUser)) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${toUser.id}`, `user:${fromUser.id}`);
			redisPipeline.exec();
		}

		if (isLocalUser(fromUser)) {
			// 自分のストリーム
			this.globalEventService.publishChatUserStream(fromUser.id, toUser.id, 'message', packedMessage);
		}

		if (isLocalUser(toUser)) {
			// 相手のストリーム
			this.globalEventService.publishChatUserStream(toUser.id, fromUser.id, 'message', packedMessage);
		}

		// 3秒経っても既読にならなかったらイベント発行
		if (isLocalUser(toUser)) {
			this.timeService.startTimer(async () => {
				const marker = await this.redisClient.get(`newUserChatMessageExists:${toUser.id}:${fromUser.id}`);

				if (marker == null) return; // 既読

				const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, toUser);
				this.globalEventService.publishMainStream(toUser.id, 'newChatMessage', packedMessageForTo);
				this.pushNotificationService.pushNotification(toUser.id, 'newChatMessage', packedMessageForTo);
			}, 3000);
		}

		return packedMessage;
	}

	@bindThis
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: MiChatRoom, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		reply?: ChatMessageReference | null;
		quote?: ChatMessageReference | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const [membershipsCount, senderMembership] = await Promise.all([
			this.getRoomMembersCountForMessageFanout(toRoom.id),
			toRoom.ownerId === fromUser.id ? Promise.resolve({ userId: fromUser.id, isMuted: false }) : this.chatRoomMembershipsRepository.findOne({
				select: { userId: true, isMuted: true },
				where: { roomId: toRoom.id, userId: fromUser.id },
			}),
		]);

		if (senderMembership == null) throw new Error('you are not a member of the room');

		const isLargeRoom = membershipsCount > LARGE_CHAT_ROOM_MEMBER_THRESHOLD;

		const text = normalizeMessageText(params.text);
		if (text == null && params.file == null && params.reply == null && params.quote == null) {
			throw new Error('content required');
		}
		const mentionedUserIds = await this.filterRoomMentionedUserIds(
			toRoom,
			fromUser.id,
			await this.extractMentionedLocalUserIds(text, fromUser.host),
		);
		const mentionedUserIdSet = new Set(mentionedUserIds);

		const message = {
			id: this.idService.gen(),
			fromUserId: fromUser.id,
			toRoomId: toRoom.id,
			text,
			fileId: params.file ? params.file.id : null,
			replyId: params.reply?.id ?? null,
			quoteId: params.quote?.id ?? null,
			reads: [],
			uri: params.uri ?? null,
		} satisfies Partial<MiChatMessage>;

		const inserted = await this.chatMessagesRepository.insertOne(message);

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted);

		this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		if (isLargeRoom) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`latestRoomChatMessage:${toRoom.id}`, message.id, 'EX', 60 * 60 * 24 * 30);
			for (const userId of mentionedUserIds) {
				redisPipeline.set(`newRoomChatMentionExists:${userId}:${toRoom.id}`, message.id);
				redisPipeline.sadd(`newChatMessagesExists:${userId}`, `room:${toRoom.id}`);
			}
			await redisPipeline.exec();

			if (mentionedUserIds.length > 0) {
				this.timeService.startTimer(async () => {
					const redisPipeline = this.redisClient.pipeline();
					for (const userId of mentionedUserIds) {
						redisPipeline.get(`newRoomChatMentionExists:${userId}:${toRoom.id}`);
					}
					const markers = await redisPipeline.exec();
					if (markers == null) throw new Error('redis error');

					if (markers.every(marker => marker[1] == null)) return;

					const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);

					for (let i = 0; i < mentionedUserIds.length; i++) {
						const marker = markers[i][1];
						if (marker == null) continue;

						const messageForRecipient = {
							...packedMessageForTo,
							hasMentionForMe: true,
						};
						this.globalEventService.publishMainStream(mentionedUserIds[i], 'newChatMessage', messageForRecipient);
						this.pushNotificationService.pushNotification(mentionedUserIds[i], 'newChatMessage', messageForRecipient);
					}
				}, 3000);
			}

			return packedMessage;
		}

		const memberships = (await this.chatRoomMembershipsRepository.findBy({ roomId: toRoom.id })).map(m => ({
			userId: m.userId,
			isMuted: m.isMuted,
		})).concat({ // ownerはmembershipレコードを作らないため
			userId: toRoom.ownerId,
			isMuted: false,
		});
		const membershipsOtherThanMe = memberships.filter(member => member.userId !== fromUser.id);

		const redisPipeline = this.redisClient.pipeline();
		for (const membership of membershipsOtherThanMe) {
			const hasMention = mentionedUserIdSet.has(membership.userId);
			if (membership.isMuted && !hasMention) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
			if (hasMention) {
				redisPipeline.set(`newRoomChatMentionExists:${membership.userId}:${toRoom.id}`, message.id);
			}
		}
		redisPipeline.exec();

		// 3秒経っても既読にならなかったらイベント発行
		this.timeService.startTimer(async () => {
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted);

			for (let i = 0; i < membershipsOtherThanMe.length; i++) {
				const marker = markers[i][1];
				if (marker == null) continue;

				const userId = membershipsOtherThanMe[i].userId;
				const messageForRecipient = {
					...packedMessageForTo,
					hasMentionForMe: mentionedUserIdSet.has(userId),
				};
				this.globalEventService.publishMainStream(userId, 'newChatMessage', messageForRecipient);
				this.pushNotificationService.pushNotification(userId, 'newChatMessage', messageForRecipient);
			}
		}, 3000);

		return packedMessage;
	}

	@bindThis
	public async readUserChatMessage(
		readerId: MiUser['id'],
		senderId: MiUser['id'],
	): Promise<void> {
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newUserChatMessageExists:${readerId}:${senderId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `user:${senderId}`);
		await redisPipeline.exec();
	}

	@bindThis
	public async readRoomChatMessage(
		readerId: MiUser['id'],
		roomId: MiChatRoom['id'],
	): Promise<void> {
		const latestRoomMessageId = await this.redisClient.get(`latestRoomChatMessage:${roomId}`);
		const redisPipeline = this.redisClient.pipeline();
		redisPipeline.del(`newRoomChatMessageExists:${readerId}:${roomId}`);
		redisPipeline.del(`newRoomChatMentionExists:${readerId}:${roomId}`);
		redisPipeline.srem(`newChatMessagesExists:${readerId}`, `room:${roomId}`);
		if (latestRoomMessageId != null) {
			redisPipeline.set(`readRoomChatMessage:${readerId}:${roomId}`, latestRoomMessageId, 'EX', 60 * 60 * 24 * 30);
		}
		await redisPipeline.exec();
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public async hasPermissionToManageRoom(me: MiUser, room: MiChatRoom) {
		return await this.roleService.isModerator(me);
	}

	@bindThis
	public async hasPermissionToDeleteMessage(me: MiUser, message: MiChatMessage) {
		if (message.fromUserId === me.id) return true;
		if (message.toRoomId != null) {
			const room = await this.chatRoomsRepository.findOneBy({ id: message.toRoomId });
			if (room == null) return false;
			return await this.hasPermissionToManageRoom(me, room);
		}
		if (message.toUserId != null) {
			return await this.roleService.isModerator(me);
		}
		return false;
	}

	@bindThis
	public findMyMessageById(userId: MiUser['id'], messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId, fromUserId: userId });
	}

	@bindThis
	public async hasPermissionToViewRoomTimeline(me: MiUser, room: MiChatRoom) {
		if (await this.isRoomMember(room, me.id)) {
			return true;
		} else {
			const iAmModerator = await this.roleService.isModerator(me);
			if (iAmModerator) {
				return true;
			}

			return false;
		}
	}

	@bindThis
	public async deleteMessage(message: MiChatMessage) {
		await this.chatMessagesRepository.delete(message.id);

		if (message.toUserId) {
			const [fromUser, toUser] = await Promise.all([
				this.cacheService.findUserById(message.fromUserId),
				this.cacheService.findUserById(message.toUserId),
			]);

			if (isLocalUser(fromUser)) this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId, 'deleted', message.id);
			if (isLocalUser(toUser)) this.globalEventService.publishChatUserStream(message.toUserId, message.fromUserId, 'deleted', message.id);

			if (isLocalUser(fromUser) && this.userEntityService.isRemoteUser(toUser)) {
				//const activity = this.apRendererService.addContext(this.apRendererService.renderDelete(this.apRendererService.renderTombstone(`${this.config.url}/notes/${message.id}`), fromUser));
				//this.queueService.deliver(fromUser, activity, toUser.inbox);
			}
		} else if (message.toRoomId) {
			this.globalEventService.publishChatRoomStream(message.toRoomId, 'deleted', message.id);
		}
	}

	@bindThis
	private assertValidRoomMessageRetentionDays(days: number) {
		if (!Number.isInteger(days) || days < MIN_CHAT_ROOM_MESSAGE_RETENTION_DAYS || days > MAX_CHAT_ROOM_MESSAGE_RETENTION_DAYS) {
			throw new Error('invalid chat room message retention days');
		}
	}

	@bindThis
	public async updateRoomMessageRetentionDays(room: MiChatRoom, messageRetentionDays: number | null): Promise<MiChatRoom> {
		if (messageRetentionDays != null) {
			this.assertValidRoomMessageRetentionDays(messageRetentionDays);
		}

		return this.chatRoomsRepository.createQueryBuilder().update()
			.set({ messageRetentionDays })
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
	}

	@bindThis
	public async deleteAllRoomMessages(room: MiChatRoom): Promise<void> {
		await this.chatMessagesRepository.delete({ toRoomId: room.id });

		const redisPipeline = this.redisClient.pipeline();
		const memberships = await this.chatRoomMembershipsRepository.findBy({ roomId: room.id });
		const memberUserIds = Array.from(new Set([...memberships.map(membership => membership.userId), room.ownerId]));
		for (const userId of memberUserIds) {
			redisPipeline.del(`newRoomChatMessageExists:${userId}:${room.id}`);
			redisPipeline.del(`newRoomChatMentionExists:${userId}:${room.id}`);
			redisPipeline.del(`readRoomChatMessage:${userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${room.id}`);
		}
		redisPipeline.del(`latestRoomChatMessage:${room.id}`);
		await redisPipeline.exec();

		this.globalEventService.publishChatRoomStream(room.id, 'cleared', null);
	}

	@bindThis
	public async deleteRoomMessagesByUser(room: MiChatRoom, userId: MiUser['id']): Promise<MiChatMessage['id'][]> {
		const targets = await this.chatMessagesRepository
			.createQueryBuilder('message')
			.select('message.id', 'id')
			.where('message.toRoomId = :roomId', { roomId: room.id })
			.andWhere('message.fromUserId = :userId', { userId })
			.orderBy('message.id', 'ASC')
			.getRawMany<{ id: MiChatMessage['id']; }>();

		const ids = targets.map(target => target.id);
		if (ids.length === 0) return [];

		await this.chatMessagesRepository.delete(ids);

		const redisPipeline = this.redisClient.pipeline();
		const memberships = await this.chatRoomMembershipsRepository.findBy({ roomId: room.id });
		const memberUserIds = Array.from(new Set([...memberships.map(membership => membership.userId), room.ownerId]));
		for (const memberUserId of memberUserIds) {
			redisPipeline.del(`newRoomChatMessageExists:${memberUserId}:${room.id}`);
			redisPipeline.del(`newRoomChatMentionExists:${memberUserId}:${room.id}`);
			redisPipeline.del(`readRoomChatMessage:${memberUserId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${memberUserId}`, `room:${room.id}`);
		}

		const latestRoomMessageId = await this.chatMessagesRepository
			.createQueryBuilder('message')
			.select('message.id', 'id')
			.where('message.toRoomId = :roomId', { roomId: room.id })
			.orderBy('message.id', 'DESC')
			.limit(1)
			.getRawOne<{ id: MiChatMessage['id']; }>();
		if (latestRoomMessageId == null) {
			redisPipeline.del(`latestRoomChatMessage:${room.id}`);
		} else {
			redisPipeline.set(`latestRoomChatMessage:${room.id}`, latestRoomMessageId.id, 'EX', 60 * 60 * 24 * 30);
		}
		await redisPipeline.exec();

		this.globalEventService.publishChatRoomStream(room.id, 'deletedMany', ids);
		return ids;
	}

	@bindThis
	public async pruneRoomMessages(room: MiChatRoom, cutoffId: MiChatMessage['id'], limit = CHAT_ROOM_RETENTION_BATCH_SIZE): Promise<number> {
		const targets = await this.chatMessagesRepository
			.createQueryBuilder('message')
			.select('message.id', 'id')
			.where('message.toRoomId = :roomId', { roomId: room.id })
			.andWhere('message.id < :cutoffId', { cutoffId })
			.orderBy('message.id', 'ASC')
			.limit(limit)
			.getRawMany<{ id: MiChatMessage['id']; }>();

		if (targets.length === 0) return 0;

		const deleteResult = await this.chatMessagesRepository.delete(targets.map(target => target.id));
		const deleted = deleteResult.affected ?? targets.length;
		if (deleted > 0) {
			this.globalEventService.publishChatRoomStream(room.id, 'pruned', { cutoffId });
		}
		return deleted;
	}

	@bindThis
	public async getRoomMessageStats(room: MiChatRoom, days: number): Promise<{
		total: number;
		oldestAt: string | null;
		newestAt: string | null;
		daily: { date: string; count: number; }[];
	}> {
		const totalPromise = this.chatMessagesRepository.countBy({ toRoomId: room.id });
		const newestPromise = this.chatMessagesRepository.findOne({
			select: { id: true },
			where: { toRoomId: room.id },
			order: { id: 'DESC' },
		});
		const oldestPromise = this.chatMessagesRepository.findOne({
			select: { id: true },
			where: { toRoomId: room.id },
			order: { id: 'ASC' },
		});

		const daily: { date: string; count: number; }[] = [];
		const today = new Date(this.timeService.now);
		today.setUTCHours(0, 0, 0, 0);

		for (let i = days - 1; i >= 0; i--) {
			const start = new Date(today);
			start.setUTCDate(today.getUTCDate() - i);
			const end = new Date(start);
			end.setUTCDate(start.getUTCDate() + 1);
			const sinceId = this.idService.gen(start.getTime());
			const untilId = this.idService.gen(end.getTime());
			const count = await this.chatMessagesRepository
				.createQueryBuilder('message')
				.where('message.toRoomId = :roomId', { roomId: room.id })
				.andWhere('message.id >= :sinceId', { sinceId })
				.andWhere('message.id < :untilId', { untilId })
				.getCount();

			daily.push({
				date: start.toISOString().slice(0, 10),
				count,
			});
		}

		const [total, newest, oldest] = await Promise.all([totalPromise, newestPromise, oldestPromise]);

		return {
			total,
			oldestAt: oldest == null ? null : this.idService.parse(oldest.id).date.toISOString(),
			newestAt: newest == null ? null : this.idService.parse(newest.id).date.toISOString(),
			daily,
		};
	}

	@bindThis
	public async userTimeline(meId: MiUser['id'], otherId: MiUser['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.reply', 'reply')
			.leftJoinAndSelect('reply.file', 'replyFile')
			.leftJoinAndSelect('reply.fromUser', 'replyFromUser')
			.leftJoinAndSelect('message.quote', 'quote')
			.leftJoinAndSelect('quote.file', 'quoteFile')
			.leftJoinAndSelect('quote.fromUser', 'quoteFromUser')
			.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
			.setParameter('meId', meId)
			.setParameter('otherId', otherId);

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async roomTimeline(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatMessagesRepository.createQueryBuilder('message'), sinceId, untilId)
			.andWhere('message.toRoomId = :roomId', { roomId })
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser')
			.leftJoinAndSelect('message.reply', 'reply')
			.leftJoinAndSelect('reply.file', 'replyFile')
			.leftJoinAndSelect('reply.fromUser', 'replyFromUser')
			.leftJoinAndSelect('message.quote', 'quote')
			.leftJoinAndSelect('quote.file', 'quoteFile')
			.leftJoinAndSelect('quote.fromUser', 'quoteFromUser');

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	private withMessageRelations(query = this.chatMessagesRepository.createQueryBuilder('message')) {
		return query
			.leftJoinAndSelect('message.file', 'file')
			.leftJoinAndSelect('message.fromUser', 'fromUser')
			.leftJoinAndSelect('message.toUser', 'toUser')
			.leftJoinAndSelect('message.toRoom', 'toRoom')
			.leftJoinAndSelect('toRoom.owner', 'toRoomOwner')
			.leftJoinAndSelect('message.reply', 'reply')
			.leftJoinAndSelect('reply.file', 'replyFile')
			.leftJoinAndSelect('reply.fromUser', 'replyFromUser')
			.leftJoinAndSelect('message.quote', 'quote')
			.leftJoinAndSelect('quote.file', 'quoteFile')
			.leftJoinAndSelect('quote.fromUser', 'quoteFromUser');
	}

	@bindThis
	public async messageContext(message: MiChatMessage, limitBefore: number, limitAfter: number) {
		const addScope = (query = this.withMessageRelations()) => {
			if (message.toRoomId != null) {
				return query.andWhere('message.toRoomId = :roomId', { roomId: message.toRoomId });
			}

			return query.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :fromUserId')
							.andWhere('message.toUserId = :toUserId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :toUserId')
							.andWhere('message.toUserId = :fromUserId');
					}));
			}))
				.setParameter('fromUserId', message.fromUserId)
				.setParameter('toUserId', message.toUserId);
		};

		const before = await addScope()
			.andWhere('message.id < :messageId', { messageId: message.id })
			.orderBy('message.id', 'DESC')
			.take(limitBefore + 1)
			.getMany();

		const after = await addScope()
			.andWhere('message.id > :messageId', { messageId: message.id })
			.orderBy('message.id', 'ASC')
			.take(limitAfter + 1)
			.getMany();

		return {
			before: before.slice(0, limitBefore),
			target: message,
			after: after.slice(0, limitAfter).reverse(),
			hasMoreBefore: before.length > limitBefore,
			hasMoreAfter: after.length > limitAfter,
		};
	}

	@bindThis
	public async userHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const history: MiChatMessage[] = [];

		const mutingQuery = this.mutingsRepository.createQueryBuilder('muting')
			.select('muting.muteeId')
			.where('muting.muterId = :muterId', { muterId: meId });

		for (let i = 0; i < limit; i++) {
			const found = history.map(m => (m.fromUserId === meId) ? m.toUserId! : m.fromUserId!);

			const query = this.chatMessagesRepository.createQueryBuilder('message')
				.orderBy('message.id', 'DESC')
				.where(new Brackets(qb => {
					qb
						.where('message.fromUserId = :meId', { meId: meId })
						.orWhere('message.toUserId = :meId', { meId: meId });
				}))
				.andWhere('message.toRoomId IS NULL')
				.andWhere(`message.fromUserId NOT IN (${ mutingQuery.getQuery() })`)
				.andWhere(`message.toUserId NOT IN (${ mutingQuery.getQuery() })`);

			if (found.length > 0) {
				query.andWhere('message.fromUserId NOT IN (:...found)', { found: found });
				query.andWhere('message.toUserId NOT IN (:...found)', { found: found });
			}

			query.setParameters(mutingQuery.getParameters());

			const message = await query.getOne();

			if (message) {
				history.push(message);
			} else {
				break;
			}
		}

		return history;
	}

	@bindThis
	public async roomHistory(meId: MiUser['id'], limit: number): Promise<MiChatMessage[]> {
		const memberRoomsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
			.select('membership.roomId')
			.where('membership.userId = :meId', { meId });

		const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
			.select('room.id')
			.where('room.ownerId = :meId', { meId });

		const latestMessageIdsQuery = this.chatMessagesRepository.createQueryBuilder('latest')
			.distinctOn(['latest.toRoomId'])
			.select('latest.id')
			.where(new Brackets(qb => {
				qb
					.where(`latest.toRoomId IN (${memberRoomsQuery.getQuery()})`)
					.orWhere(`latest.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}))
			.orderBy('latest.toRoomId', 'ASC')
			.addOrderBy('latest.id', 'DESC')
			.setParameters(memberRoomsQuery.getParameters())
			.setParameters(ownedRoomsQuery.getParameters());

		return await this.chatMessagesRepository.createQueryBuilder('message')
			.where(`message.id IN (${latestMessageIdsQuery.getQuery()})`)
			.orderBy('message.id', 'DESC')
			.take(limit)
			.setParameters(latestMessageIdsQuery.getParameters())
			.getMany();
	}

	@bindThis
	public async getUserReadStateMap(userId: MiUser['id'], otherIds: MiUser['id'][]) {
		const readStateMap: Record<MiUser['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const otherId of otherIds) {
			redisPipeline.get(`newUserChatMessageExists:${userId}:${otherId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i][1];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMessageExists:${userId}:${roomId}`);
			redisPipeline.get(`latestRoomChatMessage:${roomId}`);
			redisPipeline.get(`readRoomChatMessage:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i * 3][1];
			const latestRoomMessageId = markers[(i * 3) + 1][1];
			const readRoomMessageId = markers[(i * 3) + 2][1];
			readStateMap[roomIds[i]] = marker == null && (latestRoomMessageId == null || latestRoomMessageId === readRoomMessageId);
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomMentionStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const mentionStateMap: Record<MiChatRoom['id'], boolean> = {};
		if (roomIds.length === 0) return mentionStateMap;

		const redisPipeline = this.redisClient.pipeline();

		for (const roomId of roomIds) {
			redisPipeline.get(`newRoomChatMentionExists:${userId}:${roomId}`);
		}

		const markers = await redisPipeline.exec();
		if (markers == null) throw new Error('redis error');

		for (let i = 0; i < roomIds.length; i++) {
			mentionStateMap[roomIds[i]] = markers[i][1] != null;
		}

		return mentionStateMap;
	}

	@bindThis
	public async hasUnreadMessages(userId: MiUser['id']) {
		const card = await this.redisClient.scard(`newChatMessagesExists:${userId}`);
		return card > 0;
	}

	@bindThis
	public async createRoom(owner: MiUser, params: Partial<{
		name: string;
		description: string;
		joinMode: ChatRoomJoinMode;
	}>) {
		const room = {
			id: this.idService.gen(),
			name: params.name,
			description: params.description,
			joinMode: params.joinMode ?? 'inviteOnly',
			ownerId: owner.id,
		} satisfies Partial<MiChatRoom>;

		const created = await this.chatRoomsRepository.insertOne(room);

		return created;
	}

	@bindThis
	public assertValidRoomMemberLimit(value: number) {
		if (!Number.isInteger(value) || value < MIN_CHAT_ROOM_MEMBER_LIMIT || value > MAX_CHAT_ROOM_MEMBER_LIMIT) {
			throw new Error('invalid member limit');
		}
	}

	@bindThis
	public getEffectiveRoomMemberLimit(room: MiChatRoom) {
		return room.memberLimitOverride ?? this.meta.chatRoomDefaultMemberLimit;
	}

	@bindThis
	public async getRoomMembersCount(roomId: MiChatRoom['id']) {
		return await this.chatRoomMembershipsRepository.countBy({ roomId }) + 1;
	}

	@bindThis
	private async getRoomMembersCountForMessageFanout(roomId: MiChatRoom['id']) {
		const cacheKey = `chatRoomMembersCount:${roomId}`;
		const cached = await this.redisClient.get(cacheKey);
		if (cached != null) {
			const parsed = Number.parseInt(cached, 10);
			if (Number.isSafeInteger(parsed) && parsed >= MIN_CHAT_ROOM_MEMBER_LIMIT) return parsed;
		}

		const loading = this.roomMemberCountLoads.get(roomId);
		if (loading) return await loading;

		const load = (async () => {
			const count = await this.getRoomMembersCount(roomId);
			await this.redisClient.set(cacheKey, count.toString(), 'EX', ROOM_MEMBER_COUNT_CACHE_TTL);
			return count;
		})();
		this.roomMemberCountLoads.set(roomId, load);

		try {
			return await load;
		} finally {
			this.roomMemberCountLoads.delete(roomId);
		}
	}

	@bindThis
	private async deleteRoomMembersCountCache(roomId: MiChatRoom['id']) {
		this.roomMemberCountLoads.delete(roomId);
		await this.redisClient.del(`chatRoomMembersCount:${roomId}`);
	}

	@bindThis
	public async hasPermissionToDeleteRoom(me: MiUser, room: MiChatRoom) {
		if (room.ownerId === me.id) {
			return true;
		}

		const iAmModerator = await this.roleService.isModerator(me);
		if (iAmModerator) {
			return true;
		}

		return false;
	}

	@bindThis
	public async deleteRoom(room: MiChatRoom, deleter?: MiUser) {
		await this.chatRoomsRepository.delete(room.id);
		await this.deleteRoomMembersCountCache(room.id);

		// Erase any message notifications for this room
		const redisPipeline = this.redisClient.pipeline();
		const memberships = await this.chatRoomMembershipsRepository.findBy({ roomId: room.id });
		const memberUserIds = Array.from(new Set([...memberships.map(membership => membership.userId), room.ownerId]));
		for (const userId of memberUserIds) {
			redisPipeline.del(`newRoomChatMessageExists:${userId}:${room.id}`);
			redisPipeline.del(`newRoomChatMentionExists:${userId}:${room.id}`);
			redisPipeline.srem(`newChatMessagesExists:${userId}`, `room:${room.id}`);
		}
		await redisPipeline.exec();

		if (deleter) {
			const deleterIsModerator = await this.roleService.isModerator(deleter);

			if (deleterIsModerator) {
				await this.moderationLogService.log(deleter, 'deleteChatRoom', {
					roomId: room.id,
					room: room,
				});
			}
		}
	}

	@bindThis
	public async findMyRoomById(ownerId: MiUser['id'], roomId: MiChatRoom['id']) {
		return await this.chatRoomsRepository.findOneBy({ id: roomId, ownerId: ownerId });
	}

	@bindThis
	public async findRoomById(roomId: MiChatRoom['id']) {
		return await this.chatRoomsRepository.findOne({ where: { id: roomId }, relations: ['owner'] });
	}

	@bindThis
	public async isRoomMember(room: MiChatRoom, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;
		const membership = await this.chatRoomMembershipsRepository.findOneBy({ roomId: room.id, userId });
		return membership != null;
	}

	@bindThis
	public async createRoomInvitation(inviterId: MiUser['id'], roomId: MiChatRoom['id'], inviteeId: MiUser['id']) {
		if (inviterId === inviteeId) {
			throw new Error('yourself');
		}

		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId, ownerId: inviterId });

		if (room.joinMode === 'closed') {
			throw new Error('joining disabled');
		}

		if (await this.isRoomMember(room, inviteeId)) {
			throw new Error('already member');
		}

		const existingInvitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId: inviteeId });
		if (existingInvitation) {
			throw new Error('already invited');
		}

		const membershipsCount = await this.getRoomMembersCount(roomId);
		if (membershipsCount >= this.getEffectiveRoomMemberLimit(room)) {
			throw new Error('room is full');
		}

		// TODO: cehck block

		const invitation = {
			id: this.idService.gen(),
			roomId: room.id,
			userId: inviteeId,
		} satisfies Partial<MiChatRoomInvitation>;

		const created = await this.chatRoomInvitationsRepository.insertOne(invitation);

		this.notificationService.createNotification(inviteeId, 'chatRoomInvitationReceived', {
			invitationId: invitation.id,
		}, inviterId);

		return created;
	}

	@bindThis
	public async getSentRoomInvitationsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.roomId = :roomId', { roomId });

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async getOwnedRoomsWithPagination(ownerId: MiUser['id'], limit: number, sinceId?: MiChatRoom['id'] | null, untilId?: MiChatRoom['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomsRepository.createQueryBuilder('room'), sinceId, untilId)
			.andWhere('room.ownerId = :ownerId', { ownerId });

		const rooms = await query.take(limit).getMany();

		return rooms;
	}

	@bindThis
	public async getReceivedRoomInvitationsWithPagination(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomInvitation['id'] | null, untilId?: MiChatRoomInvitation['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomInvitationsRepository.createQueryBuilder('invitation'), sinceId, untilId)
			.andWhere('invitation.userId = :userId', { userId })
			.andWhere('invitation.ignored = FALSE');

		const invitations = await query.take(limit).getMany();

		return invitations;
	}

	@bindThis
	public async joinToRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const room = await this.chatRoomsRepository.findOneByOrFail({ id: roomId });

		if (room.joinMode === 'closed') {
			throw new Error('joining disabled');
		}

		const invitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId });
		if (invitation == null && room.joinMode !== 'open') {
			throw new Error('invitation required');
		}

		const unlock = await this.appLockService.getChatRoomJoinLock(roomId);
		try {
			if (await this.isRoomMember(room, userId)) {
				throw new Error('already member');
			}

			const membershipsCount = await this.getRoomMembersCount(roomId);
			if (membershipsCount >= this.getEffectiveRoomMemberLimit(room)) {
				throw new Error('room is full');
			}

			const membership = {
				id: this.idService.gen(),
				roomId: roomId,
				userId: userId,
			} satisfies Partial<MiChatRoomMembership>;

			await this.chatRoomMembershipsRepository.insertOne(membership);
			await this.deleteRoomMembersCountCache(roomId);
			if (invitation != null) {
				await this.chatRoomInvitationsRepository.delete(invitation.id);
			}
		} finally {
			await unlock();
		}
	}

	@bindThis
	public async ignoreRoomInvitation(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const invitation = await this.chatRoomInvitationsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomInvitationsRepository.update(invitation.id, { ignored: true });
	}

	@bindThis
	public async leaveRoom(userId: MiUser['id'], roomId: MiChatRoom['id']) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.delete(membership.id);
		await this.deleteRoomMembersCountCache(roomId);
	}

	@bindThis
	public async muteRoom(userId: MiUser['id'], roomId: MiChatRoom['id'], mute: boolean) {
		const membership = await this.chatRoomMembershipsRepository.findOneByOrFail({ roomId, userId });
		await this.chatRoomMembershipsRepository.update(membership.id, { isMuted: mute });
	}

	@bindThis
	public async updateRoom(room: MiChatRoom, params: {
		name?: string;
		description?: string;
		joinMode?: ChatRoomJoinMode;
	}): Promise<MiChatRoom> {
		if (params.joinMode != null && !chatRoomJoinModes.includes(params.joinMode)) {
			throw new Error('invalid join mode');
		}

		return this.chatRoomsRepository.createQueryBuilder().update()
			.set(params)
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
	}

	@bindThis
	public async updateRoomMemberLimitOverride(room: MiChatRoom, memberLimitOverride: number | null): Promise<MiChatRoom> {
		if (memberLimitOverride != null) {
			this.assertValidRoomMemberLimit(memberLimitOverride);
		}

		return this.chatRoomsRepository.createQueryBuilder().update()
			.set({ memberLimitOverride })
			.where('id = :id', { id: room.id })
			.returning('*')
			.execute()
			.then((response) => {
				return response.raw[0];
			});
	}

	@bindThis
	public async getRoomMembershipsWithPagination(roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.roomId = :roomId', { roomId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}

	@bindThis
	public async searchMessages(meId: MiUser['id'], query: string, limit: number, params: {
		userId?: MiUser['id'] | null;
		roomId?: MiChatRoom['id'] | null;
		untilId?: MiChatMessage['id'] | null;
		fromUserId?: MiUser['id'] | null;
	}) {
		const q = this.chatMessagesRepository.createQueryBuilder('message');

		if (params.userId) {
			q.andWhere(new Brackets(qb => {
				qb
					.where(new Brackets(qb => {
						qb
							.where('message.fromUserId = :meId')
							.andWhere('message.toUserId = :otherId');
					}))
					.orWhere(new Brackets(qb => {
						qb
							.where('message.fromUserId = :otherId')
							.andWhere('message.toUserId = :meId');
					}));
			}))
				.setParameter('meId', meId)
				.setParameter('otherId', params.userId);
		} else if (params.roomId) {
			q.where('message.toRoomId = :roomId', { roomId: params.roomId });
		} else {
			const membershipsQuery = this.chatRoomMembershipsRepository.createQueryBuilder('membership')
				.select('membership.roomId')
				.where('membership.userId = :meId', { meId: meId });

			const ownedRoomsQuery = this.chatRoomsRepository.createQueryBuilder('room')
				.select('room.id')
				.where('room.ownerId = :meId', { meId });

			q.andWhere(new Brackets(qb => {
				qb
					.where('message.fromUserId = :meId')
					.orWhere('message.toUserId = :meId')
					.orWhere(`message.toRoomId IN (${membershipsQuery.getQuery()})`)
					.orWhere(`message.toRoomId IN (${ownedRoomsQuery.getQuery()})`);
			}));

			q.setParameters(membershipsQuery.getParameters());
			q.setParameters(ownedRoomsQuery.getParameters());
		}

		if (params.untilId) {
			q.andWhere('message.id < :untilId', { untilId: params.untilId });
		}

		if (params.fromUserId) {
			q.andWhere('message.fromUserId = :fromUserId', { fromUserId: params.fromUserId });
		}

		q.andWhere('message.text IS NOT NULL');
		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(query.toLowerCase()) }%` });

		q.leftJoinAndSelect('message.file', 'file');
		q.leftJoinAndSelect('message.fromUser', 'fromUser');
		q.leftJoinAndSelect('message.toUser', 'toUser');
		q.leftJoinAndSelect('message.toRoom', 'toRoom');
		q.leftJoinAndSelect('toRoom.owner', 'toRoomOwner');

		const messages = await q.orderBy('message.id', 'DESC').take(limit).getMany();

		return messages;
	}

	@bindThis
	public async react(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else {
			const name = custom[1];
			const emoji = await this.customEmojiService.emojisByKeyCache.fetchMaybe(name);

			if (emoji == null) {
				throw new Error('no such emoji');
			} else {
				reaction = `:${name}:`;
			}
		}

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		if (message.fromUserId === userId) {
			throw new Error('cannot react to own message');
		}

		if (message.toRoomId === null && message.toUserId !== userId) {
			throw new Error('cannot react to others message');
		}

		if (message.reactions.length >= MAX_REACTIONS_PER_MESSAGE) {
			throw new Error('too many reactions');
		}

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;

		if (room) {
			if (!await this.isRoomMember(room, userId)) {
				throw new Error('cannot react to others message');
			}
		}

		await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => 'array_append("reactions", :reactionRecord)',
			})
			.where('id = :id', { id: message.id })
			.andWhere('NOT (:reactionRecord = ANY("reactions"))')
			.andWhere('cardinality("reactions") < :maxReactions')
			.setParameter('reactionRecord', `${userId}/${reaction}`)
			.setParameter('maxReactions', MAX_REACTIONS_PER_MESSAGE)
			.execute()
			.then(result => {
				if (result.affected === 0) throw new Error('reaction not changed');
			});

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'react', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'react', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async unreact(messageId: MiChatMessage['id'], userId: MiUser['id'], reaction_: string) {
		let reaction;

		const custom = reaction_.match(isCustomEmojiRegexp);

		if (custom == null) {
			reaction = normalizeEmojiString(reaction_);
		} else { // 削除されたカスタム絵文字のリアクションを削除したいかもしれないので絵文字の存在チェックはする必要なし
			const name = custom[1];
			reaction = `:${name}:`;
		}

		// NOTE: 自分のリアクションを(あれば)削除するだけなので諸々の権限チェックは必要なし

		const message = await this.chatMessagesRepository.findOneByOrFail({ id: messageId });

		const room = message.toRoomId ? await this.chatRoomsRepository.findOneByOrFail({ id: message.toRoomId }) : null;
		if (room) {
			if (!await this.isRoomMember(room, userId)) {
				throw new Error('cannot react to others message');
			}
		} else if (message.toUserId !== userId) {
			throw new Error('cannot react to others message');
		}

		const updated = await this.chatMessagesRepository.createQueryBuilder().update()
			.set({
				reactions: () => 'array_remove("reactions", :reactionRecord)',
			})
			.where('id = :id', { id: message.id })
			.andWhere(':reactionRecord = ANY("reactions")')
			.setParameter('reactionRecord', `${userId}/${reaction}`)
			.execute();

		if (updated.affected === 0) return;

		if (room) {
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: await this.userEntityService.pack(userId),
				reaction,
			});
		} else {
			this.globalEventService.publishChatUserStream(message.fromUserId, message.toUserId!, 'unreact', {
				messageId: message.id,
				reaction,
			});
			this.globalEventService.publishChatUserStream(message.toUserId!, message.fromUserId, 'unreact', {
				messageId: message.id,
				reaction,
			});
		}
	}

	@bindThis
	public async getMyMemberships(userId: MiUser['id'], limit: number, sinceId?: MiChatRoomMembership['id'] | null, untilId?: MiChatRoomMembership['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomMembershipsRepository.createQueryBuilder('membership'), sinceId, untilId)
			.andWhere('membership.userId = :userId', { userId });

		const memberships = await query.take(limit).getMany();

		return memberships;
	}
}
