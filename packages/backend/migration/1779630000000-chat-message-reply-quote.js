/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatMessageReplyQuote1779630000000 {
	name = 'ChatMessageReplyQuote1779630000000'

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "replyId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD "quoteId" character varying(32)`);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_replyId" ON "chat_message" ("replyId") `);
		await queryRunner.query(`CREATE INDEX "IDX_chat_message_quoteId" ON "chat_message" ("quoteId") `);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_replyId" FOREIGN KEY ("replyId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "chat_message" ADD CONSTRAINT "FK_chat_message_quoteId" FOREIGN KEY ("quoteId") REFERENCES "chat_message"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_quoteId"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP CONSTRAINT "FK_chat_message_replyId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_message_quoteId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_chat_message_replyId"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "quoteId"`);
		await queryRunner.query(`ALTER TABLE "chat_message" DROP COLUMN "replyId"`);
	}
}
