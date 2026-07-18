/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Redis from 'ioredis';
import { loadConfig } from '../built/config.js';
import { createPostgresDataSource } from '../built/postgres.js';
const config = loadConfig();

// createPostgresDataSource handles primaries and replicas automatically.
// usually, it only opens connections first use, so we force it using
// .initialize()
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

// Connect to all redis servers
async function connectToRedis(redisOptions) {
	const host = redisOptions?.host ?? 'localhost';
	const port = redisOptions?.port ?? 6379;
	return await new Promise(async (resolve, reject) => {
		const redis = new Redis({
			...redisOptions,
			lazyConnect: true,
			reconnectOnError: false,
			showFriendlyErrorStack: true,
			// fail fast during startup check
			maxRetriesPerRequest: 1,
			connectTimeout: 3000,
		});
		redis.on('error', e => {
			// ignore during teardown
		});

		try {
			await redis.connect();
			resolve();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error(`[check:connect] Redis connection failed (${host}:${port}): ${msg}`);
			console.error('[check:connect] Hint: start Redis (e.g. scripts/start-redis.ps1) before pnpm start.');
			reject(e);
		} finally {
			redis.disconnect(false);
		}
	});
}

// If not all of these are defined, the default one gets reused.
// so we use a Set to only try connecting once to each **uniq** redis.
const promises = Array
	.from(new Set([
		config.redis,
		config.redisForPubsub,
		config.redisForJobQueue,
		config.redisForTimelines,
		config.redisForReactions,
		config.redisForRateLimit,
	]))
	.map(connectToRedis)
	.concat([
		connectToPostgres()
	]);

try {
	await Promise.all(promises);
} catch {
	process.exitCode = 1;
}
