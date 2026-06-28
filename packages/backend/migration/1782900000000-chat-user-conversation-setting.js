/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatUserConversationSetting1782900000000 {
	name = 'ChatUserConversationSetting1782900000000';

	async up(queryRunner) {
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "chat_user_conversation_setting" (
				"id" character varying(32) NOT NULL,
				"userId" character varying(32) NOT NULL,
				"otherUserId" character varying(32) NOT NULL,
				"hiddenUntilMessageId" character varying(32) NOT NULL,
				"updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
				CONSTRAINT "PK_chat_user_conversation_setting" PRIMARY KEY ("id"),
				CONSTRAINT "UQ_chat_user_conversation_setting_user_other" UNIQUE ("userId", "otherUserId"),
				CONSTRAINT "FK_chat_user_conversation_setting_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
				CONSTRAINT "FK_chat_user_conversation_setting_other_user" FOREIGN KEY ("otherUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION
			)
		`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_user_conversation_setting_user" ON "chat_user_conversation_setting" ("userId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_user_conversation_setting_other_user" ON "chat_user_conversation_setting" ("otherUserId")`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_user_conversation_setting_hidden_until" ON "chat_user_conversation_setting" ("hiddenUntilMessageId")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_user_conversation_setting_hidden_until"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_user_conversation_setting_other_user"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_user_conversation_setting_user"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "chat_user_conversation_setting"`);
	}
}
