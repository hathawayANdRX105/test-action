/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, expect, test } from 'vitest';
import aiSource from '@/pages/ai.vue?raw';

describe('ai page layout', () => {
	test('keeps long answers inside the message scroller', () => {
		assert.match(aiSource, /<div v-if="!status\.enabled \|\| status\.providers\.length === 0" :class="\$style\.noticeStack">/);
		assert.match(aiSource, /\.chat\s*\{[\s\S]*grid-template-areas:\s*"topbar"\s*"notice"\s*"messages"\s*"attachments"\s*"composer";[\s\S]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto auto;/);
		assert.match(aiSource, /\.topbar\s*\{[\s\S]*grid-area:\s*topbar;/);
		assert.match(aiSource, /\.noticeStack\s*\{[\s\S]*grid-area:\s*notice;/);
		assert.match(aiSource, /\.messages\s*\{[\s\S]*grid-area:\s*messages;[\s\S]*overflow-y:\s*auto;/);
		assert.match(aiSource, /\.pendingAttachments\s*\{[\s\S]*grid-area:\s*attachments;/);
		assert.match(aiSource, /\.composer\s*\{[\s\S]*grid-area:\s*composer;/);
	});

	test('uses a fixed three-line composer textarea', () => {
		assert.match(aiSource, /rows="3"/);
		assert.notMatch(aiSource, /@input="autoGrow"/);
		assert.notMatch(aiSource, /function autoGrow\(/);
		assert.match(aiSource, /\.textarea\s*\{[\s\S]*height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*min-height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*max-height:\s*calc\(1\.5em \* 3 \+ 18px\);[\s\S]*overflow-y:\s*auto;/);
	});
	test('regenerates by replacing the old assistant response instead of appending another branch', () => {
		assert.match(aiSource, /async function regenerateFrom\(message: AiMessage\) \{[\s\S]*await misskeyApi\('ai\/messages\/delete-from', \{ messageId: message\.id \}\);[\s\S]*messages\.value = messages\.value\.slice\(0, index\);[\s\S]*draft\.value = userMessage\.content;[\s\S]*await sendMessage\(\);[\s\S]*\n\}/);
		assert.notMatch(aiSource, /for \(const item of tail\) \{[\s\S]*await misskeyApi\('ai\/messages\/delete'/);
	});

	test('edits history by replacing the branch in one server request', () => {
		assert.match(aiSource, /async function editMessage\(message: AiMessage\) \{[\s\S]*await misskeyApi\('ai\/messages\/delete-from', \{ messageId: message\.id \}\);[\s\S]*messages\.value = messages\.value\.slice\(0, index\);[\s\S]*draft\.value = result;[\s\S]*await sendMessage\(\);[\s\S]*\n\}/);
	});

	test('keeps stopped stream cleanup isolated to its own request', () => {
		assert.match(aiSource, /const requestAbortController = new AbortController\(\);[\s\S]*abortController\.value = requestAbortController;/);
		assert.match(aiSource, /requestChatStream\(\{[\s\S]*systemPrompt: selectedConversationId\.value \? null : \(pendingSystemPrompt\.value === '' \? null : pendingSystemPrompt\.value\),[\s\S]*\}, \(text\) => \{[\s\S]*\}, requestAbortController\.signal\);/);
		assert.match(aiSource, /if \(requestAbortController\.signal\.aborted\) \{/);
		assert.match(aiSource, /if \(abortController\.value === requestAbortController\) \{[\s\S]*streaming\.value = false;[\s\S]*streamingMessageId\.value = null;[\s\S]*abortController\.value = null;[\s\S]*\}/);
		assert.match(aiSource, /function stopStreaming\(\) \{\n\tabortController\.value\?\.abort\(\);\n\}/);
	});

	test('keeps the newest message when trimming overfetched ascending message pages', () => {
		const overfetchedPage = Array.from({ length: 51 }, (_, index) => `M${index + 51}`);
		const keptMessages = overfetchedPage.slice(Math.max(overfetchedPage.length - 50, 0));
		expect(keptMessages).toHaveLength(50);
		expect(keptMessages[0]).toBe('M52');
		expect(keptMessages[keptMessages.length - 1]).toBe('M101');
		expect(keptMessages).not.toContain('M51');
		assert.match(aiSource, /function splitAscendingOverfetchPage<T>\(items: T\[\], limit: number\) \{[\s\S]*items: items\.slice\(Math\.max\(items\.length - limit, 0\)\),[\s\S]*hasMore: items\.length > limit,/);
		assert.match(aiSource, /async function fetchMessagesPage\(conversationId: string, offset: number\) \{[\s\S]*return splitAscendingOverfetchPage\(await misskeyApi<AiMessage\[\]>\('ai\/messages\/list'/);
	});
});
