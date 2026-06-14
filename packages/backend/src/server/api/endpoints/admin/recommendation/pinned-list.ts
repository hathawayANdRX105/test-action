/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { In } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { RecommendationService } from '@/core/RecommendationService.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:recommendation',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
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
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private noteEntityService: NoteEntityService,
		private recommendationService: RecommendationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const ids = await this.recommendationService.getPinnedNoteIds();
			if (ids.length === 0) return [];

			const notes = await this.notesRepository.find({
				where: { id: In(ids) },
				relations: { user: true, reply: { user: true }, renote: { user: true }, channel: true },
			});
			// ピン留め順(pinnedAt DESC)を維持する
			const byId = new Map(notes.map(note => [note.id, note]));
			const ordered = ids.map(id => byId.get(id)).filter((note): note is NonNullable<typeof note> => note != null);

			return await this.noteEntityService.packMany(ordered, me);
		});
	}
}
