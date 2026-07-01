/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { describe, test } from '@jest/globals';
import assert from 'node:assert';

describe('chat history endpoint source', () => {
	test('uses a stable lower-case SQL alias for conversation settings', () => {
		const source = readFileSync(new URL('../../src/core/ChatService.ts', import.meta.url), 'utf8');

		assert.match(source, /leftJoin\(MiChatUserConversationSetting, 'conversation_setting'/);
		assert.match(source, /conversation_setting\."hiddenUntilMessageId"/);
		assert.doesNotMatch(source, /conversationSetting\."hiddenUntilMessageId"/);
	});
});
