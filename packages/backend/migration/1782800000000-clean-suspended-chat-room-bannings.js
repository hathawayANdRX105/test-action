/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class CleanSuspendedChatRoomBannings1782800000000 {
	name = 'CleanSuspendedChatRoomBannings1782800000000';

	async up(queryRunner) {
		await queryRunner.query(`
			DELETE FROM "chat_room_banning" AS banning
			USING "user" AS u
			WHERE banning."userId" = u."id"
				AND (u."isSuspended" = TRUE OR u."isDeleted" = TRUE)
		`);
	}

	async down() {
		// Removed redundant blacklist rows cannot be reconstructed.
	}
}
