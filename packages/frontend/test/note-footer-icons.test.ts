/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import mkNoteSource from '@/components/MkNote.vue?raw';
import skNoteSource from '@/components/SkNote.vue?raw';
import mkNoteDetailedSource from '@/components/MkNoteDetailed.vue?raw';
import skNoteDetailedSource from '@/components/SkNoteDetailed.vue?raw';
import mkNoteSubSource from '@/components/MkNoteSub.vue?raw';
import skNoteSubSource from '@/components/SkNoteSub.vue?raw';
import oldNoteWindowSource from '@/components/SkOldNoteWindow.vue?raw';
import xNoteFooterIconSource from '@/components/XNoteFooterIcon.vue?raw';

const footerSources = [
	['MkNote.vue', mkNoteSource],
	['SkNote.vue', skNoteSource],
	['MkNoteDetailed.vue', mkNoteDetailedSource],
	['SkNoteDetailed.vue', skNoteDetailedSource],
	['MkNoteSub.vue', mkNoteSubSource],
	['SkNoteSub.vue', skNoteSubSource],
	['SkOldNoteWindow.vue', oldNoteWindowSource],
] as const;

function footerBlocks(source: string): string[] {
	return [...source.matchAll(/<footer[\s\S]*?<\/footer>/g)].map(match => match[0]);
}

describe('note footer X icons', () => {
	test('keeps the shared X-style glyph component self contained', () => {
		assert.match(xNoteFooterIconSource, /data-x-note-footer-icon/);
		assert.match(xNoteFooterIconSource, /type:\s*'reply'\s*\|\s*'repost'\s*\|\s*'like'\s*\|\s*'views'/);
		assert.match(xNoteFooterIconSource, /fill:\s*currentColor;/);
		assert.match(xNoteFooterIconSource, /M1\.751 10c0-4\.42/);
		assert.match(xNoteFooterIconSource, /M4\.5 3\.88l4\.432 4\.14/);
		assert.match(xNoteFooterIconSource, /M16\.697 5\.5c-1\.222/);
		assert.match(xNoteFooterIconSource, /M8\.75 21V3h2v18h-2z/);
	});

	test('uses X glyphs for the core footer action slots in every note variant', () => {
		for (const [fileName, source] of footerSources) {
			const footers = footerBlocks(source);
			assert.isAbove(footers.length, 0, `${fileName} should render a note footer`);
			assert.match(source, /import XNoteFooterIcon from '@\/components\/XNoteFooterIcon\.vue';/, `${fileName} should import the shared icon component`);

			const combinedFooter = footers.join('\n');
			for (const type of ['reply', 'repost', 'views', 'like'] as const) {
				assert.match(combinedFooter, new RegExp(`<XNoteFooterIcon[^>]+type="${type}"`), `${fileName} should use the ${type} X glyph in its footer`);
			}

			assert.notMatch(combinedFooter, /ti ti-arrow-back-up|ph-arrow-u-up-left/, `${fileName} footer should not use old reply glyphs`);
			assert.notMatch(combinedFooter, /ti ti-repeat|ph-rocket-launch/, `${fileName} footer should not use old repost glyphs`);
			assert.notMatch(combinedFooter, /ph-quotes/, `${fileName} footer should not use the old quote glyph in the core slot`);
			assert.notMatch(combinedFooter, /ph-heart ph-bold ph-lg|ti ti-heart"><\/i>/, `${fileName} footer should not use old inactive heart glyphs`);
		}
	});
});
