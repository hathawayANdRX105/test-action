/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { fileTypeCategories, SearchService } from '@/core/SearchService.js';
import { SearchTrendService } from '@/core/SearchTrendService.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: false,

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
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
	properties: {
		query: { type: 'string' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		offset: { type: 'integer', default: 0 },
		host: {
			type: 'string',
			description: 'The local host is represented with `.`.',
		},
		filetype: {
			type: 'string',
			nullable: true,
			enum: fileTypeCategories,
		},
		userId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		channelId: { type: 'string', format: 'misskey:id', nullable: true, default: null },
		order: { type: 'string' },
	},
	required: ['query'],
} as const;

// TODO: ロジックをサービスに切り出す

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private noteEntityService: NoteEntityService,
		private searchService: SearchService,
		private searchTrendService: SearchTrendService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = ps.query.trim();
			if (query === '') return [];

			const notes = await this.searchService.searchNote(query, me, {
				userId: ps.userId,
				channelId: ps.channelId,
				host: ps.host,
				filetype: ps.filetype,
				order: ps.order,
			}, {
				untilId: ps.untilId,
				sinceId: ps.sinceId,
				limit: ps.limit,
			});

			if (ps.userId == null && ps.channelId == null) {
				this.searchTrendService.recordSearchQuery(query).catch(() => {});
			}

			return await this.noteEntityService.packMany(notes, me);
		});
	}
}
