/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import type { MiNote } from '@/models/_.js';
import { hasText } from '@/models/Note.js';
import { NoteVisibilityService } from '@/core/NoteVisibilityService.js';
import { ApiError } from '@/server/api/error.js';
import { PUBLIC_TRANSLATION_TARGET_LANG_MAX_LENGTH } from '@/server/api/input-limits.js';
import { NoteTranslationService, type CachedTranslation } from './translate-common.js';

const TRANSLATE_BATCH_CONCURRENCY = 1;

export const meta = {
	tags: ['notes'],

	requireCredential: 'optional',
	kind: 'read:account',
	requiredRolePolicy: 'canUseTranslator',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			translations: {
				type: 'object',
				optional: false, nullable: false,
				additionalProperties: true,
			},
		},
	},

	errors: {
		unavailable: {
			message: 'Translate of notes unavailable.',
			code: 'UNAVAILABLE',
			id: '50a70314-2d8a-431b-b433-efa5cc56444c',
		},
	},

	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteIds: {
			type: 'array',
			items: { type: 'string', format: 'misskey:id' },
			minItems: 1,
			maxItems: 20,
		},
		targetLang: { type: 'string', maxLength: PUBLIC_TRANSLATION_TARGET_LANG_MAX_LENGTH },
	},
	required: ['noteIds', 'targetLang'],
} as const;

type BatchTranslation = CachedTranslation | false;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private getterService: GetterService,
		private readonly noteVisibilityService: NoteVisibilityService,
		private readonly translator: NoteTranslationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			if (!this.translator.isAvailable()) throw new ApiError(meta.errors.unavailable);

			const targetLang = this.translator.normalizeTargetLang(ps.targetLang);
			const translations: Record<string, BatchTranslation> = {};
			const notesToTranslate: (MiNote & { text: string })[] = [];

			for (const noteId of [...new Set(ps.noteIds)]) {
				const note = await this.getterService.getNote(noteId).catch(() => null);
				if (note == null) {
					translations[noteId] = false;
					continue;
				}

				const { accessible } = await this.noteVisibilityService.checkNoteVisibilityAsync(note, me);
				if (!accessible || !hasText(note)) {
					translations[noteId] = false;
					continue;
				}

				const cached = await this.translator.getCachedTranslation(note, targetLang);
				if (cached) {
					translations[noteId] = cached;
					continue;
				}

				notesToTranslate.push(note as MiNote & { text: string });
			}

			await this.runWithConcurrency(notesToTranslate, TRANSLATE_BATCH_CONCURRENCY, async note => {
				const translation = await this.translator.translate(note, targetLang);
				translations[note.id] = translation ?? false;
			});

			return { translations };
		});
	}

	private async runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
		let index = 0;
		const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
			for (;;) {
				const item = items[index++];
				if (item === undefined) return;
				await worker(item);
			}
		});

		await Promise.all(workers);
	}
}
