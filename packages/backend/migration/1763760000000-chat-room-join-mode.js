/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomJoinMode1763760000000 {
    name = 'ChatRoomJoinMode1763760000000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "joinMode" character varying(32) NOT NULL DEFAULT 'inviteOnly'`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "joinMode"`);
    }
}
