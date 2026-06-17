/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteManagement1782300000000 {
	name = 'NoteManagement1782300000000';

	async up(queryRunner) {
		// 紧急开关
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "notesHideEmergencyMode" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD COLUMN IF NOT EXISTS "notesPostingFrozen" boolean NOT NULL DEFAULT false`);

		// 删除归档表
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "note_archive" (
			"id" SERIAL NOT NULL,
			"noteId" character varying(32) NOT NULL,
			"userId" character varying(32) NOT NULL,
			"username" character varying(128),
			"userHost" character varying(128),
			"text" text,
			"cw" text,
			"visibility" character varying(64) NOT NULL,
			"fileIds" character varying(32) array NOT NULL DEFAULT '{}',
			"files" jsonb,
			"replyId" character varying(32),
			"renoteId" character varying(32),
			"channelId" character varying(32),
			"tags" character varying(128) array NOT NULL DEFAULT '{}',
			"ip" character varying(128),
			"fingerprint" character varying(64),
			"noteCreatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"deletedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"deletedById" character varying(32) NOT NULL,
			"deletedByUsername" character varying(128),
			"reason" character varying(1024),
			"raw" jsonb,
			CONSTRAINT "PK_note_archive_id" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_archive_noteId" ON "note_archive" ("noteId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_archive_userId" ON "note_archive" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_archive_deletedAt" ON "note_archive" ("deletedAt")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_note_archive_deletedById" ON "note_archive" ("deletedById")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE IF EXISTS "note_archive"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "notesPostingFrozen"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "notesHideEmergencyMode"`);
	}
}
