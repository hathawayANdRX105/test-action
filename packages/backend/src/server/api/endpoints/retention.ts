/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { RetentionAggregationsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['users'],

	// 用户留存/注册队列数据属于站点运营分析,改为仅管理员/版主可见,
	// 防止匿名或普通用户(含恶意用户)拉取全站留存统计。
	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:show-user',

	res: {
		type: 'array',
		items: {
			type: 'object',
			properties: {
				createdAt: {
					type: 'string',
					format: 'date-time',
				},
				users: {
					type: 'number',
				},
				data: {
					type: 'object',
					additionalProperties: {
						anyOf: [{
							type: 'number',
						}],
					},
				},
			},
			required: [
				'createdAt',
				'users',
				'data',
			],
		},
	},

	// Admin overview can mount multiple retention charts at once; keep this read-only,
	// tolerant of refreshes without tripping normal page use.
	limit: {
		type: 'bucket',
		size: 60,
		dripSize: 10,
		dripRate: 1000,
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
		@Inject(DI.retentionAggregationsRepository)
		private retentionAggregationsRepository: RetentionAggregationsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const records = await this.retentionAggregationsRepository.find({
				order: {
					id: 'DESC',
				},
				take: 30,
			});

			return records.map(record => ({
				createdAt: record.createdAt.toISOString(),
				users: record.usersCount,
				data: record.data,
			}));
		});
	}
}
