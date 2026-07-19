/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { initTestDb, sendEnvResetRequest } from './utils.js';

beforeAll(async () => {
	// Drop+recreate schema on a dedicated TypeORM connection (not the live server DS).
	// Nest DS must NOT dropSchema (see postgres.ts) or it races this wipe.
	const db = await initTestDb(false);
	await db.destroy();
	// Restart Nest so it reconnects to the fresh schema (synchronize only).
	await sendEnvResetRequest();
}, 1000 * 60 * 2);
