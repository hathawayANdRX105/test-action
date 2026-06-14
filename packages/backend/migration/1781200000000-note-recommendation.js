/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class NoteRecommendation1781200000000 {
	name = 'NoteRecommendation1781200000000'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "note_recommendation" ("noteId" character varying(32) NOT NULL, "pinned" boolean NOT NULL DEFAULT false, "pinnedAt" TIMESTAMP WITH TIME ZONE, "scoreBoost" real NOT NULL DEFAULT 0, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedBy" character varying(32), CONSTRAINT "PK_note_recommendation_noteId" PRIMARY KEY ("noteId"))`);
		await queryRunner.query(`CREATE INDEX "IDX_note_recommendation_pinned" ON "note_recommendation" ("pinned")`);
		await queryRunner.query(`ALTER TABLE "note_recommendation" ADD CONSTRAINT "FK_note_recommendation_noteId" FOREIGN KEY ("noteId") REFERENCES "note"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "note_recommendation" DROP CONSTRAINT "FK_note_recommendation_noteId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_note_recommendation_pinned"`);
		await queryRunner.query(`DROP TABLE "note_recommendation"`);
	}
}
