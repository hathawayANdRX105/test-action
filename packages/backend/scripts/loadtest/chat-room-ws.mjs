/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import { readFile, writeFile } from 'node:fs/promises';
import { availableParallelism } from 'node:os';
import WebSocket from '../../node_modules/ws/wrapper.mjs';

const argv = new Map();
for (let i = 2; i < process.argv.length; i++) {
	const arg = process.argv[i];
	if (arg === '--') continue;
	if (!arg.startsWith('--')) continue;
	const key = arg.slice(2);
	const next = process.argv[i + 1];
	if (next == null || next.startsWith('--')) {
		argv.set(key, 'true');
	} else {
		argv.set(key, next);
		i++;
	}
}

function option(name, fallback) {
	return argv.get(name) ?? process.env[`CHAT_LOAD_${name.replaceAll('-', '_').toUpperCase()}`] ?? fallback;
}

function intOption(name, fallback) {
	const value = Number.parseInt(option(name, String(fallback)), 10);
	if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid --${name}`);
	return value;
}

function numberOption(name, fallback) {
	const value = Number.parseFloat(option(name, String(fallback)));
	if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid --${name}`);
	return value;
}

const baseUrl = option('url', 'http://127.0.0.1:3005');
const adminToken = option('admin-token', '');
const roomIdArg = option('room-id', '');
const tokensFile = option('tokens-file', '');
const tokensOut = option('tokens-out', '');
const tokenPrefix = option('token-prefix', '');
const usernamePrefix = option('username-prefix', `chatload${Date.now().toString(36)}`);
const password = option('password', 'chat-load-test-password');
const clients = intOption('clients', 100);
const senders = intOption('senders', Math.min(10, clients));
const messages = intOption('messages', 1000);
const connectConcurrency = intOption('connect-concurrency', 200);
const apiConcurrency = intOption('api-concurrency', 20);
const rate = numberOption('rate', 100);
const deliveryTimeoutMs = intOption('delivery-timeout-ms', 30000);
const pid = intOption('pid', 0);
const statsIntervalMs = intOption('stats-interval-ms', pid > 0 ? 1000 : 0);
const apiRetries = intOption('api-retries', 8);
const maxRateLimitWaitMs = intOption('max-rate-limit-wait-ms', 5000);
const textPrefix = option('text-prefix', 'load-test');
const createUsers = option('create-users', 'false') === 'true';
const createUsersOnly = option('create-users-only', 'false') === 'true';
const joinRoom = option('join-room', 'false') === 'true';
const roomName = option('room-name', `chat-load-${Date.now().toString(36)}`);
const setupPassword = option('setup-password', '');
const readReceipts = option('read-receipts', 'false') === 'true';
const reuseTokens = option('reuse-tokens', 'false') === 'true';
const connectTimeoutMs = intOption('connect-timeout-ms', 30000);
const initialTimeline = option('initial-timeline', 'true') === 'true';
const recoveryRequests = intOption('recovery-requests', 0);
const recoveryConcurrency = intOption('recovery-concurrency', Math.min(200, clients));
const minNetworkDelayMs = intOption('min-network-delay-ms', 0);
const maxNetworkDelayMs = intOption('max-network-delay-ms', 0);
const reconnectClients = intOption('reconnect-clients', 0);

if (clients === 0) throw new Error('--clients must be greater than 0');
if (senders === 0) throw new Error('--senders must be greater than 0');
if (senders > clients) throw new Error('--senders cannot exceed --clients');
if (!createUsers && tokenPrefix === '' && tokensFile === '') throw new Error('Provide --tokens-file, --token-prefix, or pass --create-users true for a local non-production test instance.');
if (createUsers && adminToken === '' && setupPassword === '') throw new Error('--create-users requires --admin-token, or --setup-password for first account setup.');
if (createUsersOnly && tokensOut === '') throw new Error('--create-users-only requires --tokens-out.');
if (maxNetworkDelayMs < minNetworkDelayMs) throw new Error('--max-network-delay-ms must be >= --min-network-delay-ms');

