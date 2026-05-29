/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { RecommendationService, recommendationEventTypes } from '@/core/RecommendationService.js';

export const meta = {
	tags: ['notes'],

	requireCredential: 'optional',
	kind: 'write:notes',

	limit: {
		duration: 1000,
		max: 20,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		event: { type: 'string', enum: recommendationEventTypes },
		dwellMs: { type: 'integer', minimum: 0, maximum: 600000 },
	},
	required: ['noteId', 'event'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private recommendationService: RecommendationService,
	) {
		super(meta, paramDef, async (ps, me) => {
			await this.recommendationService.recordFeedback(me?.id ?? null, {
				noteId: ps.noteId,
				event: ps.event,
				dwellMs: ps.dwellMs,
			});
		});
	}
}
