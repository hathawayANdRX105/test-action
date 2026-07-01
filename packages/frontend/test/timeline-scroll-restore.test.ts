/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import paginationSource from '@/components/MkPagination.vue?raw';
import timelineSource from '@/components/MkTimeline.vue?raw';
import routerViewSource from '@/components/global/RouterView.vue?raw';
import clearCacheSource from '@/utility/clear-cache.ts?raw';
import scrollKeeperSource from '@/use/use-scroll-position-keeper.ts?raw';

describe('timeline scroll restoration', () => {
	test('keeps queued timeline notes from forcing return-to-latest after viewing a note', () => {
		assert.match(paginationSource, /let lastKnownHeadState = false;/);
		assert.match(paginationSource, /function setupHeadStateScrollListener\(\)/);
		assert.match(paginationSource, /const scrollTarget = scrollableElement\.value;[\s\S]*scrollTarget\.addEventListener\('scroll', onScroll, \{ passive: true \}\);/);
		assert.match(paginationSource, /function isCurrentScrollAtHead\(\): boolean \{[\s\S]*props\.pagination\.reversed \? isTailVisible : isHeadVisible/);
		assert.match(paginationSource, /const isHead = \(\): boolean => isBackTop\.value \|\| isCurrentScrollAtHead\(\);/);
		assert.match(paginationSource, /onDeactivated\(\(\) => \{[\s\S]*isBackTop\.value = lastKnownHeadState;[\s\S]*\}\);/);
		assert.notMatch(paginationSource, /onDeactivated\(\(\) => \{[\s\S]*window\.scrollY[\s\S]*\}\);/);
	});

	test('captures the visible note anchor immediately before route deactivation', () => {
		assert.match(scrollKeeperSource, /let captureAnchor: \(\(\) => void\) \| null = null;/);
		assert.match(scrollKeeperSource, /const captureOptions: AddEventListenerOptions = \{ capture: true, passive: true \};/);
		assert.match(scrollKeeperSource, /if \(!el\.isConnected\) return;/);
		assert.match(scrollKeeperSource, /if \(scrollContainerRect\.height <= 0\) return;/);
		assert.match(scrollKeeperSource, /el\.addEventListener\('pointerdown', onScroll, captureOptions\);/);
		assert.match(scrollKeeperSource, /el\.addEventListener\('click', onScroll, captureOptions\);/);
		assert.match(scrollKeeperSource, /onDeactivated\(\(\) => \{[\s\S]*captureAnchor\?\.\(\);[\s\S]*ready = false;[\s\S]*\}\);/);
	});

	test('keeps mobile feed surfaces cached when returning from a note page', () => {
		const uncachedRoutesLine = routerViewSource.match(/const UNCACHED_ROUTES = [^\n]+/)?.[0] ?? '';

		assert.match(routerViewSource, /Feed-like pages must stay cached/);
		assert.notMatch(uncachedRoutesLine, /['"]\/['"]/);
		assert.notMatch(uncachedRoutesLine, /['"]\/explore['"]/);
		assert.notMatch(uncachedRoutesLine, /['"]\/search['"]/);
		assert.match(routerViewSource, /<KeepAlive v-if="isCacheable" :max="prefer\.s\.numberOfPageCache">/);
	});

	test('clears frontend cache without forcing a full reload to the top', () => {
		assert.match(clearCacheSource, /export function clearCache\(\): Promise<void>/);
		assert.match(clearCacheSource, /os\.promiseDialog/);
		assert.match(clearCacheSource, /window\.caches\.keys\(\)/);
		assert.notMatch(clearCacheSource, /unisonReload/);
		assert.notMatch(clearCacheSource, /window\.location\.(reload|href|replace)/);
	});

	test('bounds retained timeline items and restores the visible anchor after pagination trimming', () => {
		assert.match(timelineSource, /:displayLimit="TIMELINE_DISPLAY_LIMIT"/);
		assert.match(timelineSource, /const TIMELINE_DISPLAY_LIMIT = 160;/);
		assert.match(paginationSource, /function retainedItemsLimit\(\): number/);
		assert.match(paginationSource, /function limitItemEntries\(entries: \[string, MisskeyEntity\]\[], side: ItemRetentionSide\): MisskeyEntityMap/);
		assert.match(paginationSource, /function captureVisibleScrollAnchor\(\): ScrollAnchorSnapshot \| null/);
		assert.match(paginationSource, /function restoreVisibleScrollAnchor\(snapshot: ScrollAnchorSnapshot \| null\): void/);
		assert.match(paginationSource, /async function appendItemsWithLimit\(newItems: MisskeyEntity\[], retentionSide: ItemRetentionSide\): Promise<void>/);
		assert.match(paginationSource, /items\.value = limitItemEntries\(\[\.\.\.Array\.from\(items\.value\), \.\.\.arrayToEntries\(newItems\)\], retentionSide\);/);
		assert.match(paginationSource, /await nextTick\(\);[\s\S]*restoreVisibleScrollAnchor\(anchor\);/);
	});
});
