/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import defaultConfigSource from '../../../.config/default.yml?raw';
import chatIndexSource from '@/pages/chat/index.vue?raw';
import chatRoomSource from '@/pages/chat/room.vue?raw';
import chatRoomSearchSource from '@/pages/chat/room.search.vue?raw';
import exploreSource from '@/pages/explore.vue?raw';
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
		assert.match(universalSource, /\.nonTitlebarArea\s*\{[\s\S]*width:\s*82vw;[\s\S]*max-width:\s*82vw;[\s\S]*margin-inline:\s*auto;/);
		assert.match(universalSource, /pageMetadata\?\.needWideArea && \(pageMetadata\?\.bustLayoutCap \|\| !pageMetadata\?\.keepWidgets\) \? \$style\.bustCap : null/);
		assert.match(universalSource, /\.bustCap\s*\{[\s\S]*width:\s*82vw;[\s\S]*max-width:\s*82vw;[\s\S]*margin-inline:\s*auto;/);
		assert.match(universalSource, /\.wideWithWidgets\s*\{[\s\S]*width:\s*82vw;[\s\S]*max-width:\s*82vw;[\s\S]*margin-inline:\s*auto;/);
		assert.match(universalSource, /isDesktop && !pageMetadata\?\.needWideArea \? \$style\.standardContents : null/);
		assert.match(universalSource, /\.standardContents\s*\{[\s\S]*flex:\s*0 1 var\(--layout-main-column-width\);[\s\S]*width:\s*var\(--layout-main-column-width\);[\s\S]*max-width:\s*min\(100%,\s*var\(--layout-main-column-width\)\);/);
		assert.match(universalSource, /flex:\s*0 0 var\(--layout-side-rail-width\);[\s\S]*width:\s*var\(--layout-side-rail-width\);/);
		assert.match(universalSource, /margin-left:\s*var\(--layout-column-gap\);/);
		assert.match(universalSource, /@media \(max-width:\s*1600px\)\s*\{[\s\S]*display:\s*none;/);
		assert.notMatch(universalSource, /universal-nonTitlebarArea-[^}]+max-width:\s*1360px\s*!important;/);
		assert.notMatch(universalSource, /universal-nonTitlebarArea-[^}]+align-self:\s*center\s*!important;/);

		assert.match(exploreSource, /needWideArea:\s*true,/);
		assert.notMatch(exploreSource, /bustLayoutCap:\s*true/);
		assert.match(exploreSource, /--explore-rail-width:\s*clamp\(240px,\s*18%,\s*340px\);/);
		assert.match(exploreSource, /--explore-column-gap:\s*clamp\(14px,\s*1vw,\s*24px\);/);
		assert.match(exploreSource, /width:\s*100%;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--explore-rail-width\);/);
		assert.match(exploreSource, /const discoverySectionLimit = 10;/);
		assert.match(exploreSource, /const categoryNoteLimit = 14;/);
		assert.match(exploreSource, /notes\/discovery-sections',\s*\{\s*limit:\s*discoverySectionLimit\s*\}/);
		assert.match(exploreSource, /limit:\s*categoryNoteLimit,[\s\S]*withRenotes:\s*false,/);
		assert.match(exploreSource, /\.channelGrid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(220px,\s*100%\),\s*1fr\)\);/);
		assert.match(exploreSource, /\.channelCard\s*\{[\s\S]*min-height:\s*142px;[\s\S]*grid-template-rows:\s*56px minmax\(0,\s*auto\) auto;/);
		assert.match(exploreSource, /\.channelBanner\s*\{[\s\S]*width:\s*calc\(100% \+ 2px\);[\s\S]*height:\s*56px;[\s\S]*margin:\s*-1px -1px 0;[\s\S]*border-radius:\s*12px 12px 0 0;/);
		assert.match(exploreSource, /@media \(max-width:\s*1450px\)\s*\{[\s\S]*width:\s*100%;[\s\S]*\.rightRail\s*\{[\s\S]*display:\s*none;/);
		assert.notMatch(exploreSource, /--explore-main-width:/);
		assert.match(chatIndexSource, /needWideArea:\s*true,[\s\S]*keepWidgets:\s*false,/);
		assert.notMatch(chatIndexSource, /bustLayoutCap:\s*true/);
		assert.match(chatIndexSource, /\.root\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/);
		assert.match(chatIndexSource, /\.wide\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;[\s\S]*grid-template-columns:\s*minmax\(220px,\s*260px\)\s*minmax\(0,\s*1fr\);/);
		assert.match(chatIndexSource, /\.main\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;[\s\S]*min-width:\s*0;/);
		assert.match(chatRoomSource, /\.chatPane\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
		assert.match(chatRoomSource, /\.form\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);
		assert.notMatch(chatRoomSource, /\.chatPane\s*\{[\s\S]*var\(--layout-main-column-width/);
		assert.notMatch(chatRoomSource, /\.form\s*\{[\s\S]*var\(--layout-main-column-width/);
		assert.match(chatRoomSearchSource, /\.inner\s*\{[\s\S]*width:\s*100%;[\s\S]*max-width:\s*100%;/);

		assert.match(timelineSource, /needWideArea:\s*true,[\s\S]*bustLayoutCap:\s*true,/);
		assert.match(timelineSource, /--timeline-rail-width:\s*clamp\(280px,\s*22%,\s*420px\);/);
		assert.match(timelineSource, /--timeline-column-gap:\s*clamp\(16px,\s*1\.25vw,\s*32px\);/);
		assert.match(timelineSource, /width:\s*100%;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--timeline-rail-width\);/);
		assert.match(timelineSource, /class="xTimelineWideShell"/);
		assert.match(timelineSource, /@media \(max-width:\s*1250px\)\s*\{[\s\S]*--timeline-rail-width:\s*280px;[\s\S]*--timeline-column-gap:\s*16px;[\s\S]*width:\s*100%;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*var\(--timeline-rail-width\);/);
		assert.match(timelineSource, /@media \(max-width:\s*1100px\)\s*\{[\s\S]*width:\s*100%;[\s\S]*\.rightRail\s*\{[\s\S]*display:\s*none;/);
		assert.notMatch(timelineSource, /--timeline-main-width:/);
		assert.match(timelineSource, /const sidebarLimits = \{[\s\S]*trends:\s*10,[\s\S]*channels:\s*3,[\s\S]*users:\s*3,[\s\S]*tutorialNotes:\s*2,[\s\S]*\} as const;/);
		assert.match(timelineSource, /buildSearchTrendRows\(searchTrends\.value,\s*sidebarLimits\.trends\)/);
		assert.match(timelineSource, /visibleChannels = computed\(\(\) => discoverySections\.value\.channels\.slice\(0,\s*sidebarLimits\.channels\)\)/);
		assert.match(timelineSource, /visibleRecommendedUsers = computed\(\(\) => recommendedUsers\.value\.slice\(0,\s*sidebarLimits\.users\)\)/);
		assert.match(timelineSource, /visibleTutorialNotes = computed\(\(\) => discoverySections\.value\.tutorialNotes\.slice\(0,\s*sidebarLimits\.tutorialNotes\)\)/);
		assert.match(timelineSource, /notes\/discovery-sections',\s*\{\s*limit:\s*10\s*\}/);
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
		assert.match(universalLayoutOverride, /\[class\^="universal-nonTitlebarArea-"\],/);
		assert.match(universalLayoutOverride, /\[class\*=" universal-nonTitlebarArea-"\] \{/);
		assert.match(universalLayoutOverride, /width:\s*82vw\s*!important;/);
		assert.match(universalLayoutOverride, /max-width:\s*82vw\s*!important;/);
		assert.notMatch(universalLayoutOverride, /--layout-main-column-width:\s*600px\s*!important;/);
		assert.notMatch(universalLayoutOverride, /--layout-side-rail-width:\s*350px\s*!important;/);
		assert.notMatch(universalLayoutOverride, /width:\s*min\(100%,\s*var\(--codex-layout-page-max-width\)\)\s*!important;/);
		assert.notMatch(universalLayoutOverride, /1200px/);
	});
});
