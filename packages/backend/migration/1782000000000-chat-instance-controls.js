/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatInstanceControls1782000000000 {
	name = 'ChatInstanceControls1782000000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatEmergencyMode" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatMessageRetentionDays" integer NOT NULL DEFAULT 0`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "chatBannedKeywords" character varying(256) array NOT NULL DEFAULT '{}'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "chatBannedKeywords"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "chatMessageRetentionDays"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "chatEmergencyMode"`);
	}
}
