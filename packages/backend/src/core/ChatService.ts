/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import * as mfm from 'mfm-js';
import * as Redis from 'ioredis';
import { Brackets, In, type ObjectLiteral, type SelectQueryBuilder } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { QueueService } from '@/core/QueueService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { CHAT_MESSAGE_MENTION_CACHE_TTL, ChatEntityService, chatMessageMentionCacheKey } from '@/core/entities/ChatEntityService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { bindThis } from '@/decorators.js';
import type { ChatApprovalsRepository, ChatMessagesRepository, ChatRoomInvitationsRepository, ChatRoomMembershipsRepository, ChatRoomUserMutingsRepository, ChatRoomsRepository, MiChatMessage, MiChatRoom, MiChatRoomMembership, MiChatRoomUserMuting, MiDriveFile, MiUser, MutingsRepository, UsersRepository } from '@/models/_.js';
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
const ROOM_MESSAGE_TARGET_CACHE_TTL = 60;
const ROOM_SENDER_MEMBERSHIP_CACHE_TTL = 10;
const ROOM_MESSAGE_TARGET_CACHE_TTL_MS = ROOM_MESSAGE_TARGET_CACHE_TTL * 1000;
const ROOM_SENDER_MEMBERSHIP_CACHE_TTL_MS = ROOM_SENDER_MEMBERSHIP_CACHE_TTL * 1000;
const MAX_REACTIONS_PER_MESSAGE = 100;
const ROOM_CHAT_MESSAGE_READ_TTL = 60 * 60 * 24 * 30;
const ROOM_TIMELINE_CACHE_LIMIT = 300;
const ROOM_TIMELINE_CACHE_TTL = 60 * 60 * 24 * 2;
const ROOM_TIMELINE_MUTED_USERS_CACHE_TTL = 60 * 5;
const ROOM_TIMELINE_HTTP_READ_THROTTLE_TTL = 2;
const READ_ROOM_CHAT_MESSAGE_SCRIPT = `
local latest = redis.call('GET', KEYS[4])
redis.call('DEL', KEYS[1])
redis.call('DEL', KEYS[2])
redis.call('SREM', KEYS[3], ARGV[1])
if latest then
	redis.call('SET', KEYS[5], latest, 'EX', ARGV[2])
end
return latest
`;
const isCustomEmojiRegexp = /^:([\w+-]+)(?:@\.)?:$/;
type ChatMessageReference = Pick<MiChatMessage, 'id' | 'toUserId' | 'toRoomId'>;
type ChatRoomMessageTarget = Pick<MiChatRoom, 'id' | 'ownerId'>;
type PackedRoomChatMessage = Packed<'ChatMessageLiteForRoom'>;
type RoomTimelineCacheMeta = {
	warmedAt: number;
	complete: boolean;
};
type RoomTimelineStats = {
	requests: number;
	cacheHits: number;
	cacheMisses: number;
	dbFallbacks: number;
	cacheWrites: number;
	cacheErrors: number;
	readSkips: number;
};

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
	private readonly roomMessageTargetCache = new Map<MiChatRoom['id'], { room: ChatRoomMessageTarget; expiresAt: number; }>();
	private readonly roomMessageTargetLoads = new Map<MiChatRoom['id'], Promise<ChatRoomMessageTarget | null>>();
	private readonly roomSenderMembershipCache = new Map<string, { expiresAt: number; }>();
	private readonly roomSenderMembershipLoads = new Map<string, Promise<boolean>>();
	private readonly roomTimelineWarmLoads = new Map<MiChatRoom['id'], Promise<PackedRoomChatMessage[]>>();
	private roomTimelineStatsTimer: ReturnType<typeof setInterval> | null = null;
	private roomTimelineStats: RoomTimelineStats = {
		requests: 0,
		cacheHits: 0,
		cacheMisses: 0,
		dbFallbacks: 0,
		cacheWrites: 0,
		cacheErrors: 0,
		readSkips: 0,
	};

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

		@Inject(DI.chatRoomUserMutingsRepository)
		private chatRoomUserMutingsRepository: ChatRoomUserMutingsRepository,

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
		this.startRoomTimelineStatsLogger();
	}

	@bindThis
	private roomTimelineCacheKey(roomId: MiChatRoom['id']): string {
		return `chat:room:${roomId}:timeline:v1`;
	}

	@bindThis
	private roomTimelineCacheMetaKey(roomId: MiChatRoom['id']): string {
		return `chat:room:${roomId}:timeline:v1:meta`;
	}

	@bindThis
	private roomTimelineMutedUsersCacheKey(roomId: MiChatRoom['id'], userId: MiUser['id']): string {
		return `chat:room:${roomId}:muted:${userId}`;
	}

	@bindThis
	private startRoomTimelineStatsLogger(): void {
		if (process.env.NODE_ENV === 'test' || this.roomTimelineStatsTimer != null) return;

		this.roomTimelineStatsTimer = setInterval(() => {
			const stats = this.roomTimelineStats;
			const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
			if (total === 0) return;

			console.info(JSON.stringify({
				type: 'chat_room_timeline_stats',
				...stats,
				cacheHitRate: stats.cacheHits + stats.cacheMisses > 0
					? Number((stats.cacheHits / (stats.cacheHits + stats.cacheMisses)).toFixed(4))
					: null,
			}));
			this.roomTimelineStats = {
				requests: 0,
				cacheHits: 0,
				cacheMisses: 0,
				dbFallbacks: 0,
				cacheWrites: 0,
				cacheErrors: 0,
				readSkips: 0,
			};
		}, 60 * 1000);
		this.roomTimelineStatsTimer.unref?.();
	}

	@bindThis
	private parseRoomTimelineCacheMeta(raw: string | null): RoomTimelineCacheMeta | null {
		if (raw == null) return null;
		try {
			const parsed = JSON.parse(raw) as Partial<RoomTimelineCacheMeta>;
			return {
				warmedAt: typeof parsed.warmedAt === 'number' ? parsed.warmedAt : 0,
				complete: parsed.complete === true,
			};
		} catch {
			return null;
		}
	}

	@bindThis
	private parsePackedRoomMessage(raw: string): PackedRoomChatMessage | null {
		try {
			const parsed = JSON.parse(raw) as Partial<PackedRoomChatMessage>;
			if (typeof parsed.id !== 'string' || typeof parsed.fromUserId !== 'string') return null;
			return parsed as PackedRoomChatMessage;
		} catch {
			return null;
		}
	}

	@bindThis
	private selectPackedRoomTimeline(
		packed: PackedRoomChatMessage[],
		complete: boolean,
		limit: number,
		mutedUserIds: Set<MiUser['id']>,
		sinceId?: MiChatMessage['id'] | null,
	): PackedRoomChatMessage[] | null {
		const visible = (items: PackedRoomChatMessage[]) => mutedUserIds.size === 0
			? items
			: items.filter(message => !mutedUserIds.has(message.fromUserId));

		if (sinceId != null) {
			if (packed.length === 0) return complete ? [] : null;
			const oldestCached = packed[packed.length - 1].id;
			if (sinceId < oldestCached) return null;
			return visible(packed.filter(message => message.id > sinceId).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).slice(0, limit);
		}

		const filtered = visible(packed);
		if (filtered.length >= limit) return filtered.slice(0, limit);
		return complete ? filtered : null;
	}

	@bindThis
	private async getMutedRoomUserIds(userId: MiUser['id'] | null, roomId: MiChatRoom['id']): Promise<Set<MiUser['id']>> {
		if (userId == null) return new Set();

		const cacheKey = this.roomTimelineMutedUsersCacheKey(roomId, userId);
		try {
			const cached = await this.redisClient.get(cacheKey);
			if (cached != null) {
				const parsed = JSON.parse(cached) as unknown;
				if (Array.isArray(parsed) && parsed.every(value => typeof value === 'string')) {
					return new Set(parsed);
				}
			}
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}

		const rows = await this.chatRoomUserMutingsRepository.find({
			select: {
				muteeId: true,
			},
			where: {
				roomId,
				muterId: userId,
			},
		});
		const mutedUserIds = rows.map(row => row.muteeId);

		try {
			await this.redisClient.set(cacheKey, JSON.stringify(mutedUserIds), 'EX', ROOM_TIMELINE_MUTED_USERS_CACHE_TTL);
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}

		return new Set(mutedUserIds);
	}

	@bindThis
	private async readPackedRoomTimelineCache(
		roomId: MiChatRoom['id'],
		limit: number,
		mutedUserIds: Set<MiUser['id']>,
		sinceId?: MiChatMessage['id'] | null,
	): Promise<PackedRoomChatMessage[] | null> {
		try {
			const [rawMessages, rawMeta] = await Promise.all([
				this.redisClient.lrange(this.roomTimelineCacheKey(roomId), 0, ROOM_TIMELINE_CACHE_LIMIT - 1),
				this.redisClient.get(this.roomTimelineCacheMetaKey(roomId)),
			]);
			const meta = this.parseRoomTimelineCacheMeta(rawMeta);
			const packed = rawMessages.map(raw => this.parsePackedRoomMessage(raw)).filter((message): message is PackedRoomChatMessage => message != null);

			return this.selectPackedRoomTimeline(packed, meta?.complete === true, limit, mutedUserIds, sinceId);
		} catch {
			this.roomTimelineStats.cacheErrors++;
			return null;
		}
	}

	@bindThis
	private async replacePackedRoomTimelineCache(roomId: MiChatRoom['id'], packed: PackedRoomChatMessage[], complete: boolean): Promise<void> {
		const cacheKey = this.roomTimelineCacheKey(roomId);
		const metaKey = this.roomTimelineCacheMetaKey(roomId);
		try {
			await this.redisClient.del(cacheKey);
			if (packed.length > 0) {
				await this.redisClient.rpush(cacheKey, ...packed.slice(0, ROOM_TIMELINE_CACHE_LIMIT).map(message => JSON.stringify(message)));
				await this.redisClient.expire(cacheKey, ROOM_TIMELINE_CACHE_TTL);
			}
			await this.redisClient.set(metaKey, JSON.stringify({ warmedAt: this.timeService.now, complete }), 'EX', ROOM_TIMELINE_CACHE_TTL);
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
	}

	@bindThis
	private async warmPackedRoomTimelineCache(roomId: MiChatRoom['id']): Promise<PackedRoomChatMessage[]> {
		const current = this.roomTimelineWarmLoads.get(roomId);
		if (current != null) return await current;

		const load = (async () => {
			const messages = await this.roomTimeline(null, roomId, ROOM_TIMELINE_CACHE_LIMIT);
			const packed = await this.chatEntityService.packMessagesLiteForRoom(messages);
			await this.replacePackedRoomTimelineCache(roomId, packed, messages.length < ROOM_TIMELINE_CACHE_LIMIT);
			return packed;
		})();
		this.roomTimelineWarmLoads.set(roomId, load);

		try {
			return await load;
		} finally {
			this.timeService.startTimer(() => {
				if (this.roomTimelineWarmLoads.get(roomId) === load) {
					this.roomTimelineWarmLoads.delete(roomId);
				}
			}, 200);
		}
	}

	@bindThis
	private async appendPackedRoomTimelineCache(roomId: MiChatRoom['id'], message: PackedRoomChatMessage): Promise<void> {
		try {
			const cacheKey = this.roomTimelineCacheKey(roomId);
			const metaKey = this.roomTimelineCacheMetaKey(roomId);
			const meta = this.parseRoomTimelineCacheMeta(await this.redisClient.get(metaKey));
			const nextLength = await this.redisClient.lpush(cacheKey, JSON.stringify(message));
			await this.redisClient.ltrim(cacheKey, 0, ROOM_TIMELINE_CACHE_LIMIT - 1);
			await this.redisClient.expire(cacheKey, ROOM_TIMELINE_CACHE_TTL);
			const nextMeta: RoomTimelineCacheMeta = meta == null
				? { warmedAt: this.timeService.now, complete: false }
				: { ...meta, complete: meta.complete && nextLength <= ROOM_TIMELINE_CACHE_LIMIT };
			await this.redisClient.set(metaKey, JSON.stringify(nextMeta), 'EX', ROOM_TIMELINE_CACHE_TTL);
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
	}

	@bindThis
	private async removePackedRoomTimelineCacheMessages(roomId: MiChatRoom['id'], ids: Iterable<MiChatMessage['id']>): Promise<void> {
		const idSet = new Set(ids);
		if (idSet.size === 0) return;

		try {
			const cacheKey = this.roomTimelineCacheKey(roomId);
			const rawMessages = await this.redisClient.lrange(cacheKey, 0, ROOM_TIMELINE_CACHE_LIMIT - 1);
			if (rawMessages.length === 0) return;

			const next = rawMessages
				.map(raw => this.parsePackedRoomMessage(raw))
				.filter((message): message is PackedRoomChatMessage => message != null && !idSet.has(message.id));
			await this.redisClient.del(cacheKey);
			if (next.length > 0) {
				await this.redisClient.rpush(cacheKey, ...next.map(message => JSON.stringify(message)));
				await this.redisClient.expire(cacheKey, ROOM_TIMELINE_CACHE_TTL);
			}
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
	}

	@bindThis
	private async removePackedRoomTimelineCacheBefore(roomId: MiChatRoom['id'], cutoffId: MiChatMessage['id']): Promise<void> {
		try {
			const cacheKey = this.roomTimelineCacheKey(roomId);
			const rawMessages = await this.redisClient.lrange(cacheKey, 0, ROOM_TIMELINE_CACHE_LIMIT - 1);
			if (rawMessages.length === 0) return;

			const next = rawMessages
				.map(raw => this.parsePackedRoomMessage(raw))
				.filter((message): message is PackedRoomChatMessage => message != null && message.id >= cutoffId);
			await this.redisClient.del(cacheKey);
			if (next.length > 0) {
				await this.redisClient.rpush(cacheKey, ...next.map(message => JSON.stringify(message)));
				await this.redisClient.expire(cacheKey, ROOM_TIMELINE_CACHE_TTL);
			}
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
	}

	@bindThis
	private async clearPackedRoomTimelineCache(roomId: MiChatRoom['id']): Promise<void> {
		try {
			await this.redisClient.del(this.roomTimelineCacheKey(roomId), this.roomTimelineCacheMetaKey(roomId));
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
	}

	@bindThis
	private async updatePackedRoomTimelineCacheReaction(
		roomId: MiChatRoom['id'],
		messageId: MiChatMessage['id'],
		reaction: { user: Packed<'UserLite'>; reaction: string; },
		mode: 'add' | 'remove',
	): Promise<void> {
		try {
			const cacheKey = this.roomTimelineCacheKey(roomId);
			const rawMessages = await this.redisClient.lrange(cacheKey, 0, ROOM_TIMELINE_CACHE_LIMIT - 1);
			if (rawMessages.length === 0) return;

			let changed = false;
			const next = rawMessages.map(raw => {
				const message = this.parsePackedRoomMessage(raw);
				if (message == null || message.id !== messageId) return raw;
				changed = true;
				const reactions = mode === 'add'
					? message.reactions.some(item => item.user.id === reaction.user.id && item.reaction === reaction.reaction)
						? message.reactions
						: message.reactions.concat(reaction)
					: message.reactions.filter(item => !(item.user.id === reaction.user.id && item.reaction === reaction.reaction));
				return JSON.stringify({ ...message, reactions });
			});
			if (!changed) return;

			await this.redisClient.del(cacheKey);
			await this.redisClient.rpush(cacheKey, ...next);
			await this.redisClient.expire(cacheKey, ROOM_TIMELINE_CACHE_TTL);
			this.roomTimelineStats.cacheWrites++;
		} catch {
			this.roomTimelineStats.cacheErrors++;
		}
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
		room: ChatRoomMessageTarget,
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
	public async createMessageToRoom(fromUser: { id: MiUser['id']; host: MiUser['host']; }, toRoom: ChatRoomMessageTarget, params: {
		text?: string | null;
		file?: MiDriveFile | null;
		uri?: string | null;
		reply?: ChatMessageReference | null;
		quote?: ChatMessageReference | null;
	}): Promise<Packed<'ChatMessageLiteForRoom'>> {
		const [membershipsCount, senderIsMember] = await Promise.all([
			this.getRoomMembersCountForMessageFanout(toRoom.id),
			this.isRoomSenderMemberForMessage(toRoom, fromUser.id),
		]);

		if (!senderIsMember) throw new Error('you are not a member of the room');

		const isLargeRoom = membershipsCount > LARGE_CHAT_ROOM_MEMBER_THRESHOLD;

		const text = normalizeMessageText(params.text);
		if (text == null && params.file == null && params.reply == null && params.quote == null) {
			throw new Error('content required');
		}
		const shouldCacheMentionedUserIds = text != null && text.includes('@');
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

		if (isLargeRoom) {
			const redisPipeline = this.redisClient.pipeline();
			redisPipeline.set(`latestRoomChatMessage:${toRoom.id}`, message.id, 'EX', 60 * 60 * 24 * 30);
			if (shouldCacheMentionedUserIds) {
				redisPipeline.set(chatMessageMentionCacheKey(message.id), JSON.stringify(mentionedUserIds), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
			}
			for (const userId of mentionedUserIds) {
				redisPipeline.set(`newRoomChatMentionExists:${userId}:${toRoom.id}`, message.id);
				redisPipeline.sadd(`newChatMessagesExists:${userId}`, `room:${toRoom.id}`);
			}
			await redisPipeline.exec();

			const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted, { mentionedUserIds });
			await this.appendPackedRoomTimelineCache(toRoom.id, packedMessage);
			await this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

			if (mentionedUserIds.length > 0) {
				this.timeService.startTimer(async () => {
					const redisPipeline = this.redisClient.pipeline();
					for (const userId of mentionedUserIds) {
						redisPipeline.get(`newRoomChatMentionExists:${userId}:${toRoom.id}`);
					}
					const markers = await redisPipeline.exec();
					if (markers == null) throw new Error('redis error');

					if (markers.every(marker => marker[1] == null)) return;

					const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, undefined, { mentionedUserIds });

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
		redisPipeline.set(`latestRoomChatMessage:${toRoom.id}`, message.id, 'EX', 60 * 60 * 24 * 30);
		if (shouldCacheMentionedUserIds) {
			redisPipeline.set(chatMessageMentionCacheKey(message.id), JSON.stringify(mentionedUserIds), 'EX', CHAT_MESSAGE_MENTION_CACHE_TTL);
		}
		for (const membership of membershipsOtherThanMe) {
			const hasMention = mentionedUserIdSet.has(membership.userId);
			if (membership.isMuted && !hasMention) continue;

			redisPipeline.set(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`, message.id);
			redisPipeline.sadd(`newChatMessagesExists:${membership.userId}`, `room:${toRoom.id}`);
			if (hasMention) {
				redisPipeline.set(`newRoomChatMentionExists:${membership.userId}:${toRoom.id}`, message.id);
			}
		}
		await redisPipeline.exec();

		const packedMessage = await this.chatEntityService.packMessageLiteForRoom(inserted, { mentionedUserIds });
		await this.appendPackedRoomTimelineCache(toRoom.id, packedMessage);
		await this.globalEventService.publishChatRoomStream(toRoom.id, 'message', packedMessage);

		// 3秒経っても既読にならなかったらイベント発行
		this.timeService.startTimer(async () => {
			const redisPipeline = this.redisClient.pipeline();
			for (const membership of membershipsOtherThanMe) {
				redisPipeline.get(`newRoomChatMessageExists:${membership.userId}:${toRoom.id}`);
			}
			const markers = await redisPipeline.exec();
			if (markers == null) throw new Error('redis error');

			if (markers.every(marker => marker[1] == null)) return;

			const packedMessageForTo = await this.chatEntityService.packMessageDetailed(inserted, undefined, { mentionedUserIds });

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
		const throttleKey = `readRoomChatMessageThrottle:${readerId}:${roomId}`;
		const shouldRead = await this.redisClient.set(throttleKey, '1', 'EX', ROOM_TIMELINE_HTTP_READ_THROTTLE_TTL, 'NX');
		if (shouldRead !== 'OK') {
			this.roomTimelineStats.readSkips++;
			return;
		}

		await this.redisClient.eval(
			READ_ROOM_CHAT_MESSAGE_SCRIPT,
			5,
			`newRoomChatMessageExists:${readerId}:${roomId}`,
			`newRoomChatMentionExists:${readerId}:${roomId}`,
			`newChatMessagesExists:${readerId}`,
			`latestRoomChatMessage:${roomId}`,
			`readRoomChatMessage:${readerId}:${roomId}`,
			`room:${roomId}`,
			ROOM_CHAT_MESSAGE_READ_TTL,
		);
	}

	@bindThis
	public findMessageById(messageId: MiChatMessage['id']) {
		return this.chatMessagesRepository.findOneBy({ id: messageId });
	}

	@bindThis
	public async hasPermissionToManageRoom(me: MiUser, room: MiChatRoom) {
		if (room.ownerId === me.id) return true;
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
	public async hasPermissionToViewRoomTimeline(me: MiUser, room: ChatRoomMessageTarget) {
		if (room.ownerId === me.id) return true;

		const [membership, iAmModerator] = await Promise.all([
			this.chatRoomMembershipsRepository.findOne({
				select: {
					userId: true,
				},
				where: {
					roomId: room.id,
					userId: me.id,
				},
			}),
			this.roleService.isModerator(me),
		]);

		return membership != null || iAmModerator;
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
			await this.removePackedRoomTimelineCacheMessages(message.toRoomId, [message.id]);
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

		await this.clearPackedRoomTimelineCache(room.id);
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

		await this.removePackedRoomTimelineCacheMessages(room.id, ids);
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
			await this.removePackedRoomTimelineCacheBefore(room.id, cutoffId);
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
	private applyRoomUserMutingFilter<T extends ObjectLiteral>(
		query: SelectQueryBuilder<T>,
		muterId: MiUser['id'],
		messageAlias = query.alias,
	) {
		const subQuery = this.chatRoomUserMutingsRepository.createQueryBuilder('roomUserMuting')
			.select('1')
			.where('roomUserMuting.muterId = :roomUserMutingMuterId', { roomUserMutingMuterId: muterId })
			.andWhere(`roomUserMuting.roomId = ${messageAlias}.toRoomId`)
			.andWhere(`roomUserMuting.muteeId = ${messageAlias}.fromUserId`);

		return query
			.andWhere(`NOT EXISTS (${subQuery.getQuery()})`)
			.setParameters(subQuery.getParameters());
	}

	@bindThis
	private applyRoomUserMutingFilterIfNeeded<T extends ObjectLiteral>(
		query: SelectQueryBuilder<T>,
		muterId?: MiUser['id'] | null,
		messageAlias = query.alias,
	) {
		if (muterId == null) return query;
		return this.applyRoomUserMutingFilter(query, muterId, messageAlias);
	}

	@bindThis
	public async isRoomUserMuted(muterId: MiUser['id'], roomId: MiChatRoom['id'], muteeId: MiUser['id']) {
		return await this.chatRoomUserMutingsRepository.existsBy({
			roomId,
			muterId,
			muteeId,
		});
	}

	@bindThis
	public async createRoomUserMute(muterId: MiUser['id'], roomId: MiChatRoom['id'], muteeId: MiUser['id']) {
		if (muterId === muteeId) {
			throw new Error('cannot mute yourself');
		}

		const id = this.idService.gen();
		await this.chatRoomUserMutingsRepository.createQueryBuilder()
			.insert()
			.values({
				id,
				createdAt: new Date(this.timeService.now),
				roomId,
				muterId,
				muteeId,
			})
			.orIgnore()
			.execute();

		await this.redisClient.del(this.roomTimelineMutedUsersCacheKey(roomId, muterId)).catch(() => {
			this.roomTimelineStats.cacheErrors++;
		});

		return await this.chatRoomUserMutingsRepository.findOneOrFail({
			where: { roomId, muterId, muteeId },
			relations: {
				mutee: true,
			},
		});
	}

	@bindThis
	public async deleteRoomUserMute(muterId: MiUser['id'], roomId: MiChatRoom['id'], muteeId: MiUser['id']) {
		await this.chatRoomUserMutingsRepository.delete({
			roomId,
			muterId,
			muteeId,
		});
		await this.redisClient.del(this.roomTimelineMutedUsersCacheKey(roomId, muterId)).catch(() => {
			this.roomTimelineStats.cacheErrors++;
		});
	}

	@bindThis
	public async getRoomUserMutesWithPagination(muterId: MiUser['id'], roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatRoomUserMuting['id'] | null, untilId?: MiChatRoomUserMuting['id'] | null) {
		const query = this.queryService.makePaginationQuery(this.chatRoomUserMutingsRepository.createQueryBuilder('muting'), sinceId, untilId)
			.andWhere('muting.roomId = :roomId', { roomId })
			.andWhere('muting.muterId = :muterId', { muterId })
			.leftJoinAndSelect('muting.mutee', 'mutee');

		return await query.take(limit).getMany();
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
	public async roomTimeline(meId: MiUser['id'] | null, roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null) {
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

		this.applyRoomUserMutingFilterIfNeeded(query, meId, 'message');

		const messages = await query.take(limit).getMany();

		return messages;
	}

	@bindThis
	public async packedRoomTimeline(meId: MiUser['id'], roomId: MiChatRoom['id'], limit: number, sinceId?: MiChatMessage['id'] | null, untilId?: MiChatMessage['id'] | null): Promise<PackedRoomChatMessage[]> {
		this.roomTimelineStats.requests++;

		if (untilId == null) {
			const mutedUserIds = await this.getMutedRoomUserIds(meId, roomId);
			const cached = await this.readPackedRoomTimelineCache(roomId, limit, mutedUserIds, sinceId);
			if (cached != null) {
				this.roomTimelineStats.cacheHits++;
				return cached;
			}
			this.roomTimelineStats.cacheMisses++;

			const warmed = await this.warmPackedRoomTimelineCache(roomId);
			const fromWarmed = this.selectPackedRoomTimeline(warmed, warmed.length < ROOM_TIMELINE_CACHE_LIMIT, limit, mutedUserIds, sinceId);
			if (fromWarmed != null) {
				this.roomTimelineStats.cacheHits++;
				return fromWarmed;
			}
		}

		this.roomTimelineStats.dbFallbacks++;
		const messages = await this.roomTimeline(meId, roomId, limit, sinceId, untilId);
		return await this.chatEntityService.packMessagesLiteForRoom(messages);
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
	public async messageContext(message: MiChatMessage, limitBefore: number, limitAfter: number, meId?: MiUser['id']) {
		const addScope = (query = this.withMessageRelations()) => {
			if (message.toRoomId != null) {
				query.andWhere('message.toRoomId = :roomId', { roomId: message.toRoomId });
				if (meId != null) {
					this.applyRoomUserMutingFilter(query, meId, 'message');
				}
				return query;
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

		this.applyRoomUserMutingFilter(latestMessageIdsQuery, meId, 'latest');

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
		if (otherIds.length === 0) return readStateMap;

		const markers = await this.redisClient.mget(...otherIds.map(otherId => `newUserChatMessageExists:${userId}:${otherId}`));

		for (let i = 0; i < otherIds.length; i++) {
			const marker = markers[i];
			readStateMap[otherIds[i]] = marker == null;
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomReadStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const readStateMap: Record<MiChatRoom['id'], boolean> = {};
		if (roomIds.length === 0) return readStateMap;

		const markers = await this.redisClient.mget(...roomIds.flatMap(roomId => [
			`newRoomChatMessageExists:${userId}:${roomId}`,
			`latestRoomChatMessage:${roomId}`,
			`readRoomChatMessage:${userId}:${roomId}`,
		]));

		for (let i = 0; i < roomIds.length; i++) {
			const marker = markers[i * 3];
			const latestRoomMessageId = markers[(i * 3) + 1];
			const readRoomMessageId = markers[(i * 3) + 2];
			readStateMap[roomIds[i]] = marker == null && (latestRoomMessageId == null || latestRoomMessageId === readRoomMessageId);
		}

		return readStateMap;
	}

	@bindThis
	public async getRoomMentionStateMap(userId: MiUser['id'], roomIds: MiChatRoom['id'][]) {
		const mentionStateMap: Record<MiChatRoom['id'], boolean> = {};
		if (roomIds.length === 0) return mentionStateMap;

		const markers = await this.redisClient.mget(...roomIds.map(roomId => `newRoomChatMentionExists:${userId}:${roomId}`));

		for (let i = 0; i < roomIds.length; i++) {
			mentionStateMap[roomIds[i]] = markers[i] != null;
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
	private async isRoomSenderMemberForMessage(room: ChatRoomMessageTarget, userId: MiUser['id']) {
		if (room.ownerId === userId) return true;

		const cacheKey = `${room.id}:${userId}`;
		const cached = this.roomSenderMembershipCache.get(cacheKey);
		if (cached != null && cached.expiresAt > Date.now()) return true;

		const loading = this.roomSenderMembershipLoads.get(cacheKey);
		if (loading != null) return await loading;

		const load = (async () => {
			const membership = await this.chatRoomMembershipsRepository.findOne({
				select: { userId: true },
				where: { roomId: room.id, userId },
			});
			const isMember = membership != null;
			if (isMember) {
				this.roomSenderMembershipCache.set(cacheKey, { expiresAt: Date.now() + ROOM_SENDER_MEMBERSHIP_CACHE_TTL_MS });
			}
			return isMember;
		})();
		this.roomSenderMembershipLoads.set(cacheKey, load);

		try {
			return await load;
		} finally {
			this.roomSenderMembershipLoads.delete(cacheKey);
		}
	}

	@bindThis
	private deleteRoomSenderMembershipCache(roomId: MiChatRoom['id'], userId?: MiUser['id']) {
		if (userId != null) {
			this.roomSenderMembershipCache.delete(`${roomId}:${userId}`);
			this.roomSenderMembershipLoads.delete(`${roomId}:${userId}`);
			return;
		}

		for (const key of this.roomSenderMembershipCache.keys()) {
			if (key.startsWith(`${roomId}:`)) this.roomSenderMembershipCache.delete(key);
		}
		for (const key of this.roomSenderMembershipLoads.keys()) {
			if (key.startsWith(`${roomId}:`)) this.roomSenderMembershipLoads.delete(key);
		}
	}

	@bindThis
	private async deleteRoomMembersCountCache(roomId: MiChatRoom['id']) {
		this.roomMemberCountLoads.delete(roomId);
		await this.redisClient.del(`chatRoomMembersCount:${roomId}`);
	}

	@bindThis
	private deleteRoomMessageTargetCache(roomId: MiChatRoom['id']) {
		this.roomMessageTargetCache.delete(roomId);
		this.roomMessageTargetLoads.delete(roomId);
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
		this.deleteRoomMessageTargetCache(room.id);
		this.deleteRoomSenderMembershipCache(room.id);
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
	public async findRoomMessageTargetById(roomId: MiChatRoom['id']) {
		const cached = this.roomMessageTargetCache.get(roomId);
		if (cached != null && cached.expiresAt > Date.now()) return cached.room;

		const loading = this.roomMessageTargetLoads.get(roomId);
		if (loading != null) return await loading;

		const load = (async () => {
			const room = await this.chatRoomsRepository.findOne({
				select: {
					id: true,
					ownerId: true,
				},
				where: {
					id: roomId,
				},
			});
			if (room != null) {
				this.roomMessageTargetCache.set(roomId, { room, expiresAt: Date.now() + ROOM_MESSAGE_TARGET_CACHE_TTL_MS });
			}
			return room;
		})();
		this.roomMessageTargetLoads.set(roomId, load);

		try {
			return await load;
		} finally {
			this.roomMessageTargetLoads.delete(roomId);
		}
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
		const isRoomManager = await this.hasPermissionToManageRoom({ id: userId } as MiUser, room);

		if (room.joinMode === 'closed' && !isRoomManager) {
			throw new Error('joining disabled');
		}

		const invitation = await this.chatRoomInvitationsRepository.findOneBy({ roomId, userId });
		if (invitation == null && room.joinMode !== 'open' && !isRoomManager) {
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
			this.deleteRoomSenderMembershipCache(roomId, userId);
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
		this.deleteRoomSenderMembershipCache(roomId, userId);
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
		const normalizedQuery = query.trim().normalize('NFC').toLowerCase();
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

		this.applyRoomUserMutingFilter(q, meId, 'message');

		q.andWhere('message.text IS NOT NULL');
		q.andWhere('LOWER(message.text) LIKE :q', { q: `%${ sqlLikeEscape(normalizedQuery) }%` });

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
			const packedUser = await this.userEntityService.pack(userId);
			await this.updatePackedRoomTimelineCacheReaction(room.id, message.id, {
				user: packedUser,
				reaction,
			}, 'add');
			this.globalEventService.publishChatRoomStream(room.id, 'react', {
				messageId: message.id,
				user: packedUser,
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
			const packedUser = await this.userEntityService.pack(userId);
			await this.updatePackedRoomTimelineCacheReaction(room.id, message.id, {
				user: packedUser,
				reaction,
			}, 'remove');
			this.globalEventService.publishChatRoomStream(room.id, 'unreact', {
				messageId: message.id,
				user: packedUser,
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