const httpOrigin = new URL(baseUrl);
const wsOrigin = new URL(baseUrl);
wsOrigin.protocol = wsOrigin.protocol === 'https:' ? 'wss:' : 'ws:';

function percentile(values, p) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function formatMs(value) {
	return `${value.toFixed(1)}ms`;
}

function summarizeSamples(samples, selector) {
	if (samples.length === 0) return null;
	const values = samples.map(selector);
	return {
		avg: Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)),
		max: Number(Math.max(...values).toFixed(1)),
	};
}

async function readProcessSample(targetPid) {
	const [processStat, hostStat, status] = await Promise.all([
		readFile(`/proc/${targetPid}/stat`, 'utf8'),
		readFile('/proc/stat', 'utf8'),
		readFile(`/proc/${targetPid}/status`, 'utf8'),
	]);

	const processStatEnd = processStat.lastIndexOf(') ');
	if (processStatEnd === -1) throw new Error(`Could not parse /proc/${targetPid}/stat`);

	const processFields = processStat.slice(processStatEnd + 2).trim().split(/\s+/);
	const processTicks = Number(processFields[11]) + Number(processFields[12]);
	const totalTicks = hostStat.split('\n')[0].trim().split(/\s+/).slice(1).reduce((sum, value) => sum + Number(value), 0);
	const rssKiB = Number(status.split('\n').find(line => line.startsWith('VmRSS:'))?.match(/\d+/)?.[0] ?? 0);
	if (!Number.isFinite(processTicks) || !Number.isFinite(totalTicks) || !Number.isFinite(rssKiB)) {
		throw new Error(`Could not parse process stats for pid ${targetPid}`);
	}

	return {
		at: performance.now(),
		processTicks,
		totalTicks,
		rssKiB,
	};
}

function startProcessSampler(targetPid, intervalMs) {
	if (targetPid <= 0 || intervalMs <= 0) {
		return {
			samples: [],
			stop: async () => {},
		};
	}

	const cpuCount = availableParallelism();
	const samples = [];
	let previous = null;
	let inFlight = false;

	const capture = async () => {
		if (inFlight) return;
		inFlight = true;
		try {
			const current = await readProcessSample(targetPid);
			if (previous != null) {
				const processDelta = current.processTicks - previous.processTicks;
				const totalDelta = current.totalTicks - previous.totalTicks;
				const cpu = totalDelta > 0 ? (processDelta / totalDelta) * cpuCount * 100 : 0;
				samples.push({
					at: current.at,
					cpu,
					rssKiB: current.rssKiB,
				});
			}
			previous = current;
		} catch {
			// The target process may exit near the end of a run; keep the samples gathered so far.
		} finally {
			inFlight = false;
		}
	};

	void capture();
	const timer = setInterval(() => {
		void capture();
	}, intervalMs);
	timer.unref?.();

	return {
		samples,
		stop: async () => {
			clearInterval(timer);
			await capture();
		},
	};
}

function assertTokenResponse(value) {
	if (value == null || typeof value !== 'object' || typeof value.token !== 'string') {
		throw new Error('Account creation response did not include a token');
	}
	return value;
}

function assertRoomResponse(value) {
	if (value == null || typeof value !== 'object' || typeof value.id !== 'string') {
		throw new Error('Room creation response did not include an id');
	}
	return value;
}

