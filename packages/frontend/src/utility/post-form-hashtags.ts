/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as mfm from 'mfm-js';
import { uniqueBy } from '@/utility/array.js';

function stripHashPrefix(tag: string): string {
	return tag.startsWith('#') ? tag.slice(1) : tag;
}

export function normalizeHashtagForSearch(tag: string): string {
	return stripHashPrefix(tag).normalize('NFKC').toLowerCase();
}

export function collectHashtagsFromInput(input: string): string[] {
	const tags = input.trim().split(/\s+/)
		.map(tag => stripHashPrefix(tag.trim()))
		.filter(tag => tag.length > 0);

	return uniqueBy(tags, normalizeHashtagForSearch);
}

export function extractHashtagsFromText(text: string | null | undefined): string[] {
	if (!text) return [];

	const hashtagNodes = mfm.extract(mfm.parse(text), node => node.type === 'hashtag') as mfm.MfmHashtag[];
	return uniqueBy(hashtagNodes.map(node => node.props.hashtag), normalizeHashtagForSearch);
}

export function appendMissingHashtags(text: string | null, hashtagInput: string): string | null {
	const inputTags = collectHashtagsFromInput(hashtagInput);
	if (inputTags.length === 0) return text;

	const existingTags = new Set(extractHashtagsFromText(text).map(normalizeHashtagForSearch));
	const missingTags = inputTags.filter(tag => !existingTags.has(normalizeHashtagForSearch(tag)));
	if (missingTags.length === 0) return text;

	const hashtagsText = missingTags.map(tag => `#${tag}`).join(' ');

	if (!text) return hashtagsText;

	const textLines = text.split('\n');
	const lastLine = textLines.length - 1;
	if (textLines[lastLine].trim() === '') {
		textLines[lastLine] += hashtagsText;
	} else {
		textLines[lastLine] += ` ${hashtagsText}`;
	}

	return textLines.join('\n');
}
