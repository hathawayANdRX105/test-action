/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import type { DriveFilesRepository, UsersRepository } from '@/models/_.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { ApiError } from '@/server/api/error.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:drive',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			usageBytes: { type: 'integer', optional: false, nullable: false },
			fileCount: { type: 'integer', optional: false, nullable: false },
			policyCapacityMb: { type: 'integer', optional: false, nullable: false },
			maxFileSizeMb: { type: 'integer', optional: false, nullable: false },
			overrideMb: { type: 'integer', optional: false, nullable: true },
			effectiveCapacityMb: { type: 'integer', optional: false, nullable: false },
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: 'b1c9a1f4-0c3a-4d2b-9b6e-2c3a1f4b0c3a',
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
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private driveFileEntityService: DriveFileEntityService,
		private roleService: RoleService,
	) {
		super(meta, paramDef, async (ps) => {
			const user = await this.usersRepository.findOneBy({ id: ps.userId });
			if (user == null) throw new ApiError(meta.errors.noSuchUser);

			const [usageBytes, fileCount, policies] = await Promise.all([
				this.driveFileEntityService.calcDriveUsageOf(user),
				this.driveFilesRepository.countBy({ userId: user.id }),
				this.roleService.getUserPolicies(user.id),
			]);

			const overrideMb = user.driveCapacityOverrideMb ?? null;

			return {
				usageBytes,
				fileCount,
				policyCapacityMb: policies.driveCapacityMb,
				maxFileSizeMb: policies.maxFileSizeMb,
				overrideMb,
				effectiveCapacityMb: Math.max(policies.driveCapacityMb, overrideMb ?? 0),
			};
		});
	}
}