async function api(endpoint, body, token) {
	if (maxNetworkDelayMs > 0) {
		const jitter = minNetworkDelayMs + Math.random() * (maxNetworkDelayMs - minNetworkDelayMs);
		await sleep(jitter);
	}

	const getRateLimitResetMs = payload => {
		const maybeError = payload != null && typeof payload === 'object' ? payload.error : null;
		const maybeInfo = maybeError != null && typeof maybeError === 'object' ? maybeError.info : null;
		return maybeInfo != null && typeof maybeInfo === 'object' && typeof maybeInfo.resetMs === 'number' ? maybeInfo.resetMs : 1000;
	};

	for (let attempt = 0; attempt <= apiRetries; attempt++) {
		const response = await fetch(new URL(`/api/${endpoint}`, httpOrigin), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				...(token != null && token !== '' ? { i: token } : {}),
				...body,
			}),
		});

		const contentType = response.headers.get('content-type');
		const payload = contentType?.startsWith('application/json') ? await response.json() : await response.text();
		if (response.ok) return payload;

		if (response.status === 429 && attempt < apiRetries) {
			const resetMs = getRateLimitResetMs(payload);
			if (resetMs > maxRateLimitWaitMs) {
				throw new Error(`POST /api/${endpoint} rate limited for ${resetMs}ms, exceeding --max-rate-limit-wait-ms ${maxRateLimitWaitMs}: ${JSON.stringify(payload)}`);
			}
			await sleep(Math.max(250, resetMs) + Math.min(attempt * 100, 1000));
			continue;
		}

		throw new Error(`POST /api/${endpoint} failed: ${response.status} ${JSON.stringify(payload)}`);
	}

	throw new Error(`POST /api/${endpoint} failed after ${apiRetries} retries`);
}

async function mapLimit(items, limit, fn) {
	const results = new Array(items.length);
	let nextIndex = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		for (;;) {
			const index = nextIndex++;
			if (index >= items.length) return;
			results[index] = await fn(items[index], index);
		}
	});
	await Promise.all(workers);
	return results;
}

function logProgress(event, data = {}) {
	console.log(JSON.stringify({
		event,
		...data,
	}));
}

async function ensureUsers() {
	if (tokensFile !== '') {
		const raw = await readFile(tokensFile, 'utf8');
		const parsed = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
		if (!Array.isArray(parsed) || !parsed.every(token => typeof token === 'string')) throw new Error('--tokens-file must contain a JSON string array or newline-separated tokens');
		if (parsed.length < clients && !reuseTokens) throw new Error(`--tokens-file contains ${parsed.length} tokens, but --clients is ${clients}`);
		return Array.from({ length: clients }, (_, i) => parsed[i % parsed.length]);
	}

	if (!createUsers) {
		return Array.from({ length: clients }, (_, i) => `${tokenPrefix}${reuseTokens ? i % Math.max(1, senders) : i}`);
	}

	const tokens = [];
	let creatorToken = adminToken;
	let startIndex = 0;
	if (creatorToken === '') {
		const account = assertTokenResponse(await api('admin/accounts/create', {
			username: `${usernamePrefix}0`,
			password,
			...(setupPassword !== '' ? { setupPassword } : {}),
		}, ''));
		tokens.push(account.token);
		creatorToken = account.token;
		startIndex = 1;
	}

	const created = await mapLimit(Array.from({ length: clients - startIndex }, (_, i) => i + startIndex), apiConcurrency, async i => {
		const account = assertTokenResponse(await api('admin/accounts/create', {
			username: `${usernamePrefix}${i}`,
			password,
		}, creatorToken));
		return account.token;
	});
	tokens.push(...created);

	if (tokensOut !== '') {
		await writeFile(tokensOut, `${JSON.stringify(tokens, null, 2)}\n`);
	}

	return tokens;
}

async function ensureRoom(ownerToken) {
	if (roomIdArg !== '') return roomIdArg;

	const room = assertRoomResponse(await api('chat/rooms/create', {
		name: roomName,
		joinMode: 'open',
	}, ownerToken));
	return room.id;
}

async function joinUsers(tokens, roomId) {
	if (!joinRoom) return;

	const uniqueTokens = [...new Set(tokens)];
	const tokensToJoin = roomIdArg !== '' ? uniqueTokens : uniqueTokens.slice(1);
	await mapLimit(tokensToJoin, apiConcurrency, async token => {
		try {
			await api('chat/rooms/join', { roomId }, token);
		} catch (err) {
			if (!String(err).includes('ALREADY_JOINED')) throw err;
		}
	});
}

