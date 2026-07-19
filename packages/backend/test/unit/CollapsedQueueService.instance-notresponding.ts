/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert';
import { CollapsedQueueService, type UpdateInstanceJob } from '@/core/CollapsedQueueService.js';
import { FakeCacheManagementService } from '../misc/FakeCacheManagementService.js';

type InstanceRow = {
	latestRequestReceivedAt: Date | null;
	notRespondingSince: Date | null;
	isNotResponding: boolean;
};

type CapturedUpdate = {
	values: Record<string, unknown>;
	parameters: Record<string, unknown>;
};

/**
 * Apply the SQL fragments UpdateBuilder emits for not-responding fields.
 * Only the GREATEST / CASE patterns used by updateInstanceQueue.perform.
 */
function applyInstanceUpdate(row: InstanceRow, capture: CapturedUpdate): InstanceRow {
	const next: InstanceRow = { ...row };
	const params = capture.parameters;

	if ('latestRequestReceivedAt' in capture.values) {
		const expr = capture.values.latestRequestReceivedAt;
		assert.equal(typeof expr, 'function');
		const sql = (expr as () => string)();
		assert.match(sql, /GREATEST\("latestRequestReceivedAt", :latestRequestReceivedAt\)/);
		const incoming = params.latestRequestReceivedAt as Date;
		const cur = next.latestRequestReceivedAt;
		next.latestRequestReceivedAt = cur == null || incoming.getTime() > cur.getTime() ? incoming : cur;
	}

	if ('notRespondingSince' in capture.values) {
		const val = capture.values.notRespondingSince;
		if (typeof val === 'function') {
			const sql = (val as () => string)();
			assert.match(sql, /WHEN "latestRequestReceivedAt" IS NOT NULL AND "latestRequestReceivedAt" >= :notRespondingSince THEN "notRespondingSince"/);
			assert.match(sql, /WHEN "notRespondingSince" IS NULL THEN :notRespondingSince/);
			assert.match(sql, /ELSE LEAST\("notRespondingSince", :notRespondingSince\)/);
			const incoming = params.notRespondingSince as Date;
			const recv = next.latestRequestReceivedAt;
			if (recv != null && recv.getTime() >= incoming.getTime()) {
				// keep existing notRespondingSince (may still be null)
			} else if (next.notRespondingSince == null) {
				next.notRespondingSince = incoming;
			} else {
				next.notRespondingSince = next.notRespondingSince.getTime() < incoming.getTime()
					? next.notRespondingSince
					: incoming;
			}
		} else {
			assert.equal(val, null);
			next.notRespondingSince = null;
		}
	}

	if ('isNotResponding' in capture.values) {
		const val = capture.values.isNotResponding;
		if (typeof val === 'function') {
			const sql = (val as () => string)();
			assert.match(sql, /IS NOT NULL/);
			// Must embed the same CASE text as notRespondingSince (atomic derive).
			assert.match(sql, /WHEN "notRespondingSince" IS NULL THEN :notRespondingSince/);
			next.isNotResponding = next.notRespondingSince != null;
		} else {
			assert.equal(typeof val, 'boolean');
			next.isNotResponding = val as boolean;
		}
	}

	// Contract: flag and timestamp must agree after every timestamp-touching update.
	assert.equal(next.isNotResponding, next.notRespondingSince != null);
	return next;
}

