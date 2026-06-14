/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApiError } from '@/server/api/error.js';

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
				user: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
				fingerprint: { type: 'string', optional: false, nullable: false },
				ip: { type: 'string', optional: false, nullable: true },
				seenCount: { type: 'integer', optional: false, nullable: false },
				lastSeenAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
				components: { type: 'object', optional: false, nullable: true },
			},
		},
	},

	errors: {
		invalidParam: {
			message: 'Provide either fingerprint, or both componentKey and componentValue.',
			code: 'INVALID_PARAM',
			id: 'a3f1c2d4-5b6e-47a8-9c0d-1e2f3a4b5c6d',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 按完整指纹哈希反查（同一设备的所有账号）
		fingerprint: { type: 'string', minLength: 1, maxLength: 64 },
		// 按单个特征反查，例如 componentKey="webgl.renderer"，支持点号路径
		componentKey: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-zA-Z]+(\\.[a-zA-Z]+)?$' },
		componentValue: { type: 'string', maxLength: 1024 },
		limit: { type: 'integer', minimum: 1, maximum: 200, default: 100 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userFingerprintsRepository)
		private userFingerprintsRepository: UserFingerprintsRepository,

		private userEntityService: UserEntityService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const query = this.userFingerprintsRepository.createQueryBuilder('fp');

			if (ps.fingerprint != null) {
				query.where('fp.fingerprint = :fp', { fp: ps.fingerprint });
			} else if (ps.componentKey != null && ps.componentValue != null) {
				// pattern で英字とドットのみに制限済み。jsonb のパス検索に使う。
				const path = `{${ps.componentKey.split('.').join(',')}}`;
				query.where('fp.components #>> :path = :val', { path, val: ps.componentValue });
			} else {
				throw new ApiError(meta.errors.invalidParam);
			}

			const rows = await query
				.orderBy('fp.lastSeenAt', 'DESC')
				.limit(ps.limit)
				.getMany();

			const uniqueUserIds = [...new Set(rows.map(r => r.userId))];
			const packedUsers = new Map<string, Awaited<ReturnType<UserEntityService['pack']>>>();
			await Promise.all(uniqueUserIds.map(async id => {
				packedUsers.set(id, await this.userEntityService.pack(id, me));
			}));

			return rows.map(r => ({
				user: packedUsers.get(r.userId)!,
				fingerprint: r.fingerprint,
				ip: r.ip,
				seenCount: r.seenCount,
				lastSeenAt: r.lastSeenAt.toISOString(),
				components: (r.components ?? null) as Record<string, unknown> | null,
			}));
		});
	}
}
