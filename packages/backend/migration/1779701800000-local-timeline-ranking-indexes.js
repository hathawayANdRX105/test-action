/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isConcurrentIndexMigrationEnabled } from './js/migration-config.js';

export class LocalTimelineRankingIndexes1779701800000 {
	name = 'LocalTimelineRankingIndexes1779701800000';
	transaction = isConcurrentIndexMigrationEnabled() ? false : undefined;

	async up(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled() ? 'CONCURRENTLY' : '';
		await queryRunner.query(`
			CREATE INDEX ${concurrently} IF NOT EXISTS "IDX_note_local_reply_rank"
			ON "note" ("repliesCount" DESC, "id" DESC)
			WHERE "visibility" = 'public' AND "channelId" IS NULL AND "userHost" IS NULL
		`);
		await queryRunner.query(`
			CREATE INDEX ${concurrently} IF NOT EXISTS "IDX_note_local_recommended_rank"
			ON "note" ("renoteCount" DESC, "repliesCount" DESC, "clippedCount" DESC, "id" DESC)
			WHERE "visibility" = 'public' AND "channelId" IS NULL AND "userHost" IS NULL
		`);
	}

	async down(queryRunner) {
		const concurrently = isConcurrentIndexMigrationEnabled() ? 'CONCURRENTLY' : '';
		await queryRunner.query(`DROP INDEX ${concurrently} IF EXISTS "IDX_note_local_recommended_rank"`);
		await queryRunner.query(`DROP INDEX ${concurrently} IF EXISTS "IDX_note_local_reply_rank"`);
	}
}
