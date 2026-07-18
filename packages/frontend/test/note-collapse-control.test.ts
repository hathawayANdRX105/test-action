/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import mkNoteSource from '@/components/MkNote.vue?raw';
import skNoteSource from '@/components/SkNote.vue?raw';
import subNoteSource from '@/components/MkSubNoteContent.vue?raw';

function findMatchingDivEnd(source: string, openingTagIndex: number): number {
	const divTag = /<\/?div\b[^>]*>/g;
	divTag.lastIndex = openingTagIndex;

	let depth = 0;
	for (let match = divTag.exec(source); match; match = divTag.exec(source)) {
		if (match[0].startsWith('</')) {
			depth -= 1;
			if (depth === 0) return match.index + match[0].length;
		} else if (!match[0].endsWith('/>')) {
			depth += 1;
		}
	}

	return -1;
}

function assertCollapsedControlLayout(source: string, componentName: string): void {
	const visibleContentStart = source.indexOf('<div v-show="appearNote.cw == null || showContent">');
	const collapsedContentStart = source.indexOf('<div :class="[{ [$style.contentCollapsed]: collapsed }]">');
	const visibleContentEnd = findMatchingDivEnd(source, visibleContentStart);
	const collapsedContentEnd = findMatchingDivEnd(source, collapsedContentStart);
	const showMoreButtonStart = source.indexOf('<button v-if="isLong && collapsed"', collapsedContentEnd);

	assert.isAtLeast(visibleContentStart, 0, `${componentName} should keep collapse controls within visible note content`);
	assert.isAbove(visibleContentEnd, visibleContentStart, `${componentName} should close visible note content after its controls`);
	assert.isAbove(collapsedContentStart, visibleContentStart, `${componentName} should isolate the clipped note body`);
	assert.isAbove(collapsedContentEnd, collapsedContentStart, `${componentName} should close the clipped note body`);
	assert.isAtLeast(showMoreButtonStart, collapsedContentEnd, `${componentName} should render “show more” after the clipped note body`);
	assert.isBelow(showMoreButtonStart, visibleContentEnd, `${componentName} should hide “show more” with collapsed CW content`);

	const collapsedContentStyle = source.slice(source.indexOf('.contentCollapsed {'), source.indexOf('.collapsed {'));
	const collapsedButtonStyle = source.slice(source.indexOf('.collapsed {'), source.indexOf('.collapsedLabel {'));

	assert.match(collapsedContentStyle, /&::after\s*\{[\s\S]*background-color:\s*var\(--MI_THEME-panel\);[\s\S]*-webkit-mask-image:\s*-webkit-linear-gradient\(0deg,\s*#000,\s*transparent\);[\s\S]*mask-image:\s*linear-gradient\(0deg,\s*#000,\s*transparent\);[\s\S]*transition:\s*background-color 0\.1s ease;/, `${componentName} should use one masked fade layer with an animatable color`);
	assert.match(source, /\.root:hover \.contentCollapsed::after\s*\{\s*background-color:\s*var\(--MI_THEME-panelHighlight\);/, `${componentName} should recolor the same fade layer while the note card is hovered`);
	assert.match(source, /\.root:hover \.collapsed > \.collapsedLabel\s*\{\s*background:\s*var\(--MI_THEME-panelHighlight\);/, `${componentName} should highlight the “show more” label while the note card is hovered`);
	assert.match(source, /\.collapsedLabel\s*\{[\s\S]*?background:\s*var\(--MI_THEME-panel\);[\s\S]*?transition:\s*background 0\.1s ease;/, `${componentName} should synchronize the “show more” label color with the card hover transition`);
	assert.notMatch(collapsedContentStyle, /&::before/, `${componentName} should not stack a second fade layer over the clipped text`);
	assert.notMatch(collapsedButtonStyle, /::before/, `${componentName} should not position the fade relative to the button`);
	assert.notMatch(source, /:has\(/, `${componentName} should keep the highlight compatible with the supported browser range`);
	assert.match(source, /<span :class="\$style\.collapsedLabel">\s*\{\{ i18n\.ts\.showMore \}\}\s*<i class="ti ti-chevron-down"><\/i>\s*<\/span>/, `${componentName} should use the existing down-chevron icon for “show more”`);
	assert.match(source, /<span :class="\$style\.showLessLabel">\s*\{\{ i18n\.ts\.showLess \}\}\s*<i class="ti ti-chevron-up"><\/i>\s*<\/span>/, `${componentName} should use the existing up-chevron icon for “show less”`);
	assert.match(collapsedButtonStyle, /\.collapsed\s*\{\s*display:\s*block;\s*position:\s*relative;/, `${componentName} should keep the “show more” control in normal flow`);
	assert.notMatch(source, /color\(from/, `${componentName} should use a fade compatible with the supported browser range`);
}

function assertSubNoteCollapsedControlLayout(source: string): void {
	const clippedContentStart = source.indexOf('<div :class="[$style.collapseArea, { [$style.collapsed]: collapsed }]">');
	const clippedContentEnd = findMatchingDivEnd(source, clippedContentStart);
	const showMoreButtonStart = source.indexOf('<button v-if="isLong && collapsed"', clippedContentEnd);
	const collapseAreaStyle = source.slice(source.indexOf('.collapseArea {'), source.indexOf('.fade {'));
	const fadeStyle = source.slice(source.indexOf('.fade {'), source.indexOf('.fadeLabel {'));

	assert.isAtLeast(clippedContentStart, 0, 'MkSubNoteContent.vue should isolate the clipped sub-note body');
	assert.isAbove(clippedContentEnd, clippedContentStart, 'MkSubNoteContent.vue should close the clipped sub-note body');
	assert.isAtLeast(showMoreButtonStart, clippedContentEnd, 'MkSubNoteContent.vue should render “show more” after the clipped sub-note body');
	assert.match(collapseAreaStyle, /&::after\s*\{[\s\S]*background-color:\s*var\(--MI_THEME-panel\);[\s\S]*-webkit-mask-image:\s*-webkit-linear-gradient\(0deg,\s*#000,\s*transparent\);[\s\S]*mask-image:\s*linear-gradient\(0deg,\s*#000,\s*transparent\);[\s\S]*transition:\s*background-color 0\.1s ease;/, 'MkSubNoteContent.vue should use one masked fade layer with an animatable color');
	assert.match(source, /\.root:hover > \.collapseArea::after\s*\{\s*background-color:\s*var\(--MI_THEME-panelHighlight\);/, 'MkSubNoteContent.vue should recolor the same fade layer while the sub-note card is hovered');
	assert.match(source, /\.root:hover > \.fade > \.fadeLabel\s*\{\s*background:\s*var\(--MI_THEME-panelHighlight\);/, 'MkSubNoteContent.vue should highlight the “show more” label while the sub-note card is hovered');
	assert.match(source, /\.fadeLabel\s*\{[\s\S]*?background:\s*var\(--MI_THEME-panel\);[\s\S]*?transition:\s*background 0\.1s ease;/, 'MkSubNoteContent.vue should synchronize the “show more” label color with the card hover transition');
	assert.notMatch(collapseAreaStyle, /&::before/, 'MkSubNoteContent.vue should not stack a second fade layer over the clipped sub-note text');
	assert.notMatch(fadeStyle, /::before/, 'MkSubNoteContent.vue should not position the fade relative to the button');
	assert.notMatch(source, /:has\(/, 'MkSubNoteContent.vue should keep the highlight compatible with the supported browser range');
	assert.match(source, /<span :class="\$style\.fadeLabel">\s*\{\{ i18n\.ts\.showMore \}\}\s*<i class="ti ti-chevron-down"><\/i>\s*<\/span>/, 'MkSubNoteContent.vue should use the existing down-chevron icon for “show more”');
	assert.match(source, /<span :class="\$style\.showLessLabel">\s*\{\{ i18n\.ts\.showLess \}\}\s*<i class="ti ti-chevron-up"><\/i>\s*<\/span>/, 'MkSubNoteContent.vue should use the existing up-chevron icon for “show less”');
	assert.match(fadeStyle, /\.fade\s*\{\s*display:\s*block;\s*position:\s*relative;/, 'MkSubNoteContent.vue should keep the “show more” control in normal flow');
	assert.notMatch(source, /color\(from/, 'MkSubNoteContent.vue should use a fade compatible with the supported browser range');
}

describe('collapsed note controls', () => {
	test('keeps show-more below the clipped body with an interactive fade and directional icons in all note card designs', () => {
		assertCollapsedControlLayout(mkNoteSource, 'MkNote.vue');
		assertCollapsedControlLayout(skNoteSource, 'SkNote.vue');
		assertSubNoteCollapsedControlLayout(subNoteSource);
	});
});
