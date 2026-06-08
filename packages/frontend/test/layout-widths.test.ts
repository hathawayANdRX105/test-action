/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import defaultConfigSource from '../../../.config/default.yml?raw';
import timelineSource from '@/pages/timeline.vue?raw';
import navbarSource from '@/ui/_common_/navbar.vue?raw';
import universalSource from '@/ui/universal.vue?raw';

const universalLayoutOverride = defaultConfigSource.match(/<style id="codex-universal-layout-width">[\s\S]*?<\/style>/)?.[0] ?? '';

describe('wide layout sizing', () => {
	test('keeps the primary desktop columns balanced and adaptive', () => {
		assert.match(navbarSource, /--nav-width:\s*clamp\(220px,\s*14vw,\s*260px\);/);
		assert.match(navbarSource, /const forceIconOnly = ref\(window\.innerWidth <= 1099\);/);
		assert.match(navbarSource, /forceIconOnly\.value = window\.innerWidth <= 1099;/);

		assert.match(universalSource, /--layout-main-column-width:\s*600px;/);
		assert.match(universalSource, /--layout-side-rail-width:\s*350px;/);
		assert.match(universalSource, /--layout-column-gap:\s*30px;/);
		assert.match(universalSource, /--layout-page-max-width:\s*calc\(var\(--nav-width,\s*260px\)\s*\+\s*var\(--layout-main-column-width\)\s*\+\s*var\(--layout-side-rail-width\)\s*\+\s*var\(--layout-column-gap\)\);/);
		assert.match(universalSource, /width:\s*min\(100%,\s*var\(--layout-page-max-width\)\);[\s\S]*max-width:\s*var\(--layout-page-max-width\);[\s\S]*margin-inline:\s*auto;/);
		assert.match(universalSource, /isDesktop && !pageMetadata\?\.needWideArea \? \$style\.standardContents : null/);
		assert.match(universalSource, /\.standardContents\s*\{[\s\S]*flex:\s*0 1 var\(--layout-main-column-width\);[\s\S]*width:\s*var\(--layout-main-column-width\);/);
		assert.match(universalSource, /flex:\s*0 0 var\(--layout-side-rail-width\);[\s\S]*width:\s*var\(--layout-side-rail-width\);/);
		assert.match(universalSource, /margin-left:\s*var\(--layout-column-gap\);/);
		assert.notMatch(universalSource, /universal-nonTitlebarArea-[^}]+max-width:\s*1360px\s*!important;/);
		assert.notMatch(universalSource, /universal-nonTitlebarArea-[^}]+align-self:\s*center\s*!important;/);

		assert.match(timelineSource, /--timeline-main-width:\s*var\(--layout-main-column-width,\s*600px\);/);
		assert.match(timelineSource, /--timeline-rail-width:\s*var\(--layout-side-rail-width,\s*350px\);/);
		assert.match(timelineSource, /--timeline-column-gap:\s*var\(--layout-column-gap,\s*30px\);/);
		assert.match(timelineSource, /grid-template-columns:\s*minmax\(0,\s*var\(--timeline-main-width\)\)\s*minmax\(300px,\s*var\(--timeline-rail-width\)\);/);
		assert.match(timelineSource, /margin-left:\s*var\(--timeline-outer-gap\);[\s\S]*margin-right:\s*auto;/);
		assert.match(timelineSource, /class="xTimelineWideShell"/);
		assert.match(timelineSource, /@media \(max-width:\s*1250px\)\s*\{[\s\S]*width:\s*calc\(100% - var\(--timeline-outer-gap\)\);[\s\S]*grid-template-columns:\s*minmax\(0,\s*var\(--timeline-main-width\)\)\s*minmax\(280px,\s*var\(--timeline-rail-width\)\);/);
		assert.match(timelineSource, /@media \(max-width:\s*1100px\)\s*\{[\s\S]*width:\s*min\(100%,\s*600px\);[\s\S]*\.rightRail\s*\{[\s\S]*display:\s*none;/);
		assert.match(timelineSource, /const sidebarLimits = \{[\s\S]*trends:\s*4,[\s\S]*channels:\s*3,[\s\S]*users:\s*3,[\s\S]*tutorialNotes:\s*2,[\s\S]*\} as const;/);
		assert.match(timelineSource, /rows\.slice\(0,\s*sidebarLimits\.trends\)/);
		assert.match(timelineSource, /visibleChannels = computed\(\(\) => discoverySections\.value\.channels\.slice\(0,\s*sidebarLimits\.channels\)\)/);
		assert.match(timelineSource, /visibleRecommendedUsers = computed\(\(\) => recommendedUsers\.value\.slice\(0,\s*sidebarLimits\.users\)\)/);
		assert.match(timelineSource, /visibleTutorialNotes = computed\(\(\) => discoverySections\.value\.tutorialNotes\.slice\(0,\s*sidebarLimits\.tutorialNotes\)\)/);
		assert.match(timelineSource, /notes\/discovery-sections',\s*\{\s*limit:\s*4\s*\}/);
		assert.match(timelineSource, /limit:\s*sidebarLimits\.users,/);
		assert.match(timelineSource, /<main :class="\$style\.main" @wheel\.passive="onMainWheel">/);
		assert.match(timelineSource, /ref="rightRailEl"[\s\S]*@wheel="onRightRailWheel"/);
		assert.match(timelineSource, /let rightRailOffset = 0;/);
		assert.match(timelineSource, /let rightRailMaxOffset = 0;/);
		assert.match(timelineSource, /ResizeObserver\(syncRightRailStickyBounds\)/);
		assert.match(timelineSource, /Math\.max\(0,\s*rail\.offsetHeight - scroller\.clientHeight\)/);
		assert.match(timelineSource, /rightRailOffset = Math\.min\(rightRailMaxOffset,\s*Math\.max\(0,\s*rightRailOffset \+ deltaY\)\)/);
		assert.match(timelineSource, /--right-rail-sticky-top/);
		assert.match(timelineSource, /closest<HTMLElement>\('._pageScrollable, ._pageScrollableReversed'\)/);
		assert.match(timelineSource, /scroller\.scrollTop \+= rightRailShift === 0 \? deltaY : rightRailShift \* 0\.22;/);
		assert.match(timelineSource, /shiftRightRailOffset\(normalizeWheelDeltaY\(ev,\s*scroller\)\)/);
		assert.match(timelineSource, /\.rightRail\s*\{[\s\S]*position:\s*sticky;[\s\S]*top:\s*var\(--right-rail-sticky-top,\s*0px\);[\s\S]*height:\s*auto;[\s\S]*overflow:\s*visible;[\s\S]*overscroll-behavior:\s*auto;[\s\S]*scrollbar-gutter:\s*auto;/);
		assert.match(timelineSource, /footer\._gaps > button > :is\(i,\s*svg\)/);
		assert.match(timelineSource, /footer\._gaps > button:hover > :is\(i,\s*svg\)/);
		assert.notMatch(timelineSource, /overflow-y:\s*auto;/);
		assert.notMatch(timelineSource, /height:\s*100dvh;/);
		assert.notMatch(timelineSource, /overscroll-behavior:\s*contain;/);
		assert.notMatch(timelineSource, /scrollbar-gutter:\s*stable;/);

		assert.notEqual(universalLayoutOverride, '');
		assert.match(universalLayoutOverride, /--layout-main-column-width:\s*600px\s*!important;/);
		assert.match(universalLayoutOverride, /--layout-side-rail-width:\s*350px\s*!important;/);
		assert.match(universalLayoutOverride, /--layout-column-gap:\s*30px\s*!important;/);
		assert.match(universalLayoutOverride, /--codex-layout-page-max-width:\s*calc\(var\(--nav-width,\s*260px\)\s*\+\s*var\(--layout-main-column-width\)\s*\+\s*var\(--layout-side-rail-width\)\s*\+\s*var\(--layout-column-gap\)\);/);
		assert.match(universalLayoutOverride, /width:\s*min\(100%,\s*var\(--codex-layout-page-max-width\)\)\s*!important;/);
		assert.notMatch(universalLayoutOverride, /1200px/);
	});
});
