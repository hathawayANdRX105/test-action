/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Global, Inject, Module } from '@nestjs/common';
import * as Redis from 'ioredis';
import { DataSource, IsNull, Not } from 'typeorm';
import { MeiliSearch } from 'meilisearch';
import type { MiMeta } from '@/models/Meta.js';
import type { MetasRepository } from '@/models/_.js';
import type { Logger } from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import { TimeService, NativeTimeService } from '@/global/TimeService.js';
import { EnvService } from '@/global/EnvService.js';
import { CacheManagementService } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { DependencyService } from '@/global/DependencyService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { DI } from './di-symbols.js';
import { Config, loadConfig } from './config.js';
import { createPostgresDataSource } from './postgres.js';
import { RepositoryModule } from './models/RepositoryModule.js';
import { allSettled } from './misc/promise-tracker.js';
import type { Provider, OnApplicationShutdown, OnApplicationBootstrap } from '@nestjs/common';

const $config: Provider = {
	provide: DI.config,
	useFactory: (loggerService: LoggerService) => loadConfig(loggerService),
	inject: [LoggerService],
};

const $db: Provider = {
	provide: DI.db,
	useFactory: async (config: Config, loggerService: LoggerService, envService: EnvService) => {
		const db = createPostgresDataSource(config, loggerService, envService);
		return await db.initialize();
	},
	inject: [DI.config, LoggerService, EnvService],
};

const $meilisearch: Provider = {
	provide: DI.meilisearch,
	useFactory: (config: Config) => {
		if (config.fulltextSearch?.provider === 'meilisearch') {
			if (!config.meilisearch) {
				throw new Error('MeiliSearch is enabled but no configuration is provided');
			}

			return new MeiliSearch({
				host: `${config.meilisearch.ssl ? 'https' : 'http'}://${config.meilisearch.host}:${config.meilisearch.port}`,
				apiKey: config.meilisearch.apiKey,
			});
		} else {
			return null;
		}
	},
	inject: [DI.config],
};

const $redis: Provider = {
	provide: DI.redis,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redis);
	},
	inject: [DI.config],
};

const $redisForPub: Provider = {
	provide: DI.redisForPub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		return redis;
	},
	inject: [DI.config],
};

const $redisForSub: Provider = {
	provide: DI.redisForSub,
	useFactory: (config: Config) => {
		const redis = new Redis.Redis(config.redisForPubsub);
		redis.subscribe(config.host);
		return redis;
	},
	inject: [DI.config],
};

const $redisForTimelines: Provider = {
	provide: DI.redisForTimelines,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForTimelines);
	},
	inject: [DI.config],
};

const $redisForReactions: Provider = {
	provide: DI.redisForReactions,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForReactions);
	},
	inject: [DI.config],
};

const $redisForRateLimit: Provider = {
	provide: DI.redisForRateLimit,
	useFactory: (config: Config) => {
		return new Redis.Redis(config.redisForRateLimit);
	},
	inject: [DI.config],
};

const $meta: Provider = {
	provide: DI.meta,
	useFactory: async (metasRepository: MetasRepository, internalEventService: InternalEventService, loggerService: LoggerService) => {
		const logger = loggerService.getLogger('meta');

		const metaSingleton: MiMeta & OnApplicationShutdown & OnApplicationBootstrap = {
			...await fetchMeta(),
			onApplicationBootstrap() {
				internalEventService.on('metaUpdated', onMetaUpdated);
			},
			onApplicationShutdown() {
				internalEventService.off('metaUpdated', onMetaUpdated);
			},
		};

		async function fetchMeta(): Promise<MiMeta> {
			let meta = await metasRepository.findOne({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });

			if (!meta) {
				logger.info('Meta table is empty; populating with defaults');

				// No-op UPSERT to safely create the row
				await metasRepository.upsert({ id: 'x' }, ['id']);
				meta = await metasRepository.findOneOrFail({ where: { id: Not(IsNull()) }, order: { id: 'DESC' } });
			}

			return meta;
		}

		async function onMetaUpdated(): Promise<void> {
			const updated = await fetchMeta();
			Object.assign(metaSingleton, updated);
			logger.debug('Updated meta from remote change: ', { updated });
		}

		return metaSingleton;
	},
	inject: [DI.metasRepository, InternalEventService, LoggerService],
};

const $GlobalLogger: Provider = {
	provide: DI.globalLogger,
	useFactory: (loggerService: LoggerService) => loggerService.getLogger('global'),
	inject: [LoggerService],
};

const $CacheManagementService: Provider[] = [CacheManagementService, { provide: 'CacheManagementService', useExisting: CacheManagementService }];
const $InternalEventService: Provider[] = [InternalEventService, { provide: 'InternalEventService', useExisting: InternalEventService }];
const $TimeService: Provider[] = [
	{ provide: TimeService, useClass: NativeTimeService },
	{ provide: 'TimeService', useExisting: TimeService },
];
const $EnvService: Provider[] = [EnvService, { provide: 'EnvService', useExisting: EnvService }];
const $LoggerService: Provider[] = [LoggerService, { provide: 'LoggerService', useExisting: LoggerService }];
const $Console: Provider[] = [{ provide: DI.console, useFactory: () => global.console }]; // useValue will break overrideProvider for some reason
const $DependencyService: Provider[] = [DependencyService, { provide: 'DependencyService', useExisting: DependencyService }];

@Global()
@Module({
	imports: [RepositoryModule],
	providers: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, $redisForRateLimit, $CacheManagementService, $InternalEventService, $TimeService, $EnvService, $LoggerService, $Console, $DependencyService, $GlobalLogger].flat(),
	exports: [$config, $db, $meta, $meilisearch, $redis, $redisForPub, $redisForSub, $redisForTimelines, $redisForReactions, $redisForRateLimit, $CacheManagementService, $InternalEventService, $TimeService, $EnvService, $LoggerService, $Console, $DependencyService, RepositoryModule].flat(),
})
export class GlobalModule implements OnApplicationShutdown {
	constructor(
		@Inject(DI.db) private db: DataSource,
		@Inject(DI.redis) private redisClient: Redis.Redis,
		@Inject(DI.redisForPub) private redisForPub: Redis.Redis,
		@Inject(DI.redisForSub) private redisForSub: Redis.Redis,
		@Inject(DI.redisForTimelines) private redisForTimelines: Redis.Redis,
		@Inject(DI.redisForReactions) private redisForReactions: Redis.Redis,
		@Inject(DI.redisForRateLimit) private redisForRateLimit: Redis.Redis,
		@Inject(DI.globalLogger) private logger: Logger,
	) { }

	public async dispose(): Promise<void> {
		// Wait for all potential DB queries
		this.logger.info('Finalizing active promises...');
		await allSettled();
		// And then disconnect from DB
		this.logger.info('Disconnected from data sources...');
		await this.db.destroy();
		this.safeDisconnect(this.redisClient);
		this.safeDisconnect(this.redisForPub);
		this.safeDisconnect(this.redisForSub);
		this.safeDisconnect(this.redisForTimelines);
		this.safeDisconnect(this.redisForReactions);
		this.safeDisconnect(this.redisForRateLimit);
		this.logger.info('Global module disposed.');
	}

	@bindThis
	public async onApplicationShutdown(signal: string): Promise<void> {
		await this.dispose();
	}

	private safeDisconnect(redis: { disconnect(): void }): void {
		try {
			redis.disconnect();
		} catch (err) {
			this.logger.error(`Unhandled error disconnecting redis: ${renderInlineError(err)}`);
		}
	}
}
