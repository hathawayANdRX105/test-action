/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomMembershipRole1782600000000 {
	name = 'ChatRoomMembershipRole1782600000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room_membership" ADD COLUMN IF NOT EXISTS "role" character varying(16) NOT NULL DEFAULT 'member'`);
		await queryRunner.query(`
			DO $$
			BEGIN
				ALTER TABLE "chat_room_membership"
					ADD CONSTRAINT "CHK_chat_room_membership_role"
					CHECK ("role" IN ('member', 'manager'));
			EXCEPTION
				WHEN duplicate_object THEN NULL;
			END $$;
		`);
		await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_chat_room_membership_room_role" ON "chat_room_membership" ("roomId", "role")`);
	}

	async down(queryRunner) {
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chat_room_membership_room_role"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP CONSTRAINT IF EXISTS "CHK_chat_room_membership_role"`);
		await queryRunner.query(`ALTER TABLE "chat_room_membership" DROP COLUMN IF EXISTS "role"`);
	}
}
