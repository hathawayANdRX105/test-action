/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import type { ChannelsRepository } from '@/models/_.js';
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
			properties: {
				category: { type: 'string', optional: false, nullable: false },
				channelsCount: { type: 'number', optional: false, nullable: false },
			},
		},
	},

	limit: {
		duration: 1000,
		max: 5,
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
		@Inject(DI.channelsRepository)
		private channelsRepository: ChannelsRepository,
	) {
		super(meta, paramDef, async () => {
			// 資源学習区はキュレーション済み(category 付き)のみ表示。未分類/広告は出さない。
			const raw = await this.channelsRepository.createQueryBuilder('channel')
				.select('channel.category', 'category')
				.addSelect('COUNT(*)', 'cnt')
				.where('channel.isArchived = FALSE')
				.andWhere('channel.isSensitive = FALSE')
				.andWhere('channel.category IS NOT NULL')
				.groupBy('channel.category')
				.orderBy('cnt', 'DESC')
				.getRawMany<{ category: string | null; cnt: string }>();

			return raw
				.filter(r => r.category != null && r.category.length > 0)
				.map(r => ({ category: r.category as string, channelsCount: Number(r.cnt) }));
		});
	}
}
