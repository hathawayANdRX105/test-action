/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteEmergencyFederation1782500000000 {
	name = 'NoteEmergencyFederation1782500000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "notesHideRemoteEmergency" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "notesRemoteKeywordBlocklist" character varying(256) array NOT NULL DEFAULT '{}'`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "notesLocalKeywordBlocklist" character varying(256) array NOT NULL DEFAULT '{}'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "notesLocalKeywordBlocklist"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "notesRemoteKeywordBlocklist"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "notesHideRemoteEmergency"`);
	}
}