function connectClient(token, roomId, index, stats) {
	return new Promise((resolve, reject) => {
		const wsUrl = new URL('/streaming', wsOrigin);
		wsUrl.searchParams.set('i', token);
		wsUrl.searchParams.set('_t', Date.now().toString());

		const ws = new WebSocket(wsUrl);
		const channelId = `chat-load-${index}`;
		let connected = false;
		const timeout = setTimeout(() => {
			ws.close();
			reject(new Error(`WebSocket ${index} did not connect in time`));
		}, connectTimeoutMs);

		ws.on('open', () => {
			ws.send(JSON.stringify({
				type: 'connect',
				body: {
					channel: 'chatRoom',
					id: channelId,
					params: { roomId },
					pong: true,
				},
			}));
		});

		ws.on('message', raw => {
			let event;
			try {
				event = JSON.parse(raw.toString());
			} catch {
				return;
			}

			if (event.type === 'channel' && event.body?.id === channelId && event.body.type === 'message') {
				stats.delivered++;
				stats.lastDeliveryAt = performance.now();
				if (readReceipts) {
					ws.send(JSON.stringify({
						type: 'channel',
						body: {
							id: channelId,
							type: 'read',
							body: { id: event.body.body?.id },
						},
					}));
				}
			}

			if (event.type === 'connected' && event.body?.id === channelId && !connected) {
				connected = true;
				clearTimeout(timeout);
				resolve({
					ws,
					channelId,
				});
			}
		});

		ws.on('close', (code, reason) => {
			stats.closed++;
			if (!connected) {
				clearTimeout(timeout);
				reject(new Error(`WebSocket ${index} closed before connect: ${code} ${reason.toString()}`));
			}
		});
		ws.on('error', err => {
			stats.errors++;
			reject(err);
		});
	});
}

async function connectClients(tokens, roomId, stats) {
	return await mapLimit(tokens, connectConcurrency, async (token, index) => connectClient(token, roomId, index, stats));
}

async function hitRoomTimeline(tokens, roomId, stats, options = {}) {
	const limit = options.limit ?? 20;
	const startedAt = performance.now();
	const latencies = [];
	await mapLimit(tokens, recoveryConcurrency, async token => {
		const requestStartedAt = performance.now();
		await api('chat/messages/room-timeline', {
			roomId,
			limit,
			...(options.sinceId ? { sinceId: options.sinceId } : {}),
		}, token);
		latencies.push(performance.now() - requestStartedAt);
		stats.timelineRequests++;
	});

	return {
		requests: tokens.length,
		totalMs: Number((performance.now() - startedAt).toFixed(1)),
		p50: formatMs(percentile(latencies, 0.50)),
		p95: formatMs(percentile(latencies, 0.95)),
		p99: formatMs(percentile(latencies, 0.99)),
		max: formatMs(Math.max(...latencies, 0)),
	};
}

async function sendMessages(tokens, roomId, stats) {
	const senderTokens = tokens.slice(0, senders);
	const sendLatencies = [];
	const start = performance.now();

	await mapLimit(Array.from({ length: messages }, (_, i) => i), Math.max(1, Math.min(apiConcurrency, senders)), async i => {
		if (rate > 0) {
			const due = start + ((i + 1) * 1000 / rate);
			const delay = due - performance.now();
			if (delay > 0) await sleep(delay);
		}

		const startedAt = performance.now();
		await api('chat/messages/create-to-room', {
			toRoomId: roomId,
			text: `${textPrefix} ${i} ${startedAt}`,
		}, senderTokens[i % senderTokens.length]);
		sendLatencies.push(performance.now() - startedAt);
	});

	return sendLatencies;
}

async function waitForDeliveries(stats, expectedDeliveries) {
	const deadline = performance.now() + deliveryTimeoutMs;
	while (stats.delivered < expectedDeliveries && performance.now() < deadline) {
		await sleep(250);
	}
	if (stats.delivered < expectedDeliveries) {
		throw new Error(`Timed out waiting for deliveries: got ${stats.delivered}/${expectedDeliveries} after ${deliveryTimeoutMs}ms`);
	}
}

const stats = {
	delivered: 0,
	lastDeliveryAt: 0,
	closed: 0,
	errors: 0,
	timelineRequests: 0,
};

