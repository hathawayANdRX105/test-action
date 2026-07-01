/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import FetchRssEndpoint from '@/server/api/endpoints/fetch-rss.js';

describe('fetch-rss endpoint', () => {
	function createEndpoint(send: jest.Mock) {
		const httpRequestService = {
			send,
		};

		return new FetchRssEndpoint(httpRequestService as never);
	}

	test('maps rejected RSS fetches to a client API error instead of an internal error', async () => {
		const send = jest.fn(async () => {
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
		const send = jest.fn(async () => ({
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
		const send = jest.fn(async () => ({
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
});
