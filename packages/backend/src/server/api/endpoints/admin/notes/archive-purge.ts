/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { NoteArchivesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireAdmin: true,
	kind: 'write:admin:note',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			purgedCount: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 指定 id 列表;不传或为空 + all=true 时清空全部。同时接 number/string,跟 restore 一致
		ids: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'integer' }] }, nullable: true, default: null },
		all: { type: 'boolean', default: false },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.noteArchivesRepository)
		private noteArchivesRepository: NoteArchivesRepository,

		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let purged = 0;

			if (ps.ids && ps.ids.length > 0) {
				const ids = ps.ids.map(x => typeof x === 'number' ? String(x) : x);
				const res = await this.noteArchivesRepository.delete({ id: In(ids) });
				purged = res.affected ?? 0;
			} else if (ps.all) {
				const total = await this.noteArchivesRepository.count();
				await this.noteArchivesRepository.clear();
				purged = total;
			} else {
				return { purgedCount: 0 };
			}

			await this.moderationLogService.log(me, 'purgeNoteArchive', {
				count: purged,
			});

			return { purgedCount: purged };
		});
	}
}
