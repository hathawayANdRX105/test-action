/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserFingerprintsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';

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
				key: { type: 'string', optional: false, nullable: false },
				userCount: { type: 'integer', optional: false, nullable: false },
				components: { type: 'object', optional: false, nullable: true },
				users: {
					type: 'array',
					optional: false, nullable: false,
					items: { type: 'object', optional: false, nullable: false, ref: 'UserLite' },
				},
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// fingerprint = 同一浏览器指纹被多账号共用；ip = 同一 IP 被多账号共用
		by: { type: 'string', enum: ['fingerprint', 'ip'], default: 'fingerprint' },
		minAccounts: { type: 'integer', minimum: 2, maximum: 1000, default: 2 },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
		offset: { type: 'integer', minimum: 0, default: 0 },
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
			const SAMPLE_USERS_PER_CLUSTER = 12;

			// 1) 共用账号数 >= minAccounts のキー(指紋 or IP)を多い順に取得
			const table = ps.by === 'ip' ? 'user_ip' : 'user_fingerprint';
			const col = ps.by === 'ip' ? 'ip' : 'fingerprint';

			const clusters = await this.userFingerprintsRepository.query(
				`SELECT "${col}" AS key, COUNT(DISTINCT "userId")::int AS cnt
				 FROM "${table}"
				 WHERE "${col}" IS NOT NULL
				 GROUP BY "${col}"
				 HAVING COUNT(DISTINCT "userId") >= $1
				 ORDER BY cnt DESC, key
				 LIMIT $2 OFFSET $3`,
				[ps.minAccounts, ps.limit, ps.offset],
			) as { key: string; cnt: number }[];

			if (clusters.length === 0) return [];

			const keys = clusters.map(c => c.key);

			// 2) 各クラスタのサンプルユーザー(最大 N)を1クエリで取得
			const memberRows = await this.userFingerprintsRepository.query(
				`SELECT key, "userId" FROM (
					SELECT "${col}" AS key, "userId",
						ROW_NUMBER() OVER (PARTITION BY "${col}" ORDER BY "userId") AS rn
					FROM (SELECT DISTINCT "${col}", "userId" FROM "${table}" WHERE "${col}" = ANY($1)) t
				) s WHERE rn <= $2`,
				[keys, SAMPLE_USERS_PER_CLUSTER],
			) as { key: string; userId: string }[];

			// 3) 指紋クラスタは分量サンプルも取得
			const componentsByKey = new Map<string, Record<string, unknown> | null>();
			if (ps.by === 'fingerprint') {
				const compRows = await this.userFingerprintsRepository.query(
					`SELECT DISTINCT ON ("fingerprint") "fingerprint" AS key, "components"
					 FROM "user_fingerprint"
					 WHERE "fingerprint" = ANY($1) AND "components" IS NOT NULL
					 ORDER BY "fingerprint", "lastSeenAt" DESC`,
					[keys],
				) as { key: string; components: Record<string, unknown> | null }[];
				for (const r of compRows) componentsByKey.set(r.key, r.components);
			}

			// 4) ユーザーをまとめて pack
			const allUserIds = [...new Set(memberRows.map(r => r.userId))];
			const packedUsers = new Map<string, Awaited<ReturnType<UserEntityService['pack']>>>();
			await Promise.all(allUserIds.map(async id => {
				packedUsers.set(id, await this.userEntityService.pack(id, me));
			}));

			const membersByKey = new Map<string, string[]>();
			for (const r of memberRows) {
				const arr = membersByKey.get(r.key) ?? [];
				arr.push(r.userId);
				membersByKey.set(r.key, arr);
			}

			return clusters.map(c => ({
				key: c.key,
				userCount: c.cnt,
				components: componentsByKey.get(c.key) ?? null,
				users: (membersByKey.get(c.key) ?? []).map(id => packedUsers.get(id)).filter((u): u is NonNullable<typeof u> => u != null),
			}));
		});
	}
}
