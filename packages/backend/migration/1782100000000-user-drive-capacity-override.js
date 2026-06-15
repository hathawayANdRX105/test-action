/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class UserDriveCapacityOverride1782100000000 {
	name = 'UserDriveCapacityOverride1782100000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "driveCapacityOverrideMb" integer DEFAULT NULL`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "driveCapacityOverrideMb"`);
	}
}
