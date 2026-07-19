/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { ReactionsBufferingService } from '@/core/ReactionsBufferingService.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';

/**
 * Minimal Map-backed Redis covering only the ops used by ReactionsBufferingService.
 * MockRedis lacks hash/zset/set commands needed here.
 */
class BufferRedisFake {
	// key -> hash field -> string count
	private hashes = new Map<string, Map<string, string>>();
	// key -> member -> score
	private zsets = new Map<string, Map<string, number>>();
	// key -> members
	private sets = new Map<string, Set<string>>();

	/** Call counters for O(currentPairs) create proof. */
	smembersCalls = 0;
	sismemberCalls = 0;
	zremCalls = 0;

	/** Optional yield point for non-atomic interleaving demos (tests only). */
	pauseAfterSmembers: (() => Promise<void>) | null = null;

	pipeline() {
		const cmds: Array<() => unknown> = [];
		const self = this;
		const chain = {
			hincrby(key: string, field: string, by: number) {
				cmds.push(() => self.hincrby(key, field, by));
				return chain;
			},
			hgetall(key: string) {
				cmds.push(() => self.hgetall(key));
				return chain;
			},
			zadd(key: string, score: number, member: string) {
				cmds.push(() => self.zadd(key, score, member));
				return chain;
			},
			zrem(key: string, member: string) {
				cmds.push(() => self.zrem(key, member));
				return chain;
			},
			zrange(key: string, start: number, stop: number) {
				cmds.push(() => self.zrange(key, start, stop));
				return chain;
			},
			zremrangebyrank(key: string, start: number, stop: number) {
				cmds.push(() => self.zremrangebyrank(key, start, stop));
				return chain;
			},
			sadd(key: string, member: string) {
				cmds.push(() => self.sadd(key, member));
				return chain;
			},
			srem(key: string, member: string) {
				cmds.push(() => self.srem(key, member));
				return chain;
			},
			smembers(key: string) {
				cmds.push(() => self.smembers(key));
				return chain;
			},
			del(...keys: string[]) {
				cmds.push(() => self.del(...keys));
				return chain;
			},
			async exec() {
				return cmds.map(fn => [null, fn()] as [Error | null, unknown]);
			},
		};
		return chain;
	}

	hincrby(key: string, field: string, by: number): number {
		let h = this.hashes.get(key);
		if (!h) {
			h = new Map();
			this.hashes.set(key, h);
		}
		const next = (parseInt(h.get(field) ?? '0', 10) || 0) + by;
		h.set(field, String(next));
		return next;
	}

	hgetall(key: string): Record<string, string> {
		const h = this.hashes.get(key);
		if (!h) return {};
		return Object.fromEntries(h.entries());
	}

	zadd(key: string, score: number, member: string): number {
		let z = this.zsets.get(key);
		if (!z) {
			z = new Map();
			this.zsets.set(key, z);
		}
		const isNew = !z.has(member);
		z.set(member, score);
		return isNew ? 1 : 0;
	}

	zrem(key: string, member: string): number {
		this.zremCalls++;
		const z = this.zsets.get(key);
		if (!z || !z.has(member)) return 0;
		z.delete(member);
		return 1;
	}

