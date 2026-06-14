/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteIpFingerprint1781700000000 {
	name = 'NoteIpFingerprint1781700000000';

	async up(queryRunner) {
		// 帖子作者 IP / 指纹（管理者可见、仅本地新帖记录）
		await queryRunner.query(`ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "ip" character varying(128)`);
		await queryRunner.query(`ALTER TABLE "note" ADD COLUMN IF NOT EXISTS "fingerprint" character varying(64)`);

		// 每用户指纹历史（含分量明细，可搜索溯源）
		await queryRunner.query(`CREATE TABLE IF NOT EXISTS "user_fingerprint" (
			"id" SERIAL NOT NULL,
			"createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL,
			"userId" character varying(32) NOT NULL,
			"fingerprint" character varying(64) NOT NULL,
			"ip" character varying(128),
			"seenCount" integer NOT NULL DEFAULT 1,
			"components" jsonb,
			CONSTRAINT "PK_user_fingerprint" PRIMARY KEY ("id")
		)`);
		await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_user_fingerprint_userId_fingerprint" ON "user_fingerprint" ("userId", "fingerprint")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_fingerprint_userId" ON "user_fingerprint" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_fingerprint_fingerprint" ON "user_fingerprint" ("fingerprint")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_fingerprint_lastSeenAt" ON "user_fingerprint" ("lastSeenAt")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP TABLE "user_fingerprint"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "fingerprint"`);
		await queryRunner.query(`ALTER TABLE "note" DROP COLUMN "ip"`);
	}
}
