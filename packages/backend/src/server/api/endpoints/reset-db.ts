/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { type DataSource, IsNull, Not } from 'typeorm';
import * as Redis from 'ioredis';
import type { MetasRepository, MiMeta } from '@/models/_.js';
import { LoggerService } from '@/core/LoggerService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { resetDb } from '@/misc/reset-db.js';
import { EnvService } from '@/global/EnvService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { CacheService } from '@/core/CacheService.js';
import { ApiError } from '../error.js';

export const meta = {
	tags: ['non-productive'],

	// Cypress posts without a token under NODE_ENV=test.
	// Runtime still requires NODE_ENV=test AND MK_ALLOW_RESET_DB=1 (set by start:test).
	requireCredential: false,
	requireAdmin: false,
	kind: 'write:admin:meta',

	description: 'Only available when running with <code>NODE_ENV=test</code> and <code>MK_ALLOW_RESET_DB=1</code>. Reset the database and flush Redis.',

	errors: {
		unavailable: {
			message: 'This endpoint is only available in the test environment.',
			code: 'UNAVAILABLE',
			id: 'e94f708d-8574-44fc-b36b-d025a5ec5712',
			kind: 'permission',
			httpStatusCode: 404,
		},
	},

	// 2 calls per second
	limit: {
		duration: 1000,
		max: 2,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.redis)
		private redisClient: Redis.Redis,

		@Inject(DI.metasRepository)
		private readonly metasRepository: MetasRepository,

		@Inject(DI.meta)
		private readonly instanceMeta: MiMeta,

		private loggerService: LoggerService,
		private readonly internalEventService: InternalEventService,
		private readonly cacheService: CacheService,

		envService: EnvService,
	) {
		super(meta, paramDef, async () => {
			// Double gate: accidental NODE_ENV=test alone must not expose destructive reset.
			if (envService.env.NODE_ENV !== 'test' || process.env.MK_ALLOW_RESET_DB !== '1') {
				throw new ApiError(meta.errors.unavailable);
			}

			const logger = this.loggerService.getLogger('reset-db');
			logger.info('---- Resetting database...');

			await this.redisClient.flushdb();
			// Drop in-process user/token caches so subsequent signups/signins don't hit stale IDs.
			await this.cacheService.clear();
			await resetDb(this.db);
			// Clear again after wipe in case any concurrent request refilled caches mid-reset.
			await this.cacheService.clear();

			// resetDb wipes meta; reseed defaults. Open registration so Cypress visitor signup shows.
			await this.metasRepository.upsert({ id: 'x', disableRegistration: false }, ['id']);
			const after = await this.metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });

			// Refresh in-process DI meta (MetaService.update is for partial field patches, not full reseed).
			const before = Object.assign({}, this.instanceMeta);
			Object.assign(this.instanceMeta, after);
			await this.internalEventService.emit('metaUpdated', { before, after });

			logger.info('---- Database reset complete.');

			// Ignore rule - this is just testing code.
			// eslint-disable-next-line no-restricted-globals
			const { promise, resolve } = Promise.withResolvers<void>();
			setTimeout(resolve, 1000);
			await promise;
		});
	}
}
