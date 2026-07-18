/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import * as Redis from 'ioredis';
import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { In } from 'typeorm';
import { ReplyError } from 'ioredis';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, MiUserProfile } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { MiNotification } from '@/models/Notification.js';
import type { Packed } from '@/misc/json-schema.js';
import { bindThis } from '@/decorators.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { PushNotificationService } from '@/core/PushNotificationService.js';
import { NotificationEntityService } from '@/core/entities/NotificationEntityService.js';
import { IdService } from '@/core/IdService.js';
import { CacheService, type UserRelation } from '@/core/CacheService.js';
import type { Config } from '@/config.js';
import { UserListService } from '@/core/UserListService.js';
import { FilterUnionByProperty, groupedNotificationTypes, obsoleteNotificationTypes } from '@/types.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { TimeService } from '@/global/TimeService.js';

@Injectable()
export class NotificationService implements OnApplicationShutdown {
	#shutdownController = new AbortController();
	#pendingUnreadChecks: {
		notifieeId: MiUser['id'];
		redisId: string;
		packed: Packed<'Notification'>;
	}[] = [];
	#unreadFlushScheduled = false;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private notificationEntityService: NotificationEntityService,
		private idService: IdService,
		private globalEventService: GlobalEventService,
		private pushNotificationService: PushNotificationService,
		private cacheService: CacheService,
		private userListService: UserListService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async readAllNotification(
		userId: MiUser['id'],
		force = false,
	) {
		const [latestReadNotificationId, latestNotificationIdsRes] = await Promise.all([
			this.redisClient.get(`latestReadNotification:${userId}`),
			this.redisClient.xrevrange(
				`notificationTimeline:${userId}`,
				'+',
				'-',
				'COUNT', 1),
		]);

		// Bail if the user has no notifications.
		// Type Assertion is required because TS tries to incorrectly "infer" latestNotificationId as non-nullable.
		const latestNotificationId = latestNotificationIdsRes[0]?.[0] as string | undefined;
		if (latestNotificationId == null) return;

		if (force || latestNotificationId !== latestReadNotificationId) {
			await Promise.all([
				this.redisClient.set(`latestReadNotification:${userId}`, latestNotificationId),
				this.globalEventService.publishMainStream(userId, 'readAllNotifications', {}),
				this.pushNotificationService.pushNotification(userId, 'readAllNotifications', undefined),
			]);
		}
	}

	@bindThis
	public createNotification<T extends MiNotification['type']>(
		notifieeId: MiUser['id'],
		type: T,
		data: Omit<FilterUnionByProperty<MiNotification, 'type', T>, 'type' | 'id' | 'createdAt' | 'notifierId'>,
		notifierId?: MiUser['id'] | null,
		hint?: {
			notifieeProfile?: MiUserProfile,
			notifieeUser?: MiUser,
			notifieeRelation?: UserRelation,
		},
	) {
		trackPromise(
			this.createNotificationImmediate(notifieeId, type, data, notifierId, hint),
		);
	}

	@bindThis
	public async createNotificationImmediate<T extends MiNotification['type']>(
		notifieeId: MiUser['id'],
		type: T,
		data: Omit<FilterUnionByProperty<MiNotification, 'type', T>, 'type' | 'id' | 'createdAt' | 'notifierId'>,
		notifierId?: MiUser['id'] | null,
		hint?: {
			notifieeProfile?: MiUserProfile,
			notifieeUser?: MiUser,
			notifieeRelation?: UserRelation,
		},
	): Promise<MiNotification | null> {
		// noinspection ES6MissingAwait
		const [profile, notifiee, notifieeRelation] = await Promise.all([
			hint?.notifieeProfile ?? this.cacheService.userProfileCache.fetch(notifieeId),
			hint?.notifieeUser ?? this.cacheService.findUserById(notifieeId),
			notifierId != null && notifierId !== notifieeId
				? (hint?.notifieeRelation ?? this.cacheService.getUserRelation(notifieeId, notifierId))
				: null,
		]);

		// 古いMisskeyバージョンのキャッシュが残っている可能性がある
		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		const recieveConfig = (profile.notificationRecieveConfig ?? {})[type];
		if (recieveConfig?.type === 'never') {
			return null;
		}

		if (notifierId) {
			// notifieeRelation will be null if notifier is the same, so this covers both conditions.
			if (!notifieeRelation) {
				return null;
			}

			if (notifieeRelation.isMuting) {
				return null;
			}

			if (recieveConfig?.type === 'following') {
				if (!notifieeRelation.isFollowing) {
					return null;
				}
			} else if (recieveConfig?.type === 'follower') {
				if (!notifieeRelation.isFollowed) {
					return null;
				}
			} else if (recieveConfig?.type === 'mutualFollow') {
				if (!(notifieeRelation.isFollowing && notifieeRelation.isFollowed)) {
					return null;
				}
			} else if (recieveConfig?.type === 'followingOrFollower') {
				if (!notifieeRelation.isFollowing && !notifieeRelation.isFollowed) {
					return null;
				}
			} else if (recieveConfig?.type === 'list') {
				const isMember = await this.cacheService.listUserMembershipsCache.fetch(recieveConfig.userListId).then(members => members.has(notifierId));
				if (!isMember) {
					return null;
				}
			}
		}

		const createdAt = this.timeService.date;
		let notification: FilterUnionByProperty<MiNotification, 'type', T>;
		let redisId: string;

		do {
			notification = {
				id: this.idService.gen(),
				createdAt,
				type: type,
				...(notifierId ? {
					notifierId,
				} : {}),
				...data,
			} as unknown as FilterUnionByProperty<MiNotification, 'type', T>;

			try {
				// TODO this needs type safety
				redisId = (await this.redisClient.xadd(
					`notificationTimeline:${notifieeId}`,
					'MAXLEN', '~', this.config.perUserNotificationsMaxCount.toString(),
					this.toXListId(notification.id, 0),
					'data', JSON.stringify(notification)))!;
			} catch (e) {
				// The ID specified in XADD is equal or smaller than the target stream top item で失敗することがあるのでリトライ
				if (e instanceof ReplyError) continue;
				throw e;
			}

			break;
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition,no-constant-condition
		} while (true);

		const packed = await this.notificationEntityService.pack(notification, notifiee, {});

		if (packed == null) return null;

		// Publish notification event
		await this.globalEventService.publishMainStream(notifieeId, 'notification', packed);

		// 2秒経っても(今回作成した)通知が既読にならなかったら「未読の通知がありますよ」イベントを発行する
		// テスト通知の場合は即時発行
		// Batch delayed latest-read checks so high fanout does one mget per flush, not get×N.
		const interval = notification.type === 'test' ? 0 : 2000;
		this.timeService.startPromiseTimer(interval, 'unread notification', { signal: this.#shutdownController.signal }).then(() => {
			this.enqueueUnreadNotificationCheck(notifieeId, redisId, packed);
		}, () => { /* aborted, ignore it */ });

		return notification;
	}

	// TODO
	//const locales = await import('../../../../locales/index.js');

	// TODO: locale ファイルをクライアント用とサーバー用で分けたい

	@bindThis
	private async emailNotificationFollow(userId: MiUser['id'], follower: MiUser) {
		/*
		const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
		if (!userProfile.email || !userProfile.emailNotificationTypes.includes('follow')) return;
		const locale = locales[userProfile.lang ?? 'ja-JP'];
		const i18n = new I18n(locale);
		// TODO: render user information html
		sendEmail(userProfile.email, i18n.t('_email._follow.title'), `${follower.name} (@${Acct.toString(follower)})`, `${follower.name} (@${Acct.toString(follower)})`);
		*/
	}

	@bindThis
	private async emailNotificationReceiveFollowRequest(userId: MiUser['id'], follower: MiUser) {
		/*
		const userProfile = await UserProfiles.findOneByOrFail({ userId: userId });
		if (!userProfile.email || !userProfile.emailNotificationTypes.includes('receiveFollowRequest')) return;
		const locale = locales[userProfile.lang ?? 'ja-JP'];
		const i18n = new I18n(locale);
		// TODO: render user information html
		sendEmail(userProfile.email, i18n.t('_email._receiveFollowRequest.title'), `${follower.name} (@${Acct.toString(follower)})`, `${follower.name} (@${Acct.toString(follower)})`);
		*/
	}

	@bindThis
	public async flushAllNotifications(userId: MiUser['id']) {
		await Promise.all([
			this.redisClient.del(`notificationTimeline:${userId}`),
			this.redisClient.del(`latestReadNotification:${userId}`),
			this.globalEventService.publishMainStream(userId, 'notificationFlushed', {}),
		]);
	}

	@bindThis
	public dispose(): void {
		this.#shutdownController.abort();
	}

	private enqueueUnreadNotificationCheck(
		notifieeId: MiUser['id'],
		redisId: string,
		packed: Packed<'Notification'>,
	): void {
		this.#pendingUnreadChecks.push({ notifieeId, redisId, packed });
		if (this.#unreadFlushScheduled) return;
		this.#unreadFlushScheduled = true;
		// ponytail: setImmediate check-phase barrier coalesces same-deadline native timer enqueues
		setImmediate(() => {
			trackPromise(this.flushUnreadNotificationChecks());
		});
	}

	@bindThis
	private async flushUnreadNotificationChecks(): Promise<void> {
		this.#unreadFlushScheduled = false;
		const candidates = this.#pendingUnreadChecks;
		this.#pendingUnreadChecks = [];
		if (candidates.length === 0) return;

		const keys = [...new Set(candidates.map(c => `latestReadNotification:${c.notifieeId}`))];
		// ChatService empty-array guard pattern
		if (keys.length === 0) return;

		const values = await this.redisClient.mget(...keys);
		const latestByKey = new Map(keys.map((key, i) => [key, values[i]]));

		const errors: unknown[] = [];
		for (const { notifieeId, redisId, packed } of candidates) {
			const latestReadNotificationId = latestByKey.get(`latestReadNotification:${notifieeId}`) ?? null;
			if (latestReadNotificationId && (latestReadNotificationId >= redisId)) continue;

			try {
				await this.globalEventService.publishMainStream(notifieeId, 'unreadNotification', packed);
				await this.pushNotificationService.pushNotification(notifieeId, 'notification', packed);
			} catch (err) {
				errors.push(err);
			}
		}
		if (errors.length === 1) throw errors[0];
		if (errors.length > 1) throw new AggregateError(errors);
	}

	private toXListId(id: string, offset: number): string {
		const { date, additional } = this.idService.parseFull(id);
		return (date + offset).toString() + '-' + additional.toString();
	}

	@bindThis
	public async getNotifications(
		userId: MiUser['id'],
		{
			sinceId,
			untilId,
			limit = 20,
			includeTypes,
			excludeTypes,
		}: {
			sinceId?: string,
			untilId?: string,
			limit?: number,
			// any extra types are allowed, those are no-op
			includeTypes?: (MiNotification['type'] | string)[],
			excludeTypes?: (MiNotification['type'] | string)[],
		},
	): Promise<MiNotification[]> {
		let sinceTime = sinceId ? this.toXListId(sinceId, 1) : null;
		let untilTime = untilId ? this.toXListId(untilId, -1) : null;

		let notifications: MiNotification[];
		for (;;) {
			let notificationsRes: [id: string, fields: string[]][];

			// sinceidのみの場合は古い順、そうでない場合は新しい順。 QueryService.makePaginationQueryも参照
			if (sinceTime && !untilTime) {
				notificationsRes = await this.redisClient.xrange(
					`notificationTimeline:${userId}`,
					'(' + sinceTime,
					'+',
					'COUNT', limit);
			} else {
				notificationsRes = await this.redisClient.xrevrange(
					`notificationTimeline:${userId}`,
					untilTime ? '(' + untilTime : '+',
					sinceTime ? '(' + sinceTime : '-',
					'COUNT', limit);
			}

			if (notificationsRes.length === 0) {
				return [];
			}

			notifications = notificationsRes.map(x => JSON.parse(x[1][1])) as MiNotification[];

			if (includeTypes && includeTypes.length > 0) {
				notifications = notifications.filter(notification => includeTypes.includes(notification.type));
			} else if (excludeTypes && excludeTypes.length > 0) {
				notifications = notifications.filter(notification => !excludeTypes.includes(notification.type));
			}

			if (notifications.length !== 0) {
				// 通知が１件以上ある場合は返す
				break;
			}

			// フィルタしたことで通知が0件になった場合、次のページを取得する
			if (sinceId && !untilId) {
				sinceTime = notificationsRes[notificationsRes.length - 1][0];
			} else {
				untilTime = notificationsRes[notificationsRes.length - 1][0];
			}
		}

		return notifications;
	}

	@bindThis
	public onApplicationShutdown(signal?: string | undefined): void {
		this.dispose();
	}
}
