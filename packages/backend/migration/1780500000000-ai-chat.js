/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class AiChat1780500000000 {
	name = 'AiChat1780500000000'

	async up(queryRunner) {
		await queryRunner.query(`CREATE TABLE "ai_provider" ("id" character varying(32) NOT NULL, "name" character varying(128) NOT NULL, "baseUrl" character varying(1024) NOT NULL, "apiKey" character varying(4096) NOT NULL, "isEnabled" boolean NOT NULL DEFAULT true, "models" character varying(512) array NOT NULL DEFAULT '{}', "defaultModel" character varying(512), "allowedModels" character varying(512) array NOT NULL DEFAULT '{}', "timeoutMs" integer NOT NULL DEFAULT 30000, "maxTokens" integer NOT NULL DEFAULT 1024, "temperature" real NOT NULL DEFAULT 0.7, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ai_provider_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE TABLE "ai_conversation" ("id" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "title" character varying(256) NOT NULL, "providerId" character varying(32), "model" character varying(512) NOT NULL, "systemPrompt" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ai_conversation_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE TABLE "ai_message" ("id" character varying(32) NOT NULL, "conversationId" character varying(32) NOT NULL, "userId" character varying(32) NOT NULL, "role" character varying(32) NOT NULL, "content" text, "attachments" jsonb NOT NULL DEFAULT '[]', "usage" jsonb, "error" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, CONSTRAINT "PK_ai_message_id" PRIMARY KEY ("id"))`);
		await queryRunner.query(`CREATE INDEX "IDX_ai_conversation_userId" ON "ai_conversation" ("userId")`);
		await queryRunner.query(`CREATE INDEX "IDX_ai_conversation_providerId" ON "ai_conversation" ("providerId")`);
		await queryRunner.query(`CREATE INDEX "IDX_ai_message_conversationId" ON "ai_message" ("conversationId")`);
		await queryRunner.query(`CREATE INDEX "IDX_ai_message_userId" ON "ai_message" ("userId")`);
		await queryRunner.query(`ALTER TABLE "ai_conversation" ADD CONSTRAINT "FK_ai_conversation_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "ai_conversation" ADD CONSTRAINT "FK_ai_conversation_providerId" FOREIGN KEY ("providerId") REFERENCES "ai_provider"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "ai_message" ADD CONSTRAINT "FK_ai_message_conversationId" FOREIGN KEY ("conversationId") REFERENCES "ai_conversation"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "ai_message" ADD CONSTRAINT "FK_ai_message_userId" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "enableAi" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "showAiInNavbar" boolean NOT NULL DEFAULT false`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aiDefaultProviderId" character varying(32)`);
		await queryRunner.query(`ALTER TABLE "meta" ADD "aiMaxContextMessages" integer NOT NULL DEFAULT 20`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aiMaxContextMessages"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "aiDefaultProviderId"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "showAiInNavbar"`);
		await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "enableAi"`);
		await queryRunner.query(`ALTER TABLE "ai_message" DROP CONSTRAINT "FK_ai_message_userId"`);
		await queryRunner.query(`ALTER TABLE "ai_message" DROP CONSTRAINT "FK_ai_message_conversationId"`);
		await queryRunner.query(`ALTER TABLE "ai_conversation" DROP CONSTRAINT "FK_ai_conversation_providerId"`);
		await queryRunner.query(`ALTER TABLE "ai_conversation" DROP CONSTRAINT "FK_ai_conversation_userId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ai_message_userId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ai_message_conversationId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ai_conversation_providerId"`);
		await queryRunner.query(`DROP INDEX "public"."IDX_ai_conversation_userId"`);
		await queryRunner.query(`DROP TABLE "ai_message"`);
		await queryRunner.query(`DROP TABLE "ai_conversation"`);
		await queryRunner.query(`DROP TABLE "ai_provider"`);
	}
}
