/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChannelCategory1781500000000 {
	name = 'ChannelCategory1781500000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "channel" ADD COLUMN IF NOT EXISTS "category" varchar(128)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_channel_category" ON "channel" ("category")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX "IDX_channel_category"`);
		await queryRunner.query(`ALTER TABLE "channel" DROP COLUMN "category"`);
	}
}