const setupStart = performance.now();
console.log(JSON.stringify({
	event: 'config',
	baseUrl,
	clients,
	senders,
	messages,
	connectConcurrency,
	apiConcurrency,
	rate,
	deliveryTimeoutMs,
	pid,
	statsIntervalMs,
	apiRetries,
	maxRateLimitWaitMs,
	createUsers,
	createUsersOnly,
	joinRoom,
	readReceipts,
	reuseTokens,
	connectTimeoutMs,
	initialTimeline,
	recoveryRequests,
	recoveryConcurrency,
	minNetworkDelayMs,
	maxNetworkDelayMs,
	reconnectClients,
}));

const processSampler = startProcessSampler(pid, statsIntervalMs);
const tokens = await ensureUsers();
logProgress('users-ready', { tokens: tokens.length, uniqueTokens: new Set(tokens).size });
if (createUsersOnly) {
	await processSampler.stop();
	console.log(JSON.stringify({ event: 'created-users', clients: tokens.length, tokensOut }));
	process.exit(0);
}
const roomId = await ensureRoom(tokens[0]);
logProgress('room-ready', { roomId });
await joinUsers(tokens, roomId);
logProgress('join-ready', { roomId, uniqueTokens: new Set(tokens).size });
const sockets = await connectClients(tokens, roomId, stats);
const setupMs = performance.now() - setupStart;
console.log(JSON.stringify({ event: 'connected', roomId, clients: sockets.length, setupMs }));
let initialTimelineResult = null;
if (initialTimeline) {
	initialTimelineResult = await hitRoomTimeline(tokens, roomId, stats);
	console.log(JSON.stringify({ event: 'initial-timeline', ...initialTimelineResult }));
}

const messageStart = performance.now();
const latencies = await sendMessages(tokens, roomId, stats);
const sendDoneAt = performance.now();
let recoveryTimelineResults = [];
for (let i = 0; i < recoveryRequests; i++) {
	const result = await hitRoomTimeline(tokens, roomId, stats);
	recoveryTimelineResults.push(result);
	console.log(JSON.stringify({ event: 'recovery-timeline', round: i + 1, ...result }));
}
if (reconnectClients > 0) {
	const targets = sockets.slice(0, Math.min(reconnectClients, sockets.length));
	for (const target of targets) {
		target.ws.close();
	}
	const reconnectTokens = tokens.slice(0, targets.length);
	const reconnected = await connectClients(reconnectTokens, roomId, stats);
	sockets.splice(0, targets.length, ...reconnected);
	console.log(JSON.stringify({ event: 'reconnected', clients: reconnected.length }));
	recoveryTimelineResults.push(await hitRoomTimeline(reconnectTokens, roomId, stats));
}
await waitForDeliveries(stats, messages * clients);
const end = performance.now();
await processSampler.stop();

for (const socket of sockets) {
	socket.ws.close();
}

const result = {
	roomId,
	clients,
	senders,
	messages,
	expectedDeliveries: messages * clients,
	delivered: stats.delivered,
	closed: stats.closed,
	errors: stats.errors,
	timelineRequests: stats.timelineRequests,
	setupMs: Number(setupMs.toFixed(1)),
	sendMs: Number((sendDoneAt - messageStart).toFixed(1)),
	totalMs: Number((end - messageStart).toFixed(1)),
	sendRps: Number((messages / ((sendDoneAt - messageStart) / 1000)).toFixed(1)),
	deliveriesPerSecond: Number((stats.delivered / ((end - messageStart) / 1000)).toFixed(1)),
	sendLatency: {
		p50: formatMs(percentile(latencies, 0.50)),
		p95: formatMs(percentile(latencies, 0.95)),
		p99: formatMs(percentile(latencies, 0.99)),
		max: formatMs(Math.max(...latencies, 0)),
	},
	initialTimeline: initialTimelineResult,
	recoveryTimeline: recoveryTimelineResults,
	process: pid > 0 ? {
		pid,
		samples: processSampler.samples.length,
		cpuPercent: summarizeSamples(processSampler.samples, sample => sample.cpu),
		rssMiB: summarizeSamples(processSampler.samples, sample => sample.rssKiB / 1024),
	} : undefined,
};
console.log(JSON.stringify({ event: 'result', ...result }, null, 2));
