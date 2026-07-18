/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomAnnouncementHistory1783100000000 {
	name = 'ChatRoomAnnouncementHistory1783100000000';

	async up(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" ADD "announcementHistory" jsonb NOT NULL DEFAULT '[]'`);
	}

	async down(queryRunner) {
		await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "announcementHistory"`);
	}
}
