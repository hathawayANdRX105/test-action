/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomMessageRetention1780080400000 {
    name = 'ChatRoomMessageRetention1780080400000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "messageRetentionDays" integer`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "messageRetentionDays"`);
    }
}
