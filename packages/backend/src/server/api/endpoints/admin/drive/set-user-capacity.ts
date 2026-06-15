/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { UsersRepository } from '@/models/_.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:drive',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			overrideMb: { type: 'integer', optional: false, nullable: true },
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'c2d0b2e5-1d4b-4e3c-8c7f-3d4b2e5c1d4b',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		// null（或省略）= 清除专属上限，恢复按角色/默认；>=0 = 该用户专属容量(MB)。
		overrideMb: { type: 'integer', minimum: 0, maximum: 10485760, nullable: true },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) throw new ApiError(meta.errors.noSuchUser);

			const overrideMb = ps.overrideMb ?? null;
			await this.usersRepository.update(user.id, { driveCapacityOverrideMb: overrideMb });

			return { overrideMb };
		});
	}
}
