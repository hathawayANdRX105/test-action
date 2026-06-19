/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';

describe('users/notes endpoint source', () => {
	const source = readFileSync(new URL('../../src/server/api/endpoints/users/notes.ts', import.meta.url), 'utf8');

	test('uses the database path for channel-inclusive user profile pages', () => {
		const channelDbBranch = source.indexOf('if (ps.withChannelNotes) {\n\t\t\t\tconst timeline = await this.getFromDb({');
		const redisBranch = source.indexOf('const redisTimelines: FanoutTimelineName[]');

		assert.ok(channelDbBranch > 0, 'withChannelNotes should have an explicit DB branch');
		assert.ok(redisBranch > 0, 'redis timeline branch should still exist for ordinary profile notes');
		assert.ok(channelDbBranch < redisBranch, 'withChannelNotes DB branch must run before Redis fanout');
	});
});
