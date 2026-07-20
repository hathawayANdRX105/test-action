/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { MetaEntityService } from '@/core/entities/MetaEntityService.js';
import { CacheManagementService, type ManagedMemorySingleCache } from '@/global/CacheManagementService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { bindThis } from '@/decorators.js';
import type { Packed } from '@/misc/json-schema.js';

export const meta = {
	tags: ['meta'],

	requireCredential: false,

	// HTTP 缓存 30s,让 CDN / 浏览器复用;detail=true/false 都安全,因为响应自身就跟着参数变
	cacheSec: 30,

	res: {
		type: 'object',
		oneOf: [
			{ type: 'object', ref: 'MetaLite' },
			{ type: 'object', ref: 'MetaDetailed' },
		],
	},

	// 3 calls per second
	limit: {
		duration: 1000,
		max: 3,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		detail: { type: 'boolean', default: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	// 进程内 30s 内存缓存:同 worker 30s 窗口内的所有 meta 请求只算一次;管理员改 meta 后
	// 通过 metaUpdated 主动失效,避免 requireSetup 等字段长时间陈旧。
	private readonly liteCache: ManagedMemorySingleCache<Packed<'MetaLite'>>;
	private readonly detailedCache: ManagedMemorySingleCache<Packed<'MetaDetailed'>>;

	constructor(
		private metaEntityService: MetaEntityService,
		cacheManagementService: CacheManagementService,
		private readonly internalEventService: InternalEventService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.detail) {
				return await this.detailedCache.fetch(() => this.metaEntityService.packDetailed());
			}
			return await this.liteCache.fetch(() => this.metaEntityService.pack());
		});

		this.liteCache = cacheManagementService.createMemorySingleCache<Packed<'MetaLite'>>('apiMetaLite', 1000 * 30);
		this.detailedCache = cacheManagementService.createMemorySingleCache<Packed<'MetaDetailed'>>('apiMetaDetailed', 1000 * 30);
		this.internalEventService.on('metaUpdated', this.onMetaUpdated);
	}

	@bindThis
	private onMetaUpdated(): void {
		this.liteCache.clear();
		this.detailedCache.clear();
	}
}
