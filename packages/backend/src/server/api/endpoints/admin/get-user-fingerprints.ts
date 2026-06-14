/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:user-ips',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			properties: {
				fingerprint: { type: 'string', optional: false, nullable: false },
				ip: { type: 'string', optional: false, nullable: true },
				seenCount: { type: 'integer', optional: false, nullable: false },
				createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
				lastSeenAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
				components: { type: 'object', optional: false, nullable: true },
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const rows = await this.userFingerprintsRepository.find({
				where: { userId: ps.userId },
				order: { lastSeenAt: 'DESC' },
				take: 50,
			});

			return rows.map(x => ({
				fingerprint: x.fingerprint,
				ip: x.ip,
				seenCount: x.seenCount,
				createdAt: x.createdAt.toISOString(),
				lastSeenAt: x.lastSeenAt.toISOString(),
				components: (x.components ?? null) as Record<string, unknown> | null,
			}));
		});
	}
}