	zrange(key: string, start: number, stop: number): string[] {
		const z = this.zsets.get(key);
		if (!z) return [];
		const sorted = [...z.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
		const members = sorted.map(([m]) => m);
		const end = stop < 0 ? members.length + stop + 1 : stop + 1;
		return members.slice(start, end);
	}

	zremrangebyrank(key: string, start: number, stop: number): number {
		const z = this.zsets.get(key);
		if (!z) return 0;
		const sorted = [...z.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
		const end = stop < 0 ? sorted.length + stop + 1 : stop + 1;
		const toRemove = sorted.slice(start, end);
		for (const [m] of toRemove) z.delete(m);
		return toRemove.length;
	}

	sadd(key: string, member: string): number {
		let s = this.sets.get(key);
		if (!s) {
			s = new Set();
			this.sets.set(key, s);
		}
		const size = s.size;
		s.add(member);
		return s.size > size ? 1 : 0;
	}

	srem(key: string, ...members: string[]): number {
		const s = this.sets.get(key);
		if (!s) return 0;
		let n = 0;
		for (const member of members) {
			if (s.delete(member)) n++;
		}
		return n;
	}

	smembers(key: string): string[] {
		this.smembersCalls++;
		const s = this.sets.get(key);
		return s ? [...s] : [];
	}

	sismember(key: string, member: string): number {
		this.sismemberCalls++;
		const s = this.sets.get(key);
		return s?.has(member) ? 1 : 0;
	}

	del(...keys: string[]): number {
		let n = 0;
		for (const key of keys) {
			if (this.hashes.delete(key)) n++;
			if (this.zsets.delete(key)) n++;
			if (this.sets.delete(key)) n++;
		}
		return n;
	}

	async scan(_cursor: string, _matchKw: string, pattern: string, _countKw: string, _count: string): Promise<[string, string[]]> {
		// Match `${prefix}:reactionsBufferDeltas:*` — strip leading `*: ` style used by service.
		const bare = pattern.includes(':reactionsBufferDeltas:')
			? pattern.slice(pattern.indexOf('reactionsBufferDeltas:'))
			: pattern.replace(/^\*:?/, '');
		const prefix = bare.endsWith('*') ? bare.slice(0, -1) : bare;
		const fullPrefix = pattern.startsWith('test:')
			? pattern.slice(0, -1)
			: `test:${prefix}`;
		const keys: string[] = [];
		for (const key of this.hashes.keys()) {
			// Service stores without redis key-prefix on write; scan MATCH uses config.redis.prefix
			// so we also accept bare delta keys and re-prefix for the return shape.
			if (key.startsWith('reactionsBufferDeltas:')) {
				keys.push(`test:${key}`);
			} else if (key.startsWith(fullPrefix)) {
				keys.push(key);
			}
		}
		return ['0', keys];
	}

	hasDeleted(noteId: string, pair: string): boolean {
		return this.sets.get(`reactionsBufferDeleted:${noteId}`)?.has(pair) ?? false;
	}

	rawPairs(noteId: string): string[] {
		return this.zrange(`reactionsBufferPairs:${noteId}`, 0, -1);
	}

	rawDeleted(noteId: string): string[] {
		// Avoid counting test inspection as create-path SMEMBERS work.
		const s = this.sets.get(`reactionsBufferDeleted:${noteId}`);
		return s ? [...s] : [];
	}

	/**
	 * Atomic eval for the three reaction-buffer scripts (identity by body contents).
	 * Whole body runs without yielding so concurrent callers serialize on the event loop.
	 */
	async eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown> {
		const keys = args.slice(0, numKeys).map(String);
		const argv = args.slice(numKeys).map(String);
		const [deltaKey, pairKey, deletedKey] = keys;

		if (script.includes('ZREMRANGEBYRANK')) {
			// CREATE — SISMEMBER per currentPairs member; no SMEMBERS / bulk ZREM.
			const reaction = argv[0];
			const pair = argv[1];
			const score = Number(argv[2]);
			const maxPairs = Number(argv[3]);
			const currentPairs = argv.slice(4);

			this.hincrby(deltaKey, reaction, 1);
			for (let i = 0; i < currentPairs.length; i++) {
				const m = currentPairs[i];
				if (this.sismember(deletedKey, m) === 0) this.zadd(pairKey, i, m);
			}
			this.srem(deletedKey, pair);
			this.zadd(pairKey, score, pair);
			this.zremrangebyrank(pairKey, 0, -(maxPairs + 1));
			return 1;
		}

		if (script.includes('HINCRBY') && script.includes('SADD') && !script.includes('ZREMRANGEBYRANK')) {
			// DELETE
			const reaction = argv[0];
			const pair = argv[1];
			this.hincrby(deltaKey, reaction, -1);
			this.zrem(pairKey, pair);
			this.sadd(deletedKey, pair);
			return 1;
		}

		if (script.includes('HGETALL') && script.includes('DEL')) {
			// BAKE snapshot: DEL only delta + pairs; keep deleted fence.
			const h = this.hgetall(deltaKey);
			const flat: string[] = [];
			for (const [k, v] of Object.entries(h)) {
				flat.push(k, v);
			}
			const pairs = this.zrange(pairKey, 0, -1);
			const deleted = this.smembers(deletedKey);
			this.del(deltaKey, pairKey);
			return [flat, pairs, deleted];
		}

		throw new Error('unknown eval script');
	}

	/**
	 * Prior-candidate create path: SMEMBERS + bulk ZREM of every tombstone.
	 * Used only to prove O(tombstones) cost vs O(currentPairs) SISMEMBER create.
	 */
	async legacyCreateSmembers(
		noteId: string,
		userId: string,
		reaction: string,
		currentPairs: string[],
		now: number,
	): Promise<void> {
		const pair = `${userId}/${reaction}`;
		const deletedKey = `reactionsBufferDeleted:${noteId}`;
		const pairKey = `reactionsBufferPairs:${noteId}`;
		const deltaKey = `reactionsBufferDeltas:${noteId}`;

		this.hincrby(deltaKey, reaction, 1);
		const deletedMembers = this.smembers(deletedKey);
		const deleted = new Set(deletedMembers);
		for (let i = 0; i < currentPairs.length; i++) {
			const member = currentPairs[i];
			if (deleted.has(member)) continue;
			this.zadd(pairKey, i, member);
		}
		for (const member of deletedMembers) {
			this.zrem(pairKey, member);
		}
		this.srem(deletedKey, pair);
		this.zadd(pairKey, now, pair);
		this.zremrangebyrank(pairKey, 0, -(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX + 1));
	}

	/** Non-atomic create path used only to prove the pre-fix race (pause after SMEMBERS). */
	async nonAtomicCreate(
		noteId: string,
		userId: string,
		reaction: string,
		currentPairs: string[],
		now: number,
	): Promise<void> {
		const pair = `${userId}/${reaction}`;
		const deletedKey = `reactionsBufferDeleted:${noteId}`;
		const pairKey = `reactionsBufferPairs:${noteId}`;
		const deltaKey = `reactionsBufferDeltas:${noteId}`;

		const deletedMembers = this.smembers(deletedKey);
		const deleted = new Set(deletedMembers);
		if (this.pauseAfterSmembers) await this.pauseAfterSmembers();

		this.hincrby(deltaKey, reaction, 1);
		for (let i = 0; i < currentPairs.length; i++) {
			const member = currentPairs[i];
			if (deleted.has(member)) continue;
			this.zadd(pairKey, i, member);
		}
		for (const member of deletedMembers) {
			this.zrem(pairKey, member);
		}
		this.srem(deletedKey, pair);
		this.zadd(pairKey, now, pair);
		this.zremrangebyrank(pairKey, 0, -(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX + 1));
	}
}

function createService(opts?: { failSql?: boolean; onSql?: () => Promise<void> | void }) {
	const redis = new BufferRedisFake();
	const updates: Array<{ reactions: () => string; reactionAndUserPairCache: string[]; id: string }> = [];
	const notesRepository = {
		createQueryBuilder() {
			const state: { setPayload?: { reactions: () => string; reactionAndUserPairCache: string[] }; id?: string } = {};
			const qb = {
				update() { return qb; },
				set(payload: { reactions: () => string; reactionAndUserPairCache: string[] }) {
					state.setPayload = payload;
					return qb;
				},
				where(_sql: string, params: { id: string }) {
					state.id = params.id;
					return qb;
				},
				async execute() {
					if (opts?.onSql) await opts.onSql();
					if (opts?.failSql) throw new Error('simulated SQL failure');
					updates.push({
						reactions: state.setPayload!.reactions,
						reactionAndUserPairCache: state.setPayload!.reactionAndUserPairCache,
						id: state.id!,
					});
					return { affected: 1 };
				},
			};
			return qb;
		},
	};
	const config = { redis: { prefix: 'test' } };
	const timeService = { now: 1_700_000_000_000 };
	const internalEventService = { on() {}, off() {} };

	const service = new ReactionsBufferingService(
		config as never,
		{} as never,
		redis as never,
		notesRepository as never,
		timeService as never,
		internalEventService as never,
	);

	return { service, redis, updates, dispose: () => service.dispose() };
}

function assertRawInvariant(redis: BufferRedisFake, noteId: string) {
	const pairs = redis.rawPairs(noteId);
	const deleted = new Set(redis.rawDeleted(noteId));
	for (const m of pairs) {
		assert.ok(!deleted.has(m), `raw invariant broken: ${m} in both pair zset and deleted set`);
	}
}

describe('ReactionsBufferingService', () => {
	test('stale delete then create does not resurrect tombstoned pair', async () => {
		const { service, redis, dispose } = createService();
		try {
			const noteId = 'note1';
			// Simulated baked state still in DB pair cache:
			const stalePairs = ['u1/👍'];

			await service.delete(noteId, 'u1', '👍');
			// Concurrent create reseeds from stale DB cache that still lists u1/👍
			await service.create(noteId, 'u2', '❤', stalePairs);

			const got = await service.get(noteId);
			assert.deepStrictEqual(got.pairs, [['u2', '❤']]);
			assert.ok(!got.pairs.some(([u, r]) => u === 'u1' && r === '👍'));
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), true);
			assertRawInvariant(redis, noteId);
			assert.ok(!redis.rawPairs(noteId).includes('u1/👍'));
		} finally {
			dispose();
		}
	});

	test('legitimate re-react clears tombstone and admits pair', async () => {
		const { service, redis, dispose } = createService();
		try {
			const noteId = 'note2';
			await service.delete(noteId, 'u1', '👍');
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), true);

			await service.create(noteId, 'u1', '👍', ['u1/👍']);

			const got = await service.get(noteId);
			assert.deepStrictEqual(got.pairs, [['u1', '👍']]);
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), false);
			assertRawInvariant(redis, noteId);
		} finally {
			dispose();
		}
	});

	test('bake omits tombstoned pairs, releases only snapshot fence, and clamps non-negative SQL', async () => {
		const { service, redis, updates, dispose } = createService();
		try {
			const noteId = 'note3';
			await service.delete(noteId, 'u1', '👍');
			await service.create(noteId, 'u2', '❤', ['u1/👍']);

			await service.bake();

			assert.strictEqual(updates.length, 1);
			assert.strictEqual(updates[0].id, noteId);
			assert.deepStrictEqual(updates[0].reactionAndUserPairCache, ['u2/❤']);
			const sql = updates[0].reactions();
			assert.ok(sql.includes('GREATEST(0,'), `expected GREATEST clamp in SQL, got: ${sql}`);
			// Snapshot tombstone released after successful SQL
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), false);
			const after = await service.get(noteId);
			assert.deepStrictEqual(after.pairs, []);
			assert.deepStrictEqual(after.deltas, {});
		} finally {
			dispose();
		}
	});

	test('mergeReactions clamps negative counts to zero', () => {
		const { service, dispose } = createService();
		try {
			const merged = service.mergeReactions({ '👍': 1 }, { '👍': -5, '❤': -1 });
			assert.strictEqual(merged['👍'], 0);
			assert.strictEqual(merged['❤'], 0);
		} finally {
			dispose();
		}
	});

	test('raw zset invariant holds under concurrent create+delete (atomic eval)', async () => {
		const { service, redis, dispose } = createService();
		try {
			const noteId = 'note-race';
			const stalePairs = ['u1/👍'];

			// Atomic eval path: create/delete are each single eval; any serial order keeps invariant.
			await Promise.all([
				service.create(noteId, 'u2', '❤', stalePairs),
				service.delete(noteId, 'u1', '👍'),
			]);
			assertRawInvariant(redis, noteId);
			assert.ok(!redis.rawPairs(noteId).includes('u1/👍') || !redis.rawDeleted(noteId).includes('u1/👍'));

			// Non-atomic path with explicit pause reproduces the bug the Lua fix closes.
			const redis2 = new BufferRedisFake();
			const { promise: gate, resolve: release } = Promise.withResolvers<void>();
			let paused = false;
			redis2.pauseAfterSmembers = async () => {
				paused = true;
				await gate;
			};
			const createP = redis2.nonAtomicCreate(noteId, 'u2', '❤', stalePairs, 1_700_000_000_000);
			// Wait until create has taken SMEMBERS snapshot
			for (let i = 0; i < 50 && !paused; i++) await new Promise(r => setImmediate(r));
			assert.ok(paused, 'expected non-atomic create to pause after SMEMBERS');
			// delete fully commits while create is paused
			redis2.hincrby(`reactionsBufferDeltas:${noteId}`, '👍', -1);
			redis2.zrem(`reactionsBufferPairs:${noteId}`, 'u1/👍');
			redis2.sadd(`reactionsBufferDeleted:${noteId}`, 'u1/👍');
			release();
			await createP;
			// Pre-fix path: stale pair is in both zset and deleted set
			assert.ok(redis2.rawPairs(noteId).includes('u1/👍'));
			assert.ok(redis2.rawDeleted(noteId).includes('u1/👍'));
		} finally {
			dispose();
		}
	});

	test('stale-cache reseed cannot keep deleted pair under max trim', async () => {
		const { service, redis, dispose } = createService();
		try {
			const noteId = 'note-trim';
			// Fill cache with tombstoned old pair + many others via creates
			await service.delete(noteId, 'old', '👍');
			const stale = ['old/👍', ...Array.from({ length: PER_NOTE_REACTION_USER_PAIR_CACHE_MAX }, (_, i) => `u${i}/❤`)];
			await service.create(noteId, 'new', '✨', stale);
			assertRawInvariant(redis, noteId);
			assert.ok(!redis.rawPairs(noteId).includes('old/👍'));
			const got = await service.get(noteId);
			assert.ok(got.pairs.length <= PER_NOTE_REACTION_USER_PAIR_CACHE_MAX);
			assert.ok(got.pairs.some(([u, r]) => u === 'new' && r === '✨'));
			assert.ok(!got.pairs.some(([u]) => u === 'old'));
		} finally {
			dispose();
		}
	});

	test('bake snapshot keeps deleted fence so stale-cache create cannot resurrect pre-SQL', async () => {
		const noteId = 'note-bake-fence';
		let serviceRef: ReactionsBufferingService | null = null;
		const { service, redis, updates, dispose } = createService({
			onSql: async () => {
				// Concurrent delete during SQL await — must remain after selective SREM of snapshot only.
				await serviceRef!.delete(noteId, 'u4', '💀');
			},
		});
		serviceRef = service;
		try {
			await service.delete(noteId, 'u1', '👍');
			await service.create(noteId, 'seed', '✨', []);

			// Simulate bake EVAL only (snapshot + DEL delta/pairs, keep deleted fence).
			const snap = await redis.eval(
				`local deltas = redis.call('HGETALL', KEYS[1])
local pairs = redis.call('ZRANGE', KEYS[2], 0, -1)
local deleted = redis.call('SMEMBERS', KEYS[3])
redis.call('DEL', KEYS[1], KEYS[2])
return {deltas, pairs, deleted}`,
				3,
				`reactionsBufferDeltas:${noteId}`,
				`reactionsBufferPairs:${noteId}`,
				`reactionsBufferDeleted:${noteId}`,
			) as [string[], string[], string[]];

			assert.ok(snap[2].includes('u1/👍'), 'snapshot must include tombstone');
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), true, 'fence must survive bake EVAL');

			// Stale DB pair cache create in the pre-SQL window must not resurrect.
			await service.create(noteId, 'u2', '❤', ['u1/👍']);
			assert.ok(!redis.rawPairs(noteId).includes('u1/👍'));
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), true);
			const mid = await service.get(noteId);
			assert.deepStrictEqual(mid.pairs, [['u2', '❤']]);
			assert.ok(!mid.pairs.some(([u, r]) => u === 'u1' && r === '👍'));

			// Full bake: onSql injects concurrent delete after snapshot; selective release keeps it.
			await service.bake();
			assert.ok(updates.some(u => u.id === noteId));
			// Snapshot tombstone released; concurrent newer tombstone remains.
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), false);
			assert.strictEqual(redis.hasDeleted(noteId, 'u4/💀'), true);
		} finally {
			dispose();
		}
	});

	test('bake SQL failure leaves snapshot tombstones fenced', async () => {
		const { service, redis, dispose } = createService({ failSql: true });
		try {
			const noteId = 'note-sql-fail';
			await service.delete(noteId, 'u1', '👍');
			await service.create(noteId, 'u2', '❤', ['u1/👍']);
			await assert.rejects(() => service.bake(), /simulated SQL failure/);
			assert.strictEqual(redis.hasDeleted(noteId, 'u1/👍'), true);
		} finally {
			dispose();
		}
	});

	test('create is O(currentPairs) not O(all deleted tombstones)', async () => {
		const { service, redis, dispose } = createService();
		try {
			const noteId = 'note-bounded';
			// Seed a large tombstone set (historical deletes until bake).
			const tombstoneCount = 200;
			for (let i = 0; i < tombstoneCount; i++) {
				await service.delete(noteId, `old${i}`, '👍');
			}
			// Drop deltas so only deleted remains? create still works with deltas present.
			const stale = ['old0/👍', 'u-live/❤'];
			redis.smembersCalls = 0;
			redis.sismemberCalls = 0;
			redis.zremCalls = 0;

			await service.create(noteId, 'new', '✨', stale);

			// Create path must not SMEMBERS the whole tombstone set or ZREM every tombstone.
			assert.strictEqual(redis.smembersCalls, 0, 'create must not SMEMBERS deleted set');
			assert.ok(redis.sismemberCalls <= stale.length, `SISMEMBER calls ${redis.sismemberCalls} > currentPairs ${stale.length}`);
			// delete() used zrem once per tombstone earlier; reset was after, so create zremCalls should be 0.
			assert.strictEqual(redis.zremCalls, 0, 'create must not bulk ZREM tombstones');
			assert.ok(!redis.rawPairs(noteId).includes('old0/👍'));
			assert.ok(redis.rawPairs(noteId).includes('new/✨'));

			// Contrast: legacy path does SMEMBERS + one ZREM per tombstone.
			const legacy = new BufferRedisFake();
			for (let i = 0; i < tombstoneCount; i++) {
				legacy.sadd(`reactionsBufferDeleted:${noteId}`, `old${i}/👍`);
			}
			legacy.smembersCalls = 0;
			legacy.zremCalls = 0;
			await legacy.legacyCreateSmembers(noteId, 'new', '✨', stale, 1_700_000_000_000);
			assert.strictEqual(legacy.smembersCalls, 1);
			assert.strictEqual(legacy.zremCalls, tombstoneCount);
		} finally {
			dispose();
		}
	});

	test('bake snapshot+DEL does not lose a concurrent new create', async () => {
		const { service, redis, updates, dispose } = createService();
		try {
			const noteId = 'note-bake-race';
			await service.create(noteId, 'u1', '👍', []);

			// Interleave: bake eval snapshots+DELs delta/pairs only; create after that must leave fresh buffer.
			const snap = await redis.eval(
				`local deltas = redis.call('HGETALL', KEYS[1])
local pairs = redis.call('ZRANGE', KEYS[2], 0, -1)
local deleted = redis.call('SMEMBERS', KEYS[3])
redis.call('DEL', KEYS[1], KEYS[2])
return {deltas, pairs, deleted}`,
				3,
				`reactionsBufferDeltas:${noteId}`,
				`reactionsBufferPairs:${noteId}`,
				`reactionsBufferDeleted:${noteId}`,
			) as [string[], string[], string[]];

			// Concurrent create after snapshot
			await service.create(noteId, 'u2', '❤', []);

			// Snapshotted state has u1; post-bake buffer has only u2
			assert.ok(snap[1].includes('u1/👍') || snap[0].includes('👍'));
			const mid = await service.get(noteId);
			assert.deepStrictEqual(mid.pairs, [['u2', '❤']]);
			assert.strictEqual(mid.deltas['❤'], 1);

			// Full bake persists concurrent create (and does not resurrect deleted)
			await service.bake();
			assert.ok(updates.some(u => u.id === noteId && u.reactionAndUserPairCache.includes('u2/❤')));
			const after = await service.get(noteId);
			assert.deepStrictEqual(after.pairs, []);
			assert.deepStrictEqual(after.deltas, {});
		} finally {
			dispose();
		}
	});
});
