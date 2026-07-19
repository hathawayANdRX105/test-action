/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { DriveService } from '@/core/DriveService.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiDriveFile } from '@/models/DriveFile.js';

const NO_FREE_SPACE_ID = 'c6244ed2-a39a-4e1c-bf93-f0fbd7764fa6';
const FILE_SIZE = 600 * 1024;
const CAPACITY_MB = 1;

function createLoggerService() {
	const sub = {
		debug: jest.fn(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		createSubLogger: jest.fn(),
	};
	sub.createSubLogger.mockReturnValue(sub);
	return {
		getLogger: jest.fn(() => sub),
	};
}

/**
 * Deterministic per-user transaction mutex (simulates pg_advisory_xact_lock
 * held for the full transaction callback, released only after commit/rollback).
 */
function createTxHarness(opts?: {
	driveCapacityMb?: number;
	maxFileSizeMb?: number;
	initialUsage?: number;
	slowInsertAfterSum?: boolean;
	cleanupThrows?: boolean;
}) {
	const capacityMb = opts?.driveCapacityMb ?? CAPACITY_MB;
	const maxFileSizeMb = opts?.maxFileSizeMb ?? 10;
	let usage = opts?.initialUsage ?? 0;
	const stored: MiDriveFile[] = [];
	let idSeq = 0;
	const materializeEvents: string[] = [];
	const txEvents: string[] = [];
	const deletedKeys: string[] = [];
	const fileInfoByPath = new Map<string, { size: number; md5: string }>();

	// Global mutex chain: held for entire transaction callback.
	let chain: Promise<void> = Promise.resolve();
	let txSeq = 0;

	const afterSum = opts?.slowInsertAfterSum
		? Promise.withResolvers<void>()
		: null;

	const driveFilesRepository = {
		findOneBy: jest.fn(async () => null),
		// insertOne must not be used on capacity path; keep for isLink/save.
		insertOne: jest.fn(async (file: MiDriveFile) => {
			const saved = { ...file } as MiDriveFile;
			stored.push(saved);
			if (!saved.isLink) {
				usage += saved.size;
			}
			return saved;
		}),
	};

	const driveFileEntityService = {
		validateFileName: jest.fn(() => true),
		calcDriveUsageOf: jest.fn(async () => usage),
		pack: jest.fn(async (file: MiDriveFile) => file),
	};

	const roleService = {
		getUserPolicies: jest.fn(async () => ({
			alwaysMarkNsfw: false,
			driveCapacityMb: capacityMb,
			maxFileSizeMb,
		})),
	};

	const cacheService = {
		userProfileCache: {
			fetchMaybe: jest.fn(async () => ({
				alwaysMarkNsfw: false,
				defaultSensitive: false,
				autoSensitive: false,
			})),
		},
		findRemoteUserById: jest.fn(),
	};

	const meta = {
		useObjectStorage: false,
		mediaSilencedHosts: [] as string[],
		enableChartsForFederatedInstances: false,
	};

	const internalStorageService = {
		saveFromPath: jest.fn(async (key: string) => {
			materializeEvents.push(`store:${key}`);
			await Promise.resolve();
			return `https://files.example/${key}`;
		}),
		saveFromBuffer: jest.fn(async (key: string) => `https://files.example/${key}`),
		del: jest.fn(async (key: string) => {
			if (opts?.cleanupThrows) {
				throw new Error('cleanup boom');
			}
			deletedKeys.push(key);
		}),
	};

	const fileInfoService = {
		getFileInfo: jest.fn(async (path: string) => {
			const info = fileInfoByPath.get(path);
			if (!info) throw new Error(`missing file info for ${path}`);
			return {
				size: info.size,
				md5: info.md5,
				type: { mime: 'application/octet-stream', ext: 'bin' },
				width: undefined,
				height: undefined,
				orientation: undefined,
				blurhash: null,
				sensitive: false,
				porn: false,
			};
		}),
	};

	const idService = {
		gen: jest.fn(() => `file-${++idSeq}`),
	};

	const utilityService = {
		isMediaSilencedHost: jest.fn(() => false),
	};

	const chartStub = { update: jest.fn(async () => {}) };
	const globalEventService = {
		publishMainStream: jest.fn(),
		publishDriveStream: jest.fn(),
	};

	function makeInsertQueryBuilder() {
		const qb: {
			insert: () => typeof qb;
			into: () => typeof qb;
			values: (entity: MiDriveFile) => typeof qb;
			execute: () => Promise<{ raw: { id: string }[]; identifiers: { id: string }[] }>;
			_values?: MiDriveFile;
		} = {
			insert: () => qb,
			into: () => qb,
			values: (entity: MiDriveFile) => {
				qb._values = entity;
				return qb;
			},
			execute: async () => {
				const entity = qb._values!;
				txEvents.push('insert');
				const saved = { ...entity } as MiDriveFile;
				// Mutex covers the whole TX callback, so usage mutates under the lock.
				if (!saved.isLink) {
					usage += saved.size;
				}
				stored.push(saved);
				return { raw: [{ id: saved.id }], identifiers: [{ id: saved.id }] };
			},
		};
		return qb;
	}

	function makeSumQueryBuilder(label: string) {
		const qb: {
			select: () => typeof qb;
			where: () => typeof qb;
			andWhere: () => typeof qb;
			getRawOne: () => Promise<{ sum: string }>;
		} = {
			select: () => qb,
			where: () => qb,
			andWhere: () => qb,
			getRawOne: async () => {
				txEvents.push(`${label}:sum`);
				// Hold lock after SUM so a concurrent TX can queue, then insert after release.
				if (label === 'A' && afterSum) {
					await afterSum.promise;
				}
				return { sum: String(usage) };
			},
		};
		return qb;
	}

	const transaction = jest.fn(async (fn: (tem: {
		query: (sql: string, params?: unknown[]) => Promise<undefined>;
		createQueryBuilder: (...args: unknown[]) => unknown;
		findOneByOrFail: (entity: unknown, where: { id: string }) => Promise<MiDriveFile>;
	}) => Promise<MiDriveFile>) => {
		const mySeq = ++txSeq;
		const label = mySeq === 1 ? 'A' : mySeq === 2 ? 'B' : `T${mySeq}`;

		const prev = chain;
		const gate = Promise.withResolvers<void>();
		chain = prev.then(() => gate.promise);

		// Wait for previous TX to fully commit/rollback (mutex held for whole callback).
		if (mySeq > 1) {
			txEvents.push(`${label}:wait`);
		}
		await prev;

		txEvents.push(`${label}:lock`);

		const tem = {
			query: jest.fn(async (_sql: string, _params?: unknown[]) => undefined),
			createQueryBuilder: jest.fn((...args: unknown[]) => {
				// SUM: createQueryBuilder(MiDriveFile, 'file')
				// INSERT: createQueryBuilder() with no entity
				if (args.length === 0) {
					return makeInsertQueryBuilder();
				}
				return makeSumQueryBuilder(label);
			}),
			findOneByOrFail: jest.fn(async (_entity: unknown, where: { id: string }) => {
				const found = stored.find(f => f.id === where.id);
				if (!found) throw new Error(`missing ${where.id}`);
				return { ...found } as MiDriveFile;
			}),
		};

		try {
			const result = await fn(tem);
			txEvents.push(`${label}:commit`);
			return result;
		} catch (err) {
			txEvents.push(`${label}:rollback`);
			throw err;
		} finally {
			gate.resolve();
		}
	});

	const db = { transaction };

	const service = new DriveService(
		{} as never, // config
		meta as never,
		{} as never, // usersRepository
		{} as never, // userProfilesRepository
		driveFilesRepository as never,
		db as never, // DI.db
		{ findOneBy: jest.fn(async () => null) } as never, // driveFoldersRepository
		fileInfoService as never,
		{} as never, // userEntityService
		driveFileEntityService as never,
		idService as never,
		{} as never, // downloadService
		internalStorageService as never,
		{} as never, // s3Service
		{ usingBunnyCDN: () => false } as never, // bunnyService
		{} as never, // imageProcessingService
		{} as never, // videoProcessingService
		globalEventService as never,
		{} as never, // queueService
		roleService as never,
		{} as never, // moderationLogService
		chartStub as never,
		chartStub as never,
		chartStub as never,
		utilityService as never,
		cacheService as never,
		createLoggerService() as never,
	);

	return {
		service,
		stored,
		getUsage: () => usage,
		capacityBytes: capacityMb * 1024 * 1024,
		fileInfoByPath,
		driveFilesRepository,
		driveFileEntityService,
		roleService,
		cacheService,
		internalStorageService,
		materializeEvents,
		txEvents,
		deletedKeys,
		transaction,
		afterSum,
		db,
	};
}

async function waitForEvent(events: string[], name: string, maxTicks = 200): Promise<void> {
	for (let i = 0; i < maxTicks; i++) {
		if (events.includes(name)) return;
		await new Promise<void>(resolve => setImmediate(resolve));
	}
	throw new Error(`timed out waiting for ${name}; saw ${JSON.stringify(events)}`);
}

describe('DriveService capacity race', () => {
	const user = { id: 'user-1', host: null } as const;

	test('concurrent non-link uploads materialize outside TX; one durable row and one NoFreeSpace', async () => {
		const harness = createTxHarness();
		harness.fileInfoByPath.set('/tmp/a.bin', { size: FILE_SIZE, md5: 'md5-a' });
		harness.fileInfoByPath.set('/tmp/b.bin', { size: FILE_SIZE, md5: 'md5-b' });

		const results = await Promise.allSettled([
			harness.service.addFile({ user: user as never, path: '/tmp/a.bin', name: 'a.bin', force: true }),
			harness.service.addFile({ user: user as never, path: '/tmp/b.bin', name: 'b.bin', force: true }),
		]);

		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');

		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(IdentifiableError);
		expect(((rejected[0] as PromiseRejectedResult).reason as IdentifiableError).id).toBe(NO_FREE_SPACE_ID);
		expect(harness.stored).toHaveLength(1);
		expect(harness.getUsage()).toBe(FILE_SIZE);
		expect(harness.getUsage()).toBeLessThanOrEqual(harness.capacityBytes);

		// Both materializations complete outside the capacity TX.
		expect(harness.internalStorageService.saveFromPath).toHaveBeenCalledTimes(2);
		expect(harness.transaction).toHaveBeenCalledTimes(2);
		// insertOne must not be used for capacity path.
		expect(harness.driveFilesRepository.insertOne).not.toHaveBeenCalled();

		expect(harness.deletedKeys.length).toBeGreaterThanOrEqual(1);
		const winner = harness.stored[0]!;
		expect(harness.deletedKeys).not.toContain(winner.accessKey);
	});

	test('slow first TX: second re-SUMs after first commit and rejects', async () => {
		const harness = createTxHarness({ slowInsertAfterSum: true });
		harness.fileInfoByPath.set('/tmp/a.bin', { size: FILE_SIZE, md5: 'md5-a' });
		harness.fileInfoByPath.set('/tmp/b.bin', { size: FILE_SIZE, md5: 'md5-b' });

		const p1 = harness.service.addFile({ user: user as never, path: '/tmp/a.bin', name: 'a.bin', force: true });
		// Wait until A has taken the lock and SUMmed (held on afterSum barrier).
		await waitForEvent(harness.txEvents, 'A:sum');

		const p2 = harness.service.addFile({ user: user as never, path: '/tmp/b.bin', name: 'b.bin', force: true });
		// B reaches the mutex while A still holds afterSum.
		await waitForEvent(harness.txEvents, 'B:wait');
		// B must not have sum yet while A holds the lock.
		expect(harness.txEvents.filter(e => e === 'B:sum')).toHaveLength(0);
		expect(harness.txEvents.filter(e => e === 'B:lock')).toHaveLength(0);

		// Release A to insert+commit.
		harness.afterSum!.resolve();

		const results = await Promise.allSettled([p1, p2]);
		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect(((rejected[0] as PromiseRejectedResult).reason as IdentifiableError).id).toBe(NO_FREE_SPACE_ID);
		expect(harness.stored).toHaveLength(1);
		expect(harness.getUsage()).toBe(FILE_SIZE);

		// Ordering: A lock/sum before B lock/sum; A commit before B sum.
		const idx = (e: string) => harness.txEvents.indexOf(e);
		expect(idx('A:lock')).toBeGreaterThanOrEqual(0);
		expect(idx('A:sum')).toBeGreaterThan(idx('A:lock'));
		expect(idx('A:commit')).toBeGreaterThan(idx('A:sum'));
		expect(idx('B:wait')).toBeGreaterThan(idx('A:sum'));
		expect(idx('B:lock')).toBeGreaterThan(idx('A:commit'));
		expect(idx('B:sum')).toBeGreaterThan(idx('B:lock'));
		expect(idx('B:rollback')).toBeGreaterThan(idx('B:sum'));
	});

	test('single upload under capacity succeeds', async () => {
		const harness = createTxHarness();
		harness.fileInfoByPath.set('/tmp/ok.bin', { size: FILE_SIZE, md5: 'md5-ok' });

		const file = await harness.service.addFile({
			user: user as never,
			path: '/tmp/ok.bin',
			name: 'ok.bin',
			force: true,
		});

		expect(file.id).toBeDefined();
		expect(harness.stored).toHaveLength(1);
		expect(harness.getUsage()).toBe(FILE_SIZE);
		expect(harness.deletedKeys).toHaveLength(0);
		expect(harness.driveFilesRepository.insertOne).not.toHaveBeenCalled();
	});

	test('upload that would exceed remaining capacity fails with NO_FREE_SPACE and cleans blob', async () => {
		const harness = createTxHarness({ initialUsage: FILE_SIZE });
		harness.fileInfoByPath.set('/tmp/over.bin', { size: FILE_SIZE, md5: 'md5-over' });

		await expect(harness.service.addFile({
			user: user as never,
			path: '/tmp/over.bin',
			name: 'over.bin',
			force: true,
		})).rejects.toMatchObject({ id: NO_FREE_SPACE_ID });

		expect(harness.stored).toHaveLength(0);
		expect(harness.getUsage()).toBe(FILE_SIZE);
		expect(harness.internalStorageService.saveFromPath).toHaveBeenCalled();
		expect(harness.deletedKeys.length).toBeGreaterThanOrEqual(1);
	});

	test('cleanup failure still preserves NoFreeSpace id', async () => {
		const harness = createTxHarness({ initialUsage: FILE_SIZE, cleanupThrows: true });
		harness.fileInfoByPath.set('/tmp/over.bin', { size: FILE_SIZE, md5: 'md5-over' });

		await expect(harness.service.addFile({
			user: user as never,
			path: '/tmp/over.bin',
			name: 'over.bin',
			force: true,
		})).rejects.toMatchObject({ id: NO_FREE_SPACE_ID });

		expect(harness.stored).toHaveLength(0);
	});

	test('isLink uploads skip capacity transaction and do not consume usage', async () => {
		const harness = createTxHarness({ initialUsage: CAPACITY_MB * 1024 * 1024 });
		harness.fileInfoByPath.set('/tmp/link.bin', { size: FILE_SIZE, md5: 'md5-link' });

		const before = harness.getUsage();
		const file = await harness.service.addFile({
			user: user as never,
			path: '/tmp/link.bin',
			name: 'link.bin',
			force: true,
			isLink: true,
			url: 'https://remote.example/link.bin',
		});

		expect(file.isLink).toBe(true);
		expect(file.size).toBe(0);
		expect(harness.getUsage()).toBe(before);
		expect(harness.transaction).not.toHaveBeenCalled();
		expect(harness.internalStorageService.saveFromPath).not.toHaveBeenCalled();
		expect(harness.driveFilesRepository.insertOne).toHaveBeenCalled();
	});

	test('remote over-cap insert commits then expires to full capacity', async () => {
		const remoteUser = { id: 'remote-1', host: 'remote.example' } as const;
		const harness = createTxHarness({ initialUsage: FILE_SIZE });
		harness.fileInfoByPath.set('/tmp/remote.bin', { size: FILE_SIZE, md5: 'md5-remote' });

		const remote = {
			id: remoteUser.id,
			host: remoteUser.host,
			avatarId: null,
			bannerId: null,
			backgroundId: null,
		};
		harness.cacheService.findRemoteUserById.mockImplementation(async () => remote);

		const expireCalls: Array<{ capacity: number; sawCommit: boolean }> = [];
		Object.defineProperty(harness.service, 'expireOldFile', {
			configurable: true,
			value: jest.fn(async (_user: unknown, driveCapacity: number) => {
				expireCalls.push({
					capacity: driveCapacity,
					sawCommit: harness.txEvents.includes('A:commit'),
				});
			}),
		});

		const file = await harness.service.addFile({
			user: remoteUser as never,
			path: '/tmp/remote.bin',
			name: 'remote.bin',
			force: true,
		});

		// Soft-quota: remote insert is durable even when over capacity.
		expect(file.id).toBeDefined();
		expect(harness.stored).toHaveLength(1);
		expect(harness.getUsage()).toBe(FILE_SIZE * 2);
		expect(harness.txEvents).toEqual(expect.arrayContaining(['A:lock', 'A:sum', 'insert', 'A:commit']));

		// Expire runs only after commit, targeting full capacity (SUM includes new row).
		expect(expireCalls).toHaveLength(1);
		expect(expireCalls[0]!.sawCommit).toBe(true);
		expect(expireCalls[0]!.capacity).toBe(harness.capacityBytes);
		// Old bug used remaining capacity (driveCapacity - billedSize) and over-pruned.
		expect(expireCalls[0]!.capacity).not.toBe(harness.capacityBytes - FILE_SIZE);
		expect(harness.cacheService.findRemoteUserById).toHaveBeenCalledWith(remoteUser.id);
	});
});
