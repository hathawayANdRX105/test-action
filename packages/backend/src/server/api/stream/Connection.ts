/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { EventEmitter } from 'events';
import type { Socket } from 'net';
import { WebSocket } from 'ws';
import { CountingSet } from '@/misc/CountingSet.js';
import { SkEventSource } from '@/misc/SkEventEmitter.js';
import { IdentifiableError, errorCodes } from '@/misc/identifiable-error.js';
import { bindThis } from '@/decorators.js';
import { isJsonObject, type JsonObject, type JsonValue } from '@/misc/json-value.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiAccessToken } from '@/models/AccessToken.js';
import type { NotificationService } from '@/core/NotificationService.js';
import type { RateLimit } from '@/misc/rate-limit-utils.js';
import type { CacheService } from '@/core/CacheService.js';
import type { NotesRepository } from '@/models/_.js';
import type { GlobalEventNames, GlobalEvent, BroadcastEventPayload, NoteStreamEventPayload, GlobalEventsMap } from '@/core/GlobalEventService.js';
import type { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import type { LoggerService } from '@/core/LoggerService.js';
import type { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import type { TimeService } from '@/global/TimeService.js';
import type { WebSocketUser } from '@/server/api/stream/WebSocketUser.js';
import type { ChannelsService } from '@/server/api/stream/ChannelsService.js';
import type { Channel } from '@/server/api/stream/channel.js';
import type Logger from '@/logger.js';
import type { Redis } from 'ioredis';
import type { NoteUpdatedEvent } from 'misskey-js';

// TODO convert these to "performance" settings.

/**
 * Maximum number of simultaneous connections by client (user ID or IP address).
 * Exceeding this will result in an error and socket closure.
 */
export const MaxConnectionsPerClient = 32;

/**
 * Maximum number of logical communication channels allowed per single connection.
 * Exceeding this will fail silently.
 *
 * (not to be confused with native WS channels, or the Misskey feature of the same name.)
 */
export const MaxChannelsPerConnection = 32;

/**
 * Maximum number of note subscriptions allowed per single connection.
 * Exceeding this will automatically remove the oldest subscription to make room.
 */
export const MaxSubscriptionsPerChannel = 512;

/**
 * Maximum number of bytes ws is allowed to queue for a single client before
 * the connection is closed to protect broadcast latency for healthy clients.
 */
export const MaxWsBufferedAmount = 16 * 1024 * 1024;

/**
 * Maximum number of milliseconds to wait for close() before terminating immediately.
 * https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
 */
export const CloseTimeout = 1000 * 10; // 10 seconds

/**
 * Maximum number of pending connections to accumulate before silently dropping requests.
 * Default (511) is taken from ws library, which took it from net.js.
 * https://github.com/websockets/ws/blob/master/doc/ws.md#new-websocketserveroptions-callback
 */
export const ConnectionBacklogLimit = 511;

/**
 * Yield during very large fanout so HTTP requests and incoming websocket frames
 * are not starved by one synchronous broadcast loop.
 */
export const BroadcastFanoutYieldInterval = 16;

/**
 * Start very large fanout on the next tick so the Redis pubsub callback does
 * not monopolize the event loop before pending HTTP responses can flush.
 */
export const BroadcastFanoutInitialYieldThreshold = 1024;

/**
 * Connection status values:
 * * "ready" - native websocket is connected and authenticated, but the Connection wrapper is not initialized yet.
 * * "opening" - Connection is initializing, but not ready yet. (initial state)
 * * "opened" - Connection is alive and ready.
 * * "closing" - Connection is shutting down, but the native socket is not disposed yet
 * * "closed" - Connection and socket are shut down. (terminal state)
 */
export type ConnectionState = 'ready' | 'opening' | 'opened' | 'closing' | 'closed';

export type ConnectionEvents = {
	/**
	 * Emitted when the connection moves from one state to another.
	 */
	connectionStateChanged: {
		oldState: ConnectionState;
		newState: ConnectionState;
		connection: Connection;
	};

	/**
	 * Emitted when the connection state changes to "opened".
	 */
	open: {
		connection: Connection;
	};

	/**
	 * Emitted when the connection state changes to "closed".
	 */
	close: WebSocketClosure & {
		connection: Connection;
	};

	/**
	 * Emitted when the client receives a PING or PONG heartbeat.
	 */
	heartbeat: {
		lastActive: Date;
		connection: Connection;
	};

	/**
	 * Emitted when an error is emitted by the underlying websocket.
	 */
	error: {
		error: unknown;
		connection: Connection;
	};
};

/**
 * "close" message sent or received through the socket.
 */
export interface WebSocketClosure {
	code: number;
	message?: string | Buffer;
}

export interface WebSocketClient {
	/** Unique identifier, derived from IP and/or user ID. */
	uid: string;

	/** Client's IP address */
	ip: string;

	/** Authenticated user, or null if unauthenticated. */
	user: WebSocketUser | null;

	/** Client user's auth token, or null if unauthenticated or secure (using native token). */
	token: MiAccessToken | null;
}

interface RedisMessageHub {
	readonly connectionsByChannel: Map<GlobalEventNames, Set<Connection>>;
	readonly onMessage: (channel: string, data: string) => void;
}

class FastEventEmitter<TEvents extends Record<string, any[]>> extends EventEmitter<TEvents> {
	public emitFast<K extends keyof TEvents & string>(eventName: K, ...args: TEvents[K]): boolean {
		const listeners = this.listeners(eventName as never);
		if (listeners.length === 0) return false;

		for (const listener of listeners) {
			try {
				(listener as unknown as (...args: TEvents[K]) => void)(...args);
			} catch (err) {
				console.error(err);
			}
		}

		return true;
	}
}

type FastWebSocket = WebSocket & {
	_socket?: Socket;
	_sender?: {
		_state?: number;
		_queue?: unknown[];
		_firstFragment?: boolean;
	};
};

// Rather high limit because when catching up at the top of a timeline, the frontend may render many many notes.
// Each of which causes a message via `useNoteCapture` to ask for realtime updates of that note.
// Up to 4000 messages, then 20 per second
export const SocketMessageRateLimit = {
	type: 'bucket',
	key: 'wsmessage',
	size: 4000,
	dripRate: 50,
} as const satisfies RateLimit;

// Up to 30 connections, then 1 per 10 seconds
export const SocketConnectRateLimit = {
	type: 'bucket',
	key: 'wsconnect',
	size: 30,
	dripRate: 10 * 1000,
} as const satisfies RateLimit;

/**
 * Main stream connection
 */
export class Connection extends SkEventSource<ConnectionEvents> {
	private static cachedRedisMessageData: string | null = null;
	private static cachedRedisMessage: GlobalEvent<GlobalEventNames> | null = null;
	private static readonly redisMessageHubs = new WeakMap<Redis, RedisMessageHub>();
	private static readonly unmaskedTextFrameHeaders = new Map<number, Buffer>();

	/**
	 * Connection-specific sub-EV mirroring events from the global bus.
	 */
	public readonly subscriber = this.createSubscriber();
	private readonly logger: Logger;

	private readonly channels = new Map<string, Channel>();
	private readonly subscribingNotes = new CountingSet<MiNote['id']>();
	private readonly subscribedGlobalChannels = new Set<GlobalEventNames>();

	private _state: ConnectionState = 'ready';
	private _lastActive: Date;

	/**
	 * Returns the current state of this connection
	 */
	public get state(): ConnectionState {
		return this._state;
	}

	/**
	 * Returns the last-active timestamp as a number
	 */
	public get lastActiveAt(): number {
		return this._lastActive.valueOf();
	}

	/**
	 * Returns the last-active timestamp as a Date
	 */
	public get lastActive(): Date {
		return this._lastActive;
	}

	/**
	 * Returns true if this connection is alive and ready ("opened" state) or false for any other state.
	 */
	public get isActive(): boolean {
		return this._state === 'opened';
	}

	/**
	 * Returns the WebSocket client user.
	 */
	public get wsUser(): WebSocketUser | null {
		return this.client.user;
	}

	/**
	 * Returns the authenticated client user.
	 * This value is kept up-to-date by Quantum cache integration.
	 */
	public get user(): MiUser | undefined {
		return this.client.user?.user;
	}

	/**
	 * Returns the authenticated client user's profile.
	 * This value is kept up-to-date by Quantum cache integration.
	 */
	public get userProfile(): MiUserProfile | undefined {
		return this.client.user?.userProfile;
	}

	/**
	 * Returns the authenticated client user's followed channels.
	 * This value is kept up-to-date by IPC events.
	 */
	public get followingChannels(): ReadonlySet<string> | undefined {
		return this.client.user?.followingChannels;
	}

	/**
	 * Returns the authenticated client user's list of muted instance hostnames.
	 * This value is kept up-to-date by Quantum cache integration.
	 */
	public get userMutedInstances(): ReadonlySet<string> | undefined {
		return this.client.user?.mutedInstances;
	}

	/**
	 * Returns the authenticated client user's list of muted thread IDs.
	 * This value is kept up-to-date by Quantum cache integration.
	 */
	public get userMutedThreads(): ReadonlySet<string> | undefined {
		return this.client.user?.mutedThreads;
	}

	/**
	 * Returns the authenticated client user's list of muted note IDs.
	 * This value is kept up-to-date by Quantum cache integration.
	 */
	public get userMutedNotes(): ReadonlySet<string> | undefined {
		return this.client.user?.mutedNotes;
	}

	/**
	 * Returns the authenticated client user's recent note reactions.
	 * This value is refreshed every 10 seconds.
	 */
	public get myRecentReactions(): ReadonlyMap<string, string> | undefined {
		return this.client.user?.recentReactions;
	}

	/**
	 * Returns the authenticated client user's recent renotes.
	 * This value is refreshed every 10 seconds.
	 */
	public get myRecentRenotes(): ReadonlySet<string> | undefined {
		return this.client.user?.recentRenotes;
	}

	/**
	 * Returns the authenticated client user's recent note favorites.
	 * This value is refreshed every 10 seconds.
	 */
	public get myRecentFavorites(): ReadonlySet<string> | undefined {
		return this.client.user?.recentFavorites;
	}

	constructor(
		private readonly redisForSub: Redis,
		private readonly channelsService: ChannelsService,
		private readonly notificationService: NotificationService,
		private readonly cacheService: CacheService,
		private readonly notesRepository: NotesRepository,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly timeService: TimeService,
		private readonly skRateLimiterService: SkRateLimiterService,
		loggerService: LoggerService,

		/** Consolidated client info */
		public readonly client: WebSocketClient,

		/** Underlying websocket connection */
		private readonly wsConnection: WebSocket,
	) {
		super();
		this.logger = loggerService.getLogger('streaming', 'coral');
		this._lastActive = timeService.date;

		// Sanity check
		if (wsConnection.readyState !== WebSocket.CONNECTING && wsConnection.readyState !== WebSocket.OPEN) {
			throw new IdentifiableError(errorCodes.assertionFailed, `Attempted to create Connection from invalid WebSocket readyState ${wsConnection.readyState}`);
		}

		// Attach to the user instance.
		// WebSocketUser will automatically bind to our event listeners, so we don't need to do anything else with it.
		client.user?.attach(this);

		// Bind the "close" and "error" events immediately, in case the client disconnects before "init" is called.
		wsConnection.on('close', this.onWsConnectionClose);
		wsConnection.on('error', this.onWsConnectionError);
	}

	/**
	 * Updates the connection state and fires events.
	 * State is **always** updated before any await calls.
	 */
	@bindThis
	private async setState(newState: ConnectionState): Promise<void> {
		this._state = newState;

		await this.emit('connectionStateChanged', {
			oldState: this._state,
			newState,
		});
	}

	/**
	 * Initializes the client connection.
	 * No-op if already connected/connecting, and throws if already closed.
	 */
	@bindThis
	public async open() {
		if (this._state === 'opening') return;
		if (this._state === 'opened') return;
		if (this._state !== 'ready') throw new IdentifiableError(errorCodes.websocketError, 'Cannot re-open a closed socket connection');

		// Set up external events
		this.subscriber.on('broadcast', this.onSubscriberBroadcast);
		this.wsConnection.on('message', this.onWsConnectionMessage);
		this.wsConnection.on('ping', this.onWsConnectionPing);
		this.wsConnection.on('pong', this.onWsConnectionPong);

		// Mark as online.
		this._lastActive = this.timeService.date;
		await this.setState('opened');
		await this.emit('open', {});
	}

	private createSubscriber(): FastEventEmitter<GlobalEventsMap> {
		const subscriber = new FastEventEmitter<GlobalEventsMap>();
		subscriber.on('newListener', this.onSubscriberNewListener as never);
		subscriber.on('removeListener', this.onSubscriberRemoveListener as never);
		return subscriber;
	}

	@bindThis
	private onSubscriberNewListener(eventName: string | symbol): void {
		if (!Connection.isGlobalEventName(eventName)) return;
		if (this.subscriber.listenerCount(eventName) > 0) return;

		this.addGlobalChannelSubscription(eventName);
	}

	@bindThis
	private onSubscriberRemoveListener(eventName: string | symbol): void {
		if (!Connection.isGlobalEventName(eventName)) return;
		if (this.subscriber.listenerCount(eventName) > 0) return;

		this.removeGlobalChannelSubscription(eventName);
	}

	private addGlobalChannelSubscription(channel: GlobalEventNames): void {
		if (this.subscribedGlobalChannels.has(channel)) return;

		this.subscribedGlobalChannels.add(channel);
		const hub = Connection.getRedisMessageHub(this.redisForSub);
		let connections = hub.connectionsByChannel.get(channel);
		if (connections == null) {
			connections = new Set();
			hub.connectionsByChannel.set(channel, connections);
		}
		connections.add(this);
	}

	private removeGlobalChannelSubscription(channel: GlobalEventNames): void {
		if (!this.subscribedGlobalChannels.delete(channel)) return;

		const hub = Connection.redisMessageHubs.get(this.redisForSub);
		const connections = hub?.connectionsByChannel.get(channel);
		if (connections == null) return;

		connections.delete(this);
		if (connections.size === 0) {
			hub?.connectionsByChannel.delete(channel);
		}
	}

	private removeAllGlobalChannelSubscriptions(): void {
		for (const channel of this.subscribedGlobalChannels) {
			const hub = Connection.redisMessageHubs.get(this.redisForSub);
			const connections = hub?.connectionsByChannel.get(channel);
			connections?.delete(this);
			if (connections?.size === 0) {
				hub?.connectionsByChannel.delete(channel);
			}
		}
		this.subscribedGlobalChannels.clear();
	}

	private onRedisGlobalEvent(event: GlobalEvent<GlobalEventNames>): void {
		if (this._state !== 'opened') return;

		switch (event.channel.split(':', 1)[0]) {
			case 'chatRoomStream':
			case 'chatUserStream':
				this.subscriber.emitFast(event.channel, event.message);
				return;
			default:
				this.subscriber.emit(event.channel, event.message);
		}
	}

	private static dispatchRedisGlobalEvent(connections: Set<Connection>, event: GlobalEvent<GlobalEventNames>): void {
		let index = 0;
		let iterator = connections.values();

		const dispatchChunk = () => {
			for (;;) {
				const next = iterator.next();
				if (next.done) return;

				next.value.onRedisGlobalEvent(event);
				index++;
				if (index % BroadcastFanoutYieldInterval === 0) {
					setImmediate(dispatchChunk);
					return;
				}
			}
		};

		if (connections.size >= BroadcastFanoutInitialYieldThreshold) {
			setImmediate(dispatchChunk);
		} else {
			dispatchChunk();
		}
	}

	// Exposed for focused tests without constructing a full websocket connection.
	public static shouldParseRedisMessage(data: string, hasListener: (channel: GlobalEventNames) => boolean): boolean {
		const channel = Connection.extractRedisMessageChannel(data);
		return channel == null || hasListener(channel);
	}

	// Exposed for focused tests without constructing a full websocket connection.
	public static getRedisMessageForListener(data: string, hasListener: (channel: GlobalEventNames) => boolean): GlobalEvent<GlobalEventNames> | null {
		const channel = Connection.extractRedisMessageChannel(data);
		if (channel != null && !hasListener(channel)) return null;

		return Connection.parseRedisMessage(data);
	}

	private static getRedisMessageHub(redisForSub: Redis): RedisMessageHub {
		const existing = Connection.redisMessageHubs.get(redisForSub);
		if (existing != null) return existing;

		const hub: RedisMessageHub = {
			connectionsByChannel: new Map(),
			onMessage: (_redisChannel: string, data: string) => {
				const channel = Connection.extractRedisMessageChannel(data);
				if (channel == null) {
					const event = Connection.tryParseRedisMessage(data);
					if (event == null) return;

					const connections = hub.connectionsByChannel.get(event.channel);
					if (connections == null || connections.size === 0) return;

					Connection.dispatchRedisGlobalEvent(connections, event);
					return;
				}

				const connections = hub.connectionsByChannel.get(channel);
				if (connections == null || connections.size === 0) return;

				const event = Connection.tryParseRedisMessage(data);
				if (event == null) return;

				Connection.dispatchRedisGlobalEvent(connections, event);
			},
		};
		redisForSub.on('message', hub.onMessage);
		Connection.redisMessageHubs.set(redisForSub, hub);
		return hub;
	}

	private static isGlobalEventName(eventName: string | symbol): eventName is GlobalEventNames {
		return typeof eventName === 'string' && eventName !== 'newListener' && eventName !== 'removeListener';
	}

	private static extractRedisMessageChannel(data: string): GlobalEventNames | null {
		const marker = '"channel":"';
		const markerIndex = data.indexOf(marker);
		if (markerIndex === -1) return null;

		const channelStart = markerIndex + marker.length;
		const channelEnd = data.indexOf('"', channelStart);
		if (channelEnd === -1) return null;

		return data.slice(channelStart, channelEnd) as GlobalEventNames;
	}

	private static parseRedisMessage(data: string): GlobalEvent<GlobalEventNames> {
		if (Connection.cachedRedisMessageData === data && Connection.cachedRedisMessage != null) {
			return Connection.cachedRedisMessage;
		}

		const parsed = JSON.parse(data) as GlobalEvent<GlobalEventNames>;
		Connection.cachedRedisMessageData = data;
		Connection.cachedRedisMessage = parsed;
		return parsed;
	}

	private static tryParseRedisMessage(data: string): GlobalEvent<GlobalEventNames> | null {
		try {
			const parsed = Connection.parseRedisMessage(data);
			return typeof (parsed as { channel?: unknown }).channel === 'string' ? parsed : null;
		} catch {
			return null;
		}
	}

	public static shouldCloseForBackpressure(bufferedAmount: number): boolean {
		return bufferedAmount > MaxWsBufferedAmount;
	}

	/**
	 * クライアントからメッセージ受信時
	 */
	@bindThis
	private async onWsConnectionMessage(data: WebSocket.RawData) {
		// Check connection status.
		// Don't throw, since we might end up here if the buffer still has messages after the socket closes.
		if (!this.isActive) return;

		// Check rate limit.
		// Don't throw, since we don't want client errors to generate confusing error spam for admins.
		if (!await this.tickRateLimit()) return;

		// Mark as active
		this._lastActive = this.timeService.date;

		let obj: JsonObject;
		try {
			obj = JSON.parse(data.toString());
		} catch {
			return;
		}

		const { type, body } = obj;

		switch (type) {
			case 'readNotification': await this.onReadNotification(); break;
			case 'subNote': await this.onSubscribeNote(body); break;
			case 's': await this.onSubscribeNote(body); break; // alias
			case 'sr': await this.onSubscribeNote(body); break; // alias
			case 'unsubNote': this.onUnsubscribeNote(body); break;
			case 'un': this.onUnsubscribeNote(body); break; // alias
			case 'connect': await this.onChannelConnectRequested(body); break;
			case 'disconnect': this.onChannelDisconnectRequested(body); break;
			case 'channel': this.onChannelMessageRequested(body); break;
			case 'ch': this.onChannelMessageRequested(body); break; // alias
			// misskey-js uses these instead of the "normal" websocket ping
			case 'ping': await this.onWsConnectionPingMessage(); break;
			case 'h': await this.onWsConnectionPingMessage(); break; // alias
			case 'pong': await this.onWsConnectionPongMessage(); break;
		}
	}

	@bindThis
	private async onWsConnectionPingMessage(): Promise<void> {
		// Handle as ping
		await this.onWsConnectionPing();

		// And manually pong
		await this.pongWs();
	}

	@bindThis
	private async onWsConnectionPongMessage(): Promise<void> {
		// Handle as pong
		await this.onWsConnectionPong();
	}

	@bindThis
	private async onWsConnectionClose(code: number, message: Buffer): Promise<void> {
		await this.close(code, message);
	}

	@bindThis
	private async onWsConnectionError(error: unknown): Promise<void> {
		await this.emit('error', { error });
	}

	@bindThis
	private async onWsConnectionPing(): Promise<void> {
		this._lastActive = this.timeService.date;
		await this.emit('heartbeat', { lastActive: this._lastActive });
	}

	@bindThis
	private async onWsConnectionPong(): Promise<void> {
		this._lastActive = this.timeService.date;
		await this.emit('heartbeat', { lastActive: this._lastActive });
	}

	@bindThis
	private async tickRateLimit(): Promise<boolean> {
		// limit() both increments and checks the limit in a single call.
		// Discard the other results since we have no way of communicating limit status back to a client :(
		const { blocked } = await this.skRateLimiterService.limit(SocketMessageRateLimit, this.client.uid);
		if (!blocked) {
			return true;
		}

		// The rate limit is very high, so we can safely disconnect any client that hits it.
		this.logger.warn(`Closing a connection from ${this.client.ip} (user=${this.user?.id}}) due to an excessive influx of messages.`);
		await this.close(1008, 'Disconnected - too many requests');
		return false;
	}

	@bindThis
	private async onSubscriberBroadcast(data: BroadcastEventPayload) {
		await this.sendMessageToWs(data.type, data.body);
	}

	@bindThis
	private async onReadNotification() {
		if (!this.user) return;
		await this.notificationService.readAllNotification(this.user.id);
	}

	/**
	 * 投稿購読要求時
	 */
	@bindThis
	private async onSubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		// If already connected, then just bump count and skip other checks.
		if (this.subscribingNotes.add(payload.id) > 1) {
			return;
		}

		// Make sure the note exists.
		const note = await this.notesRepository.findOne({
			where: { id: payload.id },
			relations: {
				reply: true,
				renote: true,
			},
		});
		if (!note) {
			return;
		}

		// TODO cache this
		// Make sure the user can access the note.
		const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, this.user);
		if (!accessible) {
			return;
		}

		// Checks ok; set up the connection.
		this.subscriber.on(`noteStream:${payload.id}`, this.onNoteStreamMessage);

		// Limit the number of distinct notes that can be subscribed to.
		while (this.subscribingNotes.size > MaxSubscriptionsPerChannel) {
			// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
			const oldestKey = this.subscribingNotes.oldest()!;
			this.disconnectNoteEvents(oldestKey);
		}
	}

	/**
	 * 投稿購読解除要求時
	 */
	@bindThis
	private onUnsubscribeNote(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		if (!payload.id || typeof payload.id !== 'string') return;

		// Stop tracking, but don't unsubscribe unless this was the last stack.
		if (this.subscribingNotes.remove(payload.id) < 1) {
			this.disconnectNoteEvents(payload.id);
		}
	}

	/**
	 * Callback for Note Stream (noteStream:{id}), not the other one.
	 * This is subscribed only for notes that the client requests.
	 */
	@bindThis
	private async onNoteStreamMessage(payload: NoteStreamEventPayload) {
		if (payload.type === 'deleted') {
			// Unsubscribe from deleted notes
			this.disconnectNoteEvents(payload.body.id);
		} else {
			// Make sure author/user blocks haven't changed
			const { accessible } = await this.checkUserRelation(payload.body.userId);
			if (!accessible) {
				this.disconnectNoteEvents(payload.body.id);
				return;
			}
		}

		// Check access to interactions.
		// Don't disconnect, but *do* suppress the notification!
		if (payload.type === 'replied' || payload.type === 'reacted' || payload.type === 'unreacted' || payload.type === 'pollVoted') {
			const { accessible, silence } = await this.checkUserRelation(payload.body.body.userId);
			if (!accessible || silence) {
				return;
			}
		}

		// Checks ok; send message to client.
		const mappedPayload = {
			type: payload.type,
			id: payload.body.id,
			body: payload.body.body,
		} as NoteUpdatedEvent;
		await this.sendMessageToWs('noteUpdated', mappedPayload);
	}

	@bindThis
	private async checkUserRelation(targetUserId: MiUser['id']): Promise<{ accessible: boolean, silence: boolean }> {
		if (!this.user) {
			// If unauthenticated (not logged in), then check viewer privacy settings.
			// Consider deleted users to be restricted.
			const target = await this.cacheService.findOptionalUserById(targetUserId);
			return {
				accessible: target != null && !target.requireSigninToViewContents,
				silence: false,
			};
		} else if (this.user.id !== targetUserId) {
			// If authenticated, then check target->viewer blocks and viewer->target mutes.
			const relation = await this.cacheService.getUserRelation(this.user.id, targetUserId);
			return {
				accessible: !relation.isBlocked,
				silence: relation.isMuting || relation.isMutingInstance,
			};
		} else {
			// Always allow self-access.
			return {
				accessible: true,
				silence: false,
			};
		}
	}

	/**
	 * Stops tracking the provided note and cleans up all related state.
	 * Does nothing if the note isn't tracked.
	 */
	@bindThis
	public disconnectNoteEvents(noteId: string): void {
		this.subscribingNotes.zero(noteId);
		this.subscriber.off(`noteStream:${noteId}`, this.onNoteStreamMessage);
	}

	/**
	 * チャンネル接続要求時
	 */
	@bindThis
	private async onChannelConnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { channel, id, params, pong } = payload;
		if (typeof id !== 'string') return;
		if (typeof channel !== 'string') return;
		if (typeof pong !== 'boolean' && typeof pong !== 'undefined' && pong !== null) return;
		if (typeof params !== 'undefined' && !isJsonObject(params)) return;
		await this.connectChannel(id, params, channel, pong ?? undefined);
	}

	/**
	 * チャンネル切断要求時
	 */
	@bindThis
	private onChannelDisconnectRequested(payload: JsonValue | undefined) {
		if (!isJsonObject(payload)) return;
		const { id } = payload;
		if (typeof id !== 'string') return;
		this.disconnectChannel(id);
	}

	/**
	 * クライアントにメッセージ送信
	 */
	@bindThis
	public sendMessageToWs<T extends Record<string, unknown>>(type: string, payload?: T, options?: { compress?: boolean }): Promise<void> {
		const message = JSON.stringify({
			type: type,
			body: payload,
		});

		return this.sendSerializedMessageToWs(message, options);
	}

	@bindThis
	public sendSerializedMessageToWs(message: string, options?: { compress?: boolean }): Promise<void> {
		// Don't throw, since we might end up here if an async call completes while the connection is closing.
		if (!this.isActive) return Promise.resolve();

		if (Connection.shouldCloseForBackpressure(this.wsConnection.bufferedAmount)) {
			return this.close(1013, 'WebSocket send buffer exceeded');
		}

		return new Promise<void>((resolve, reject) => {
			this.wsConnection.send(message, {
				compress: options?.compress ?? true,
			}, (err?: unknown) => {
				if (err != null) reject(err);
				else resolve();
			});
		});
	}

	@bindThis
	public sendSerializedMessageToWsFast(message: string, options?: { compress?: boolean }): void {
		// Don't throw, since we might end up here if an async call completes while the connection is closing.
		if (!this.isActive) return;

		if (Connection.shouldCloseForBackpressure(this.wsConnection.bufferedAmount)) {
			void this.close(1013, 'WebSocket send buffer exceeded');
			return;
		}

		if (options?.compress === false && this.sendUncompressedSerializedMessageToWsFast(message)) {
			return;
		}

		try {
			this.wsConnection.send(message, {
				compress: options?.compress ?? true,
			});
		} catch (err) {
			void this.emit('error', { error: err });
		}
	}

	private sendUncompressedSerializedMessageToWsFast(message: string): boolean {
		const ws = this.wsConnection as FastWebSocket;
		const socket = ws._socket;
		const sender = ws._sender;
		if (ws.readyState !== WebSocket.OPEN || socket == null || sender == null) return false;
		if (!socket.writable || socket.destroyed) return false;
		if (sender._state !== 0 || (sender._queue?.length ?? 0) > 0 || sender._firstFragment === false) return false;

		try {
			socket.cork();
			socket.write(Connection.getUnmaskedTextFrameHeader(Buffer.byteLength(message)));
			socket.write(message);
			socket.uncork();
			return true;
		} catch (err) {
			try {
				socket.uncork();
			} catch {
				// ignore secondary uncork errors; the original socket error is emitted below.
			}
			void this.emit('error', { error: err });
			return true;
		}
	}

	private static getUnmaskedTextFrameHeader(byteLength: number): Buffer {
		const cached = Connection.unmaskedTextFrameHeaders.get(byteLength);
		if (cached != null) return cached;

		let header: Buffer;
		if (byteLength <= 125) {
			header = Buffer.from([0x81, byteLength]);
		} else if (byteLength <= 0xffff) {
			header = Buffer.allocUnsafe(4);
			header[0] = 0x81;
			header[1] = 126;
			header.writeUInt16BE(byteLength, 2);
		} else {
			header = Buffer.allocUnsafe(10);
			header[0] = 0x81;
			header[1] = 127;
			header.writeBigUInt64BE(BigInt(byteLength), 2);
		}

		Connection.unmaskedTextFrameHeaders.set(byteLength, header);
		return header;
	}

	@bindThis
	public async pingWs(): Promise<void> {
		// Don't throw, since we might end up here if the cleanup timer executes while the connection is closing.
		if (!this.isActive) return;

		// Ping as data message (instead of control) for compat with browser socket implementations.
		await this.sendMessageToWs('ping', {});
	}

	@bindThis
	public async pongWs(): Promise<void> {
		// Don't throw, since we might end up here if the cleanup timer executes while the connection is closing.
		if (!this.isActive) return;

		// Pong as data message (instead of control) for compat with browser socket implementations.
		await this.sendMessageToWs('pong', {});
	}

	/**
	 * チャンネルに接続
	 * TODO rate-limit connect/disconnect cycles
	 */
	@bindThis
	public async connectChannel(id: string, params: JsonObject | undefined, channel: string, pong = false) {
		if (this.channels.has(id)) {
			this.disconnectChannel(id);
		}

		if (this.channels.size >= MaxChannelsPerConnection) {
			return;
		}

		const channelService = this.channelsService.getChannelService(channel);

		if (channelService.requireCredential && this.user == null) {
			return;
		}

		if (this.client.token && ((channelService.kind && !this.client.token.permission.some(p => p === channelService.kind))
			|| (!channelService.kind && channelService.requireCredential))) {
			return;
		}

		// // 共有可能チャンネルに接続しようとしていて、かつそのチャンネルに既に接続していたら無意味なので無視
		// if (channelService.shouldShare) {
		// 	for (const c of this.channels.values()) {
		// 		if (c.chName === channel) {
		// 			// this.channels.set(id, c);
		// 			return;
		// 		}
		// 	}
		// }

		const ch: Channel = channelService.create(id, this);
		this.channels.set(id, ch);
		const valid = await ch.init(params ?? {});
		// A disconnect can remove the channel while its asynchronous initialization is pending.
		// In that case init may have registered listeners after the first dispose, so dispose it once
		// more before returning to avoid leaving an untracked subscription behind.
		if (this.channels.get(id) !== ch) {
			if (ch.dispose) ch.dispose();
			return;
		}

		if (valid === false) {
			this.disconnectChannel(id);
			return;
		}

		if (pong) {
			await this.sendMessageToWs('connected', {
				id: id,
			});
		}
	}

	/**
	 * チャンネルから切断
	 * @param id チャンネルコネクションID
	 */
	@bindThis
	public disconnectChannel(id: string) {
		const channel = this.channels.get(id);

		if (channel) {
			if (channel.dispose) channel.dispose();
			this.channels.delete(id);
		}
	}

	/**
	 * チャンネルへメッセージ送信要求時
	 * @param data メッセージ
	 */
	@bindThis
	private onChannelMessageRequested(data: JsonValue | undefined) {
		if (!isJsonObject(data)) return;
		if (typeof data.id !== 'string') return;
		if (typeof data.type !== 'string') return;
		if (typeof data.body === 'undefined') return;

		const channel = this.channels.get(data.id);
		if (channel != null && channel.onMessage != null) {
			channel.onMessage(data.type, data.body);
		}
	}

	/**
	 * ストリームが切れたとき
	 */
	@bindThis
	public async dispose() {
		await this.close(1001, 'Server is shutting down');
	}

	/**
	 * Closes the connection, or no-op if not connected.
	 */
	@bindThis
	public async close(code: number, message: string | Buffer | undefined): Promise<void> {
		if (this._state === 'closing') return;
		if (this._state === 'closed') return;

		// Update to closing before any async calls.
		await this.setState('closing');

		try {
			// Dispose active channels
			for (const c of this.channels.values()) {
				if (c.dispose) c.dispose();
			}
			this.channels.clear();
			this.removeAllGlobalChannelSubscriptions();

			// Dispose note subscriptions
			for (const k of this.subscribingNotes) {
				this.subscriber.off(`noteStream:${k}`, this.onNoteStreamMessage);
			}
			this.subscribingNotes.clear();

			// Disconnect external events
			this.subscriber.off('broadcast', this.onSubscriberBroadcast);
			this.wsConnection.off('message', this.onWsConnectionMessage);
			this.wsConnection.off('ping', this.onWsConnectionPing);
			this.wsConnection.off('pong', this.onWsConnectionPong);
			this.wsConnection.off('close', this.onWsConnectionClose);
			this.wsConnection.off('error', this.onWsConnectionError);

			// Disconnect the client.
			this.wsConnection.close(code, message);
		} finally {
			// Move to terminal state.
			await this.setState('closed');
			await this.emit('close', { code, message });

			// Disconnect internal events *after* terminal state!!
			this.removeAllListeners();
		}
	}

	public emit<K extends keyof ConnectionEvents>(type: K, value: ConnectionEvents[K], context?: Record<string, never>): Promise<void>;
	public emit<K extends keyof ConnectionEvents>(type: K, value: Omit<ConnectionEvents[K], 'connection'>, context?: Record<string, never>): Promise<void>;
	@bindThis
	public async emit<K extends keyof ConnectionEvents>(type: K, value: ConnectionEvents[K] | Omit<ConnectionEvents[K], 'connection'>, context?: Record<string, never>): Promise<void> {
		const actualValue = {
			...value,
			connection: this,
		} as ConnectionEvents[K];
		await super.emit(type, actualValue, context);
	}

	@bindThis
	public removeAllListeners<K extends (keyof ConnectionEvents) | GlobalEventNames>(type?: K): void {
		this.subscriber.removeAllListeners(type as GlobalEventNames);
		super.removeAllListeners(type as keyof ConnectionEvents);
	}
}
