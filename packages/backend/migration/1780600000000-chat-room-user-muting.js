/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomUserMuting1780600000000 {
	name = 'ChatRoomUserMuting1780600000000'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "chat_room_user_muting" ("id" character varying(32) NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "roomId" character varying(32) NOT NULL, "muterId" character varying(32) NOT NULL, "muteeId" character varying(32) NOT NULL, CONSTRAINT "PK_chat_room_user_muting_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_room_user_muting_createdAt" ON "chat_room_user_muting" ("createdAt") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_room_user_muting_roomId" ON "chat_room_user_muting" ("roomId") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_room_user_muting_muterId" ON "chat_room_user_muting" ("muterId") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_room_user_muting_muteeId" ON "chat_room_user_muting" ("muteeId") `);
		await queryRunner.query(`CREATE UNIQUE INDEX "IDX_chat_room_user_muting_unique" ON "chat_room_user_muting" ("roomId", "muterId", "muteeId") `);
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" ADD CONSTRAINT "FK_chat_room_user_muting_roomId" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" ADD CONSTRAINT "FK_chat_room_user_muting_muterId" FOREIGN KEY ("muterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" ADD CONSTRAINT "FK_chat_room_user_muting_muteeId" FOREIGN KEY ("muteeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" DROP CONSTRAINT "FK_chat_room_user_muting_muteeId"`);
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" DROP CONSTRAINT "FK_chat_room_user_muting_muterId"`);
		await queryRunner.query(`ALTER TABLE "chat_room_user_muting" DROP CONSTRAINT "FK_chat_room_user_muting_roomId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_user_muting_unique"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_user_muting_muteeId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_user_muting_muterId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_user_muting_roomId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_room_user_muting_createdAt"`);
		await queryRunner.query(`DROP TABLE "chat_room_user_muting"`);
	}
}
