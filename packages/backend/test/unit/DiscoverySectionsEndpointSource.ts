/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { describe, expect, test } from '@jest/globals';

const source = readFileSync(new URL('../../src/server/api/endpoints/notes/discovery-sections.ts', import.meta.url), 'utf8');

describe('discovery sections endpoint source', () => {
	test('orders complex score expressions through selected aliases', () => {
		expect(source).not.toMatch(/\.orderBy\(`\(/);
		expect(source).toMatch(/addSelect\(coverScore, 'discovery_cover_score'\)[\s\S]*?orderBy\('discovery_cover_score', 'DESC'\)/);
		expect(source).toMatch(/addSelect\(hotScore, 'discovery_hot_score'\)[\s\S]*?orderBy\('discovery_hot_score', 'DESC'\)/);
		expect(source).toMatch(/addSelect\(tutorialScore, 'discovery_tutorial_score'\)[\s\S]*?orderBy\('discovery_tutorial_score', 'DESC'\)/);
		expect(source).toMatch(/addSelect\(channelScore, 'discovery_channel_score'\)[\s\S]*?orderBy\('discovery_channel_score', 'DESC'\)/);
		expect(source).toMatch(/addSelect\(userScore, 'discovery_user_score'\)[\s\S]*?orderBy\('discovery_user_score', 'DESC'\)/);
	});
});
