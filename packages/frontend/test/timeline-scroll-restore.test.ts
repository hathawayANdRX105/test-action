/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import paginationSource from '@/components/MkPagination.vue?raw';
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
});
