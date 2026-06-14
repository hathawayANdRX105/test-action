/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository } from '@/models/_.js';
import { ChannelEntityService } from '@/core/entities/ChannelEntityService.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['channels'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Channel',
		},
	},

	// 资源学习区的「版块」视图会按分类批量取数据（前端已限制并发）。
	// 公开只读、查询低成本，限额给足余量以免正常浏览触发 429。
	limit: {
		duration: 1000,
		max: 30,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 指定すれば該当大类。未指定かつ uncategorized=false なら「全部」
		category: { type: 'string', maxLength: 128 },
		// true なら未分類(category IS NULL)
		uncategorized: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
		offset: { type: 'integer', minimum: 0, default: 0 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,

		private channelEntityService: ChannelEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.channelsRepository.createQueryBuilder('channel')
				.where('channel.isArchived = FALSE')
				.andWhere('channel.isSensitive = FALSE');

			if (ps.uncategorized) {
				query.andWhere('channel.category IS NULL');
			} else if (ps.category != null && ps.category.length > 0) {
				query.andWhere('channel.category = :category', { category: ps.category });
			} else {
				// 「全部」= キュレーション済み(category 付き)のみ。未分類/広告は出さない。
				query.andWhere('channel.category IS NOT NULL');
			}

			// featured と同じ活跃度重み付けで並べる(活跃優先)。安定タイブレークに id。
			query
				.orderBy(`(
					LEAST(channel."notesCount", 500) * 0.35
					+ LEAST(channel."usersCount", 200) * 1.6
					+ CASE WHEN channel."lastNotedAt" > now() - interval '48 hours' THEN 45 ELSE 0 END
					+ CASE WHEN channel."lastNotedAt" > now() - interval '7 days' THEN 20 ELSE -20 END
					+ cardinality(channel."pinnedNoteIds") * 6
				)`, 'DESC')
				.addOrderBy('channel.id', 'DESC');

			const channels = await query.limit(ps.limit).offset(ps.offset).getMany();

			return await Promise.all(channels.map(x => this.channelEntityService.pack(x, me)));
		});
	}
}
