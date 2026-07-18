/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { MAX_REGISTRY_KEYS_PER_DOMAIN, RegistryApiService } from '@/core/RegistryApiService.js';

describe('RegistryApiService.set', () => {
	type Row = {
		id: string;
		userId: string;
		domain: string | null;
		scope: string[];
		key: string;
		value: any;
	};

	function scopeKey(scope: string[]) {
		return scope.join('\0');
	}

	function createService(seed: Row[] = []) {
		const rows: Row[] = seed.map(r => ({ ...r, scope: [...r.scope] }));
		const lockQueue: Array<() => void> = [];
		let lockHeld = false;

		const acquireLock = async () => {
			if (!lockHeld) {
				lockHeld = true;
				return;
			}
			await new Promise<void>(resolve => {
				lockQueue.push(resolve);
			});
			lockHeld = true;
		};
		const releaseLock = () => {
			const next = lockQueue.shift();
			if (next) {
				// keep held for the waiter that just acquired
				next();
			} else {
				lockHeld = false;
			}
		};

		const queryCalls: Array<{ sql: string; params: unknown[] }> = [];
		const insertExecute = jest.fn(async (values: Partial<Row>) => {
			const idx = rows.findIndex(r =>
				r.userId === values.userId
				&& r.domain === values.domain
				&& r.key === values.key
				&& scopeKey(r.scope) === scopeKey(values.scope as string[]),
			);
			if (idx >= 0) {
				rows[idx] = {
					...rows[idx],
					value: values.value,
				};
			} else {
				rows.push({
					id: values.id as string,
					userId: values.userId as string,
					domain: (values.domain ?? null) as string | null,
					scope: [...(values.scope as string[])],
					key: values.key as string,
					value: values.value,
				});
			}
		});

		const orUpdate = jest.fn(function (this: { _values: Partial<Row> }) {
			return {
				execute: async () => insertExecute(this._values),
			};
		});
		const values = jest.fn(function (this: { _values?: Partial<Row> }, v: Partial<Row>) {
			this._values = v;
			return { orUpdate: orUpdate.bind(this), _values: v };
		});
		const into = jest.fn(function (this: any) {
			return { values: values.bind(this) };
		});
		const insert = jest.fn(function (this: any) {
			return { into: into.bind(this), values: values.bind(this) };
		});

		const createQueryBuilder = jest.fn((entityOrAlias?: unknown, maybeAlias?: string) => {
			const alias = typeof entityOrAlias === 'string' ? entityOrAlias : maybeAlias;
			if (alias === 'item') {
				const filters: {
					userId?: string;
					domain?: string | null;
					domainIsNull?: boolean;
					key?: string;
					scope?: string[];
				} = {};
				const chain: Record<string, any> = {};
				const self = () => chain;
				const applyWhere = (clause: string, params?: Record<string, unknown>) => {
					if (clause.includes('userId') && params?.userId != null) filters.userId = params.userId as string;
					if (clause.includes('domain IS NULL')) filters.domainIsNull = true;
					if (clause.includes('domain = :domain') && 'domain' in (params ?? {})) {
						filters.domain = params!.domain as string | null;
						filters.domainIsNull = false;
					}
					if (clause.includes('item.key') && params?.key != null) filters.key = params.key as string;
					if (clause.includes('item.scope') && params?.scope != null) filters.scope = params.scope as string[];
					return chain;
				};
				const matching = () => rows.filter(r => {
					if (filters.userId != null && r.userId !== filters.userId) return false;
					if (filters.domainIsNull) {
						if (r.domain != null) return false;
					} else if (filters.domain !== undefined) {
						if (r.domain !== filters.domain) return false;
					}
					if (filters.key != null && r.key !== filters.key) return false;
					if (filters.scope != null && scopeKey(r.scope) !== scopeKey(filters.scope)) return false;
					return true;
				});
				chain.where = jest.fn(applyWhere);
				chain.andWhere = jest.fn(applyWhere);
				chain.orderBy = jest.fn(self);
				chain.addOrderBy = jest.fn(self);
				chain.getOne = jest.fn(async () => matching()[0] ?? null);
				chain.getCount = jest.fn(async () => matching().length);
				return chain;
			}
			// insert path (no alias)
			return { insert };
		});

		const tem = {
			query: jest.fn(async (sql: string, params: unknown[] = []) => {
				queryCalls.push({ sql, params });
				if (String(sql).includes('pg_advisory_xact_lock')) {
					await acquireLock();
				}
				return [];
			}),
			createQueryBuilder,
		};

		const db = {
			transaction: jest.fn(async (cb: (manager: typeof tem) => Promise<void>) => {
				try {
					await cb(tem);
				} finally {
					releaseLock();
				}
			}),
		};

		const registryItemsRepository = {
			createQueryBuilder: jest.fn(() => {
				throw new Error('root repository must not be used inside set()');
			}),
		};
		const idService = {
			gen: jest.fn(() => `id-${idService.gen.mock.calls.length + 1}`),
		};
		// fix circular: redefine after
		idService.gen = jest.fn(() => `id-${(idService.gen as jest.Mock).mock.calls.length}`);
		// simpler:
		let idSeq = 0;
		idService.gen = jest.fn(() => {
			idSeq += 1;
			return `generated-id-${idSeq}`;
		});

		const globalEventService = {
			publishMainStream: jest.fn(async () => undefined),
		};
		const timeService = { date: new Date('2026-01-01T00:00:00.000Z') };

		const service = new RegistryApiService(
			registryItemsRepository as never,
			db as never,
			idService as never,
			globalEventService as never,
			timeService as never,
		);

		return {
			service,
			rows,
			db,
			tem,
			queryCalls,
			insert,
			into,
			values,
			orUpdate,
			insertExecute,
			createQueryBuilder,
			globalEventService,
			idService,
			registryItemsRepository,
		};
	}

	test('null-domain set uses on-conflict upsert and publishes registryUpdated', async () => {
		const { service, insert, values, orUpdate, insertExecute, globalEventService, queryCalls } = createService();

		await service.set('user1', null, ['client', 'pizzax'], 'theme', { dark: true });

		expect(queryCalls[0]?.sql).toContain('pg_advisory_xact_lock');
		expect(queryCalls[0]?.params).toEqual(['registry-key-bound', 'user1\0']);
		expect(insert).toHaveBeenCalled();
		expect(values).toHaveBeenCalledWith(expect.objectContaining({
			userId: 'user1',
			domain: null,
			scope: ['client', 'pizzax'],
			key: 'theme',
			value: { dark: true },
		}));
		expect(orUpdate).toHaveBeenCalledWith(
			['updatedAt', 'value'],
			['userId', 'key', 'scope', 'domain'],
			{ upsertType: 'on-conflict-do-update' },
		);
		expect(insertExecute).toHaveBeenCalled();
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'user1',
			'registryUpdated',
			{ scope: ['client', 'pizzax'], key: 'theme', value: { dark: true } },
		);
	});

	test('non-null domain set upserts without main-stream publish', async () => {
		const { service, orUpdate, globalEventService, queryCalls } = createService();

		await service.set('user1', 'token-id', ['app'], 'pref', 1);

		expect(queryCalls[0]?.params).toEqual(['registry-key-bound', 'user1\0token-id']);
		expect(orUpdate).toHaveBeenCalled();
		expect(globalEventService.publishMainStream).not.toHaveBeenCalled();
	});

	test('rejects creating a new key when domain key count is at the bound', async () => {
		const seed: Row[] = Array.from({ length: MAX_REGISTRY_KEYS_PER_DOMAIN }, (_, i) => ({
			id: `seed-${i}`,
			userId: 'user1',
			domain: null,
			scope: ['client'],
			key: `k${i}`,
			value: i,
		}));
		const { service, insert, globalEventService } = createService(seed);

		await expect(service.set('user1', null, ['client'], 'new-key', 'x')).rejects.toBeInstanceOf(IdentifiableError);
		await expect(service.set('user1', null, ['client'], 'new-key', 'x')).rejects.toMatchObject({
			id: '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74',
		});
		expect(insert).not.toHaveBeenCalled();
		expect(globalEventService.publishMainStream).not.toHaveBeenCalled();
	});

	test('allows updating an existing key when domain key count is at the bound', async () => {
		const seed: Row[] = Array.from({ length: MAX_REGISTRY_KEYS_PER_DOMAIN }, (_, i) => ({
			id: `seed-${i}`,
			userId: 'user1',
			domain: null,
			scope: ['client'],
			key: i === 0 ? 'existing-key' : `k${i}`,
			value: i,
		}));
		const { service, insertExecute, globalEventService, rows } = createService(seed);

		await service.set('user1', null, ['client'], 'existing-key', 'updated');

		expect(insertExecute).toHaveBeenCalled();
		expect(rows).toHaveLength(MAX_REGISTRY_KEYS_PER_DOMAIN);
		expect(rows.find(r => r.key === 'existing-key')?.value).toBe('updated');
		expect(globalEventService.publishMainStream).toHaveBeenCalledWith(
			'user1',
			'registryUpdated',
			{ scope: ['client'], key: 'existing-key', value: 'updated' },
		);
	});

	test('concurrent same-key sets both use upsert conflict target', async () => {
		const { service, orUpdate, rows } = createService();

		await Promise.all([
			service.set('user1', null, ['client'], 'race', 'a'),
			service.set('user1', null, ['client'], 'race', 'b'),
		]);

		expect(orUpdate).toHaveBeenCalledTimes(2);
		expect(orUpdate.mock.calls.every(call =>
			call[0][0] === 'updatedAt'
			&& call[1].includes('domain')
			&& (call[2] as { upsertType: string }).upsertType === 'on-conflict-do-update',
		)).toBe(true);
		expect(rows.filter(r => r.key === 'race')).toHaveLength(1);
	});

	test('at 1023, two concurrent distinct new keys yield one success and one capacity error with final 1024', async () => {
		const seed: Row[] = Array.from({ length: MAX_REGISTRY_KEYS_PER_DOMAIN - 1 }, (_, i) => ({
			id: `seed-${i}`,
			userId: 'user1',
			domain: null,
			scope: ['client'],
			key: `k${i}`,
			value: i,
		}));
		const { service, rows, globalEventService } = createService(seed);

		const results = await Promise.allSettled([
			service.set('user1', null, ['client'], 'new-a', 'A'),
			service.set('user1', null, ['client'], 'new-b', 'B'),
		]);

		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');
		expect(fulfilled).toHaveLength(1);
		expect(rejected).toHaveLength(1);
		expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({
			id: '4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74',
		});
		expect(rows).toHaveLength(MAX_REGISTRY_KEYS_PER_DOMAIN);
		expect(rows.filter(r => r.key === 'new-a' || r.key === 'new-b')).toHaveLength(1);
		expect(globalEventService.publishMainStream).toHaveBeenCalledTimes(1);
	});
});
