/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { sendEnvResetRequest, stopAllJobQueues } from './utils.js';

// Jest process only: secondary Nest (if any) must not drop/sync shared DB.
process.env.MK_TEST_KEEP_SCHEMA = '1';

beforeAll(async () => {
	await stopAllJobQueues();
	// Nest test DataSource dropSchema+synchronize on restart — no parallel TypeORM drop.
	await sendEnvResetRequest();
}, 1000 * 60 * 3);
