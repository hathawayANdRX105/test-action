/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { RecommendationService } from '@/core/RecommendationService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:recommendation',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			noteId: { type: 'string', optional: false, nullable: false },
			pinned: { type: 'boolean', optional: false, nullable: false },
			scoreBoost: { type: 'number', optional: false, nullable: false },
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'c7e9b2a1-6f3d-4a8c-9b1e-2d4f6a8c0e21',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		// ホーム推薦の最上部に固定するか
		pinned: { type: 'boolean' },
		// 手動スコア調整(推薦スコアに加算。正で上げ、負で下げる)
		scoreBoost: { type: 'integer', minimum: -300, maximum: 300 },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private recommendationService: RecommendationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOneBy({ id: ps.noteId });
			if (note == null) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			await this.recommendationService.setNoteOverride(ps.noteId, {
				pinned: ps.pinned,
				scoreBoost: ps.scoreBoost,
			}, me.id);

			const override = await this.recommendationService.getNoteOverride(ps.noteId);
			return {
				noteId: ps.noteId,
				pinned: override?.pinned ?? false,
				scoreBoost: override?.scoreBoost ?? 0,
			};
		});
	}
}
