/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class ChatRoomMemberLimit1779569700000 {
    name = 'ChatRoomMemberLimit1779569700000'

    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "meta" ADD "chatRoomDefaultMemberLimit" integer NOT NULL DEFAULT 500`);
        await queryRunner.query(`ALTER TABLE "chat_room" ADD "memberLimitOverride" integer`);
    }

    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "chat_room" DROP COLUMN "memberLimitOverride"`);
        await queryRunner.query(`ALTER TABLE "meta" DROP COLUMN "chatRoomDefaultMemberLimit"`);
    }
}
