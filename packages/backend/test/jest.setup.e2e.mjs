/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { initTestDb, port, sendEnvResetRequest } from './utils.js';

async function stopTestServer() {
	const res = await fetch(`http://localhost:${port + 1000}/env-stop`, {
		method: 'POST',
		body: JSON.stringify({}),
	});
	if (res.status !== 200) {
		throw new Error(`env-stop failed status=${res.status}`);
	}
}

beforeAll(async () => {
	// 1) Stop live Nest so dropSchema cannot race in-flight requests
	await stopTestServer();
	// 2) Drop+recreate schema on a dedicated connection
	const db = await initTestDb(false);
	await db.destroy();
	// 3) Relaunch Nest with MK_TEST_KEEP_SCHEMA (no Nest dropSchema)
	await sendEnvResetRequest();
}, 1000 * 60 * 2);
