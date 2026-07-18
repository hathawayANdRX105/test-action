/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import FetchRssEndpoint, { FETCH_RSS_MAX_ITEMS, FETCH_RSS_MAX_TEXT_LENGTH } from '@/server/api/endpoints/fetch-rss.js';

describe('fetch-rss endpoint', () => {
	type HttpSend = (url: string, options: {
		method?: string,
		headers?: Record<string, string>,
		timeout?: number,
	}) => Promise<{ text?: () => Promise<string> }>;

	function createEndpoint(send: ReturnType<typeof jest.fn<HttpSend>>) {
		const httpRequestService = {
			send,
		};

		return new FetchRssEndpoint(httpRequestService as never);
	}

	test('maps rejected RSS fetches to a client API error instead of an internal error', async () => {
		const send = jest.fn<HttpSend>(async () => {
			throw new Error('invalid url http://feeds.example.test/rss: unsupported protocol http:');
		});
		const endpoint = createEndpoint(send);

		await expect(endpoint.exec({
			url: 'http://feeds.example.test/rss',
		}, null as never, null)).rejects.toMatchObject({
			code: 'FETCH_FAILED',
			httpStatusCode: 400,
			kind: 'client',
		});
		expect(send).toHaveBeenCalledWith('http://feeds.example.test/rss', expect.objectContaining({
			method: 'GET',
			timeout: 5000,
		}));
	});

	test('rejects non-feed responses as fetch failures', async () => {
		const send = jest.fn<HttpSend>(async () => ({
			text: jest.fn(async () => '<html><body>not a feed</body></html>'),
		}));
		const endpoint = createEndpoint(send);

		await expect(endpoint.exec({
			url: 'https://example.test/not-rss',
		}, null as never, null)).rejects.toMatchObject({
			code: 'FETCH_FAILED',
			httpStatusCode: 400,
		});
	});

	test('parses valid RSS and defaults missing media to an empty list', async () => {
		const send = jest.fn<HttpSend>(async () => ({
			text: jest.fn(async () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Example Feed</title>
		<link>https://example.test/</link>
		<description>Example description</description>
		<item>
			<title>Example Item</title>
			<link>https://example.test/item</link>
			<guid>item-guid</guid>
			<description>Item description</description>
			<pubDate>Sat, 27 Jun 2026 00:00:00 GMT</pubDate>
		</item>
	</channel>
</rss>`),
		}));
		const endpoint = createEndpoint(send);

		await expect(endpoint.exec({
			url: 'https://example.test/rss',
		}, null as never, null)).resolves.toMatchObject({
			type: 'rss',
			title: 'Example Feed',
			link: 'https://example.test/',
			items: [{
				guid: 'item-guid',
				title: 'Example Item',
				link: 'https://example.test/item',
				description: 'Item description',
				media: [],
			}],
		});
	});

	test('limits RSS items and truncates large text fields', async () => {
		const longDescription = 'x'.repeat(FETCH_RSS_MAX_TEXT_LENGTH + 100);
		const items = Array.from({ length: FETCH_RSS_MAX_ITEMS + 10 }, (_, i) => `
		<item>
			<title>Example Item ${i}</title>
			<link>https://example.test/item-${i}</link>
			<description>${longDescription}</description>
		</item>`).join('');
		const send = jest.fn<HttpSend>(async () => ({
			text: jest.fn(async () => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
	<channel>
		<title>Example Feed</title>
		<link>https://example.test/</link>
		<description>Example description</description>
		${items}
	</channel>
</rss>`),
		}));
		const endpoint = createEndpoint(send);

		const result = await endpoint.exec({
			url: 'https://example.test/rss',
		}, null as never, null);

		expect(result.items).toHaveLength(FETCH_RSS_MAX_ITEMS);
		expect(result.items[0].description).toHaveLength(FETCH_RSS_MAX_TEXT_LENGTH);
	});
});
