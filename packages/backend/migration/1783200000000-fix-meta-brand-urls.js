/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class FixMetaBrandUrls1783200000000 {
	name = 'FixMetaBrandUrls1783200000000';

	async up(queryRunner) {
		// Replace leftover Sharkey / Misskey brand URLs with Universe Federation defaults
		await queryRunner.query(`
			UPDATE "meta"
			SET "repositoryUrl" = 'https://github.com/universe-federation/universe-federation'
			WHERE "repositoryUrl" IS NULL
			   OR "repositoryUrl" ILIKE '%TransFem-org/Sharkey%'
			   OR "repositoryUrl" ILIKE '%misskey-dev/misskey%'
			   OR "repositoryUrl" ILIKE '%hhhl/hhhl%'
		`);
		await queryRunner.query(`
			UPDATE "meta"
			SET "feedbackUrl" = 'https://github.com/universe-federation/universe-federation/issues/new'
			WHERE "feedbackUrl" IS NULL
			   OR "feedbackUrl" ILIKE '%TransFem-org/Sharkey%'
			   OR "feedbackUrl" ILIKE '%misskey-dev/misskey%'
			   OR "feedbackUrl" ILIKE '%hhhl/hhhl%'
		`);
	}

	async down() {
		// no-op: brand URLs are configuration
	}
}
