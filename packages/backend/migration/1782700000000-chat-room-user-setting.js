/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomUserSetting1782700000000 {
	name = 'ChatRoomUserSetting1782700000000';

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "chat_room_user_setting" (
				"id" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"roomId" character varying(32) NOT NULL,
				"nickname" character varying(128),
				"folder" character varying(80),
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_chat_room_user_setting" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_chat_room_user_setting_user_room" UNIQUE ("userId", "roomId"),
				CONSTRAINT "FK_chat_room_user_setting_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
				CONSTRAINT "FK_chat_room_user_setting_room" FOREIGN KEY ("roomId") REFERENCES "chat_room"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_user_setting_user" ON "chat_room_user_setting" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_user_setting_room" ON "chat_room_user_setting" ("roomId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_user_setting_user_folder" ON "chat_room_user_setting" ("userId", "folder")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_user_setting_user_folder"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_user_setting_room"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_user_setting_user"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "chat_room_user_setting"`);
	}
}
