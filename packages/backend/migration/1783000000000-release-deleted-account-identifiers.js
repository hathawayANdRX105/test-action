/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isConcurrentIndexMigrationEnabled } from './js/migration-config.js';

export class ReleaseDeletedAccountIdentifiers1783000000000 {
	name = 'ReleaseDeletedAccountIdentifiers1783000000000';
	transaction = isConcurrentIndexMigrationEnabled() ? false : undefined;

	async up(queryRunner) {
		if (isConcurrentIndexMigrationEnabled()) {
			const hasValidIndex = await queryRunner.query(`
				SELECT pg_index.indisvalid
				FROM pg_index
				INNER JOIN pg_class ON pg_index.indexrelid = pg_class.oid
				WHERE pg_class.relname = 'IDX_user_username_host_active_unique'
			`);
			if (hasValidIndex.length === 0 || hasValidIndex[0].indisvalid !== true) {
				await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_user_username_host_active_unique"`);
				await queryRunner.query(`
					CREATE UNIQUE INDEX CONCURRENTLY "IDX_user_username_host_active_unique"
					ON "user" ("usernameLower", "host")
					NULLS NOT DISTINCT
					WHERE "isDeleted" = FALSE
				`);
			}
			await queryRunner.query(`DROP INDEX CONCURRENTLY IF EXISTS "IDX_5deb01ae162d1d70b80d064c27"`);
		} else {
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_5deb01ae162d1d70b80d064c27"`);
			await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_username_host_active_unique"`);
			await queryRunner.query(`
				CREATE UNIQUE INDEX "IDX_user_username_host_active_unique"
				ON "user" ("usernameLower", "host")
				NULLS NOT DISTINCT
				WHERE "isDeleted" = FALSE
			`);
		}

		await queryRunner.query(`
			UPDATE "user_profile" AS profile
			SET
				"email" = NULL,
				"emailVerified" = FALSE,
				"emailVerifyCode" = NULL
			FROM "user" AS account
			WHERE profile."userId" = account."id"
				AND account."isDeleted" = TRUE
				AND (
					profile."email" IS NOT NULL
					OR profile."emailVerified" = TRUE
					OR profile."emailVerifyCode" IS NOT NULL
				)
		`);

		await queryRunner.query(`
			DELETE FROM "used_username" AS used
			WHERE NOT EXISTS (
				SELECT 1
				FROM "user" AS account
				WHERE account."host" IS NULL
					AND account."isDeleted" = FALSE
					AND lower(account."usernameLower") = lower(used."username")
			)
		`);
	}

	async down() {
		// Released identifiers cannot be reconstructed safely.
	}
}
