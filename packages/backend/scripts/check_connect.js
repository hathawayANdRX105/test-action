/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createPostgresDataSource } from '../built/postgres.js';
const config = loadConfig();

async function connectToPostgres() {
	try {
		const source = createPostgresDataSource(config);
		await source.initialize();
		await source.destroy();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[check:connect] PostgreSQL connection failed (${config.db.host}:${config.db.port}/${config.db.db}): ${msg}`);
		throw e;
	}
}

async function connectToRedis(redisOptions) {
	const host = redisOptions?.host ?? '127.0.0.1';
	const port = redisOptions?.port ?? 6379;
	const redis = new Redis({
		host,
		port,
		password: redisOptions?.password,
		db: redisOptions?.db,
		family: 4, // force IPv4 — Windows "localhost" often resolves to ::1
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		connectTimeout: 5000,
		enableReadyCheck: true,
		retryStrategy: () => null,
	});
	try {
		await redis.connect();
		await redis.ping();
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		console.error(`[check:connect] Redis connection failed (${host}:${port}): ${msg}`);
		console.error('[check:connect] Hint: start Redis (e.g. scripts/start-redis.ps1) before pnpm start.');
		throw e;
	} finally {
		try {
			redis.disconnect(false);
		} catch {
			// ignore
		}
	}
}

// Deduplicate by host:port:db (object identity is unreliable)
const uniq = [];
const seen = new Set();
for (const c of [
	config.redis,
	config.redisForPubsub,
	config.redisForJobQueue,
	config.redisForTimelines,
	config.redisForReactions,
	config.redisForRateLimit,
]) {
	if (!c) continue;
	const key = `${c.host ?? '127.0.0.1'}:${c.port ?? 6379}:${c.db ?? 0}`;
	if (seen.has(key)) continue;
	seen.add(key);
	uniq.push(c);
}

try {
	await Promise.all([
		...uniq.map(connectToRedis),
		connectToPostgres(),
	]);
} catch {
	process.exitCode = 1;
}
