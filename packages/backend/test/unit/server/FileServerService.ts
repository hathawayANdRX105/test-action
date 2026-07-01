/*
 * SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getLocalFileKeyFromUrl, parseRange } from '@/server/FileServerService.js';

describe(parseRange, () => {
	it('parses a closed byte range', () => {
		expect(parseRange('bytes=0-9', 100)).toStrictEqual({ start: 0, end: 9 });
	});

	it('parses an open-ended byte range', () => {
		expect(parseRange('bytes=90-', 100)).toStrictEqual({ start: 90, end: 99 });
	});

	it('parses a suffix byte range', () => {
		expect(parseRange('bytes=-10', 100)).toStrictEqual({ start: 90, end: 99 });
	});

	it('clamps an end past the file size', () => {
		expect(parseRange('bytes=90-1000', 100)).toStrictEqual({ start: 90, end: 99 });
	});

	it.each([
		'bytes=abc-def',
		'bytes=10-9',
		'bytes=100-',
		'bytes=-0',
		'bytes=0-1,3-4',
		'items=0-1',
	])('rejects invalid range %s', (range) => {
		expect(parseRange(range, 100)).toBeNull();
	});
});

describe(getLocalFileKeyFromUrl, () => {
	it('extracts local file keys when the configured instance URL has a trailing slash', () => {
		expect(getLocalFileKeyFromUrl(
			'https://dc.hhhl.cc/files/9f1a7d98-2b4a-42f6-a066-eda06a92b607.png',
			'https://dc.hhhl.cc/',
		)).toBe('9f1a7d98-2b4a-42f6-a066-eda06a92b607.png');
	});

	it('ignores non-local file URLs', () => {
		expect(getLocalFileKeyFromUrl(
			'https://example.com/files/9f1a7d98-2b4a-42f6-a066-eda06a92b607.png',
			'https://dc.hhhl.cc/',
		)).toBeNull();
	});

	it('ignores local non-file URLs', () => {
		expect(getLocalFileKeyFromUrl(
			'https://dc.hhhl.cc/avatar/@user@dc.hhhl.cc',
			'https://dc.hhhl.cc/',
		)).toBeNull();
	});
});