function createService(onUpdate: (host: string, capture: CapturedUpdate) => void) {
	const createQueryBuilder = () => {
		let whereHost: string | undefined;
		const capture: CapturedUpdate = { values: {}, parameters: {} };
		const qb = {
			update() {
				return qb;
			},
			where(where: { host?: string }) {
				whereHost = where.host;
				return qb;
			},
			setParameters(parameters: Record<string, unknown>) {
				Object.assign(capture.parameters, parameters);
				return qb;
			},
			set(values: Record<string, unknown>) {
				capture.values = values;
				return qb;
			},
			async execute() {
				assert.ok(whereHost);
				onUpdate(whereHost, capture);
				return { affected: 1 };
			},
		};
		return qb;
	};

	const instancesRepository = {
		createQueryBuilder,
	};

	const unusedRepo = {} as never;
	const federatedInstanceService = {
		refresh: async () => undefined,
	};
	const internalEventService = { on() {}, off() {} } as never;
	const antennaService = {} as never;
	const cacheService = {} as never;
	const cacheManagementService = FakeCacheManagementService.create();

	return new CollapsedQueueService(
		unusedRepo,
		unusedRepo,
		unusedRepo,
		unusedRepo,
		unusedRepo,
		unusedRepo,
		instancesRepository as never,
		federatedInstanceService as never,
		internalEventService,
		antennaService,
		cacheService,
		cacheManagementService,
	);
}

describe('CollapsedQueueService updateInstance not-responding atomicity', () => {
	test('first failure sets notRespondingSince and derives isNotResponding together', async () => {
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: null,
			isNotResponding: false,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		const t1 = new Date('2026-01-01T00:00:00.000Z');
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, true);
		assert.equal(row.notRespondingSince?.toISOString(), t1.toISOString());
	});

	test('stale failure after newer receive leaves responding fields agreed', async () => {
		const t1 = new Date('2026-01-01T00:00:00.000Z');
		const t2 = new Date('2026-01-02T00:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: t2,
			notRespondingSince: null,
			isNotResponding: false,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		// Inbox/success already advanced receive; a stale deliver-fail must not re-break.
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);
		assert.equal(row.latestRequestReceivedAt?.toISOString(), t2.toISOString());
	});

	test('collapsed inbox+failure interleave clears both fields together', async () => {
		const t1 = new Date('2026-01-01T00:00:00.000Z');
		const t2 = new Date('2026-01-02T00:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: t1,
			isNotResponding: true,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		// Same collapse window: fail mark + inbox receive → responding wins.
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 } satisfies UpdateInstanceJob);
		service.updateInstanceQueue.enqueue('remote.example', { latestRequestReceivedAt: t2 });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);
		assert.equal(row.latestRequestReceivedAt?.toISOString(), t2.toISOString());
	});

	test('sequential receive then stale fail ends agreed responding', async () => {
		const t1 = new Date('2026-01-01T00:00:00.000Z');
		const t2 = new Date('2026-01-02T00:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: null,
			isNotResponding: false,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		service.updateInstanceQueue.enqueue('remote.example', { latestRequestReceivedAt: t2 });
		await service.updateInstanceQueue.performNow('remote.example');
		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);

		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		await service.updateInstanceQueue.performNow('remote.example');
		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);
	});

	test('collapsed fail then success null clears notResponding fields', async () => {
		const t0 = new Date('2026-01-01T00:00:00.000Z');
		const t1 = new Date('2026-01-01T01:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: t0,
			isNotResponding: true,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		// Post-deliver success {notRespondingSince:null} must win over queued fail Date.
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: null });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);
	});

	test('collapsed success null then fail clears notResponding fields', async () => {
		const t0 = new Date('2026-01-01T00:00:00.000Z');
		const t1 = new Date('2026-01-01T01:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: t0,
			isNotResponding: true,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		// Same window, reverse enqueue order: success null still wins.
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: null });
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, false);
		assert.equal(row.notRespondingSince, null);
	});

	test('collapsed two failures keep earliest notRespondingSince', async () => {
		const t1 = new Date('2026-01-01T00:00:00.000Z');
		const t2 = new Date('2026-01-02T00:00:00.000Z');
		let row: InstanceRow = {
			latestRequestReceivedAt: null,
			notRespondingSince: null,
			isNotResponding: false,
		};
		const service = createService((_host, capture) => {
			row = applyInstanceUpdate(row, capture);
		});

		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t2 });
		service.updateInstanceQueue.enqueue('remote.example', { notRespondingSince: t1 });
		await service.updateInstanceQueue.performNow('remote.example');

		assert.equal(row.isNotResponding, true);
		assert.equal(row.notRespondingSince?.toISOString(), t1.toISOString());
	});
});
