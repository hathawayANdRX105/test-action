/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class DropApiAccessGrantRedundantUserIdIndex1784415966734 {
	name = 'DropApiAccessGrantRedundantUserIdIndex1784415966734';

	async up(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_api_access_grant_userId"`);
	}

	async down(queryRunner) {
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_api_access_grant_userId" ON "api_access_grant" ("userId") `);
	}
}
