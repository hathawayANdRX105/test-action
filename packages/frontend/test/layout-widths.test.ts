/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import timelineSource from '@/pages/timeline.vue?raw';
import navbarSource from '@/ui/_common_/navbar.vue?raw';
import universalSource from '@/ui/universal.vue?raw';

describe('wide layout sizing', () => {
	test('keeps the primary desktop columns balanced and adaptive', () => {
		assert.match(navbarSource, /--nav-width:\s*clamp\(248px,\s*17vw,\s*280px\);/);

		assert.match(universalSource, /--layout-side-rail-width:\s*clamp\(320px,\s*22vw,\s*360px\);/);
		assert.match(universalSource, /flex:\s*0 0 var\(--layout-side-rail-width\);[\s\S]*width:\s*var\(--layout-side-rail-width\);/);

		assert.match(timelineSource, /--timeline-main-width:\s*clamp\(640px,\s*47vw,\s*760px\);/);
		assert.match(timelineSource, /--timeline-rail-width:\s*clamp\(320px,\s*22vw,\s*360px\);/);
		assert.match(timelineSource, /grid-template-columns:\s*minmax\(0,\s*var\(--timeline-main-width\)\)\s*minmax\(300px,\s*var\(--timeline-rail-width\)\);/);
		assert.match(timelineSource, /margin-left:\s*var\(--timeline-outer-gap\);[\s\S]*margin-right:\s*auto;/);
		assert.match(timelineSource, /class="xTimelineWideShell"/);
		assert.match(timelineSource, /universal-nonTitlebarArea-[^}]+:has\(\.xTimelineWideShell\)[\s\S]*max-width:\s*1360px\s*!important;/);
		assert.match(timelineSource, /@media \(max-width:\s*1100px\)\s*\{[\s\S]*\.rightRail\s*\{[\s\S]*display:\s*none;/);
	});
});
