/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UserFingerprintsRepository } from '@/models/_.js';

export const meta = {
	tags: ['account'],

	requireCredential: true,

	kind: 'write:account',

	// クライアントがブラウザ指紋とその分量明細を登録/更新する。1分あたり数回で十分。
	limit: {
		duration: 1000 * 60,
		max: 30,
	},

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			ok: { type: 'boolean', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		fingerprint: { type: 'string', minLength: 1, maxLength: 64 },
		components: { type: 'object', nullable: true },
	},
	required: ['fingerprint'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,
	) {
		super(meta, paramDef, async (ps, me, _token, _file, _cleanup, ip) => {
			const now = new Date();
			const components = (ps.components ?? null) as Record<string, unknown> | null;

			const existing = await this.userFingerprintsRepository.findOneBy({
				userId: me.id,
				fingerprint: ps.fingerprint,
			});

			if (existing != null) {
				await this.userFingerprintsRepository.update(existing.id, {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					components: components as any,
					ip: ip ?? existing.ip,
					lastSeenAt: now,
					seenCount: existing.seenCount + 1,
				});
			} else {
				await this.userFingerprintsRepository.insert({
					createdAt: now,
					lastSeenAt: now,
					userId: me.id,
					fingerprint: ps.fingerprint,
					ip: ip ?? null,
					seenCount: 1,
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					components: components as any,
				});
			}

			return { ok: true };
		});
	}
}
