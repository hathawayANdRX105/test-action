/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { BroadcastFanoutYieldInterval, Connection, MaxWsBufferedAmount } from '@/server/api/stream/Connection.js';

describe('Connection Redis message fast path', () => {
	test('skips parsing valid events when this connection has no matching listener', () => {
		const message = JSON.stringify({
			channel: 'chatRoomStream:room',
			message: {
				type: 'message',
				body: { id: 'message-id' },
			},
		});

		expect(Connection.shouldParseRedisMessage(message, () => false)).toBe(false);
		expect(Connection.shouldParseRedisMessage(message, channel => channel === 'chatRoomStream:room')).toBe(true);
	});

	test('keeps malformed or legacy payloads on the parse path', () => {
		expect(Connection.shouldParseRedisMessage('{"message":{"type":"x"}}', () => false)).toBe(true);
		expect(Connection.shouldParseRedisMessage('not json', () => false)).toBe(true);
	});

	test('reuses parsed Redis payloads for the same broadcast data', () => {
		const message = JSON.stringify({
			channel: 'chatRoomStream:room',
			message: {
				type: 'message',
				body: { id: 'message-id' },
			},
		});

		const first = Connection.getRedisMessageForListener(message, channel => channel === 'chatRoomStream:room');
		const second = Connection.getRedisMessageForListener(message, channel => channel === 'chatRoomStream:room');

		expect(first).toBe(second);
		expect(second?.channel).toBe('chatRoomStream:room');
		expect(second?.message).toEqual({
			type: 'message',
			body: { id: 'message-id' },
		});
	});

	test('does not parse skipped Redis payloads', () => {
		const skipped = Connection.getRedisMessageForListener('{"channel":"chatRoomStream:room","message":', () => false);

		expect(skipped).toBeNull();
	});

	test('dispatches one parsed Redis room event to 10000 matching listeners', async () => {
		const redis = new EventEmitter();
		const hub = (Connection as unknown as {
			getRedisMessageHub: (redis: EventEmitter) => {
				connectionsByChannel: Map<string, Set<{ onRedisGlobalEvent: (event: unknown) => void }>>;
			};
		}).getRedisMessageHub(redis);
		let delivered = 0;
		const connections = new Set(Array.from({ length: 10000 }, () => ({
			onRedisGlobalEvent: () => {
				delivered++;
			},
		})));
		hub.connectionsByChannel.set('chatRoomStream:room', connections);
		const message = JSON.stringify({
			channel: 'chatRoomStream:room',
			message: {
				type: 'message',
				body: { id: 'hub-message-id' },
			},
		});
		const parseSpy = jest.spyOn(JSON, 'parse');

		redis.emit('message', 'host', message);
		redis.emit('message', 'host', '{"channel":"chatRoomStream:other","message":');
		redis.emit('message', 'host', '{"channel":"chatRoomStream:room","message":');
		for (let i = 0; i < Math.ceil(10000 / BroadcastFanoutYieldInterval) + 2; i++) {
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		expect(delivered).toBe(10000);
		expect(parseSpy).toHaveBeenCalledTimes(2);
		parseSpy.mockRestore();
	});

	test('dispatches legacy Redis payloads without a fast-path channel marker', async () => {
		const redis = new EventEmitter();
		const hub = (Connection as unknown as {
			getRedisMessageHub: (redis: EventEmitter) => {
				connectionsByChannel: Map<string, Set<{ onRedisGlobalEvent: (event: unknown) => void }>>;
			};
		}).getRedisMessageHub(redis);
		const received: unknown[] = [];
		hub.connectionsByChannel.set('chatRoomStream:legacy', new Set([{
			onRedisGlobalEvent: event => {
				received.push(event);
			},
		}]));

		redis.emit('message', 'host', '{ "channel" : "chatRoomStream:legacy", "message": { "type": "message", "body": { "id": "legacy-message-id" } } }');
		redis.emit('message', 'host', '{ "channel" : "chatRoomStream:missing", "message": { "type": "message" } }');
		redis.emit('message', 'host', 'not json');
		await new Promise<void>(resolve => setImmediate(resolve));

		expect(received).toEqual([expect.objectContaining({ channel: 'chatRoomStream:legacy' })]);
	});
});

describe('Connection websocket backpressure', () => {
	test('closes clients only after the send buffer exceeds the limit', () => {
		expect(Connection.shouldCloseForBackpressure(MaxWsBufferedAmount - 1)).toBe(false);
		expect(Connection.shouldCloseForBackpressure(MaxWsBufferedAmount)).toBe(false);
		expect(Connection.shouldCloseForBackpressure(MaxWsBufferedAmount + 1)).toBe(true);
	});
});

describe('Connection channel initialization', () => {
	test('disposes a channel again when it disconnects while initialization is pending', async () => {
		let resolveInit: (valid: boolean) => void;
		let subscribed = false;
		const channel: any = {
			init: jest.fn(() => new Promise<boolean>(resolve => {
				resolveInit = valid => {
					subscribed = true;
					resolve(valid);
				};
			})),
			dispose: jest.fn(() => {
				subscribed = false;
			}),
		};
		const connection: any = {
			channels: new Map(),
			channelsService: {
				getChannelService: jest.fn(() => ({
					requireCredential: false,
					create: jest.fn(() => channel),
				})),
			},
			client: { token: null },
			sendMessageToWs: jest.fn(),
		};

		const connect = Connection.prototype.connectChannel.call(connection, 'channel-id', {}, 'chatRoom', true);
		expect(connection.channels.get('channel-id')).toBe(channel);

		Connection.prototype.disconnectChannel.call(connection, 'channel-id');
		expect(channel.dispose).toHaveBeenCalledTimes(1);

		resolveInit!(true);
		await connect;

		expect(subscribed).toBe(false);
		expect(channel.dispose).toHaveBeenCalledTimes(2);
		expect(connection.channels.has('channel-id')).toBe(false);
		expect(connection.sendMessageToWs).not.toHaveBeenCalled();
	});
});
