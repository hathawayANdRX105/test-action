/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from '@jest/globals';
import sanitizeHtml from 'sanitize-html';
import { escapeHtmlForEmail, sanitizeEmailHtml } from '@/core/EmailService.js';

describe('EmailService HTML sanitize', () => {
	test('strips script, style, and event attributes from untrusted html', () => {
		const dirty = '<img src=x onerror=alert(1)><script>alert(1)</script><style>body{}</style>evil';
		const clean = sanitizeEmailHtml(dirty);

		expect(clean.toLowerCase()).not.toContain('<script');
		expect(clean.toLowerCase()).not.toContain('onerror');
		expect(clean.toLowerCase()).not.toContain('<style');
		expect(clean).toContain('evil');
	});

	test('preserves basic br/a formatting and plain text', () => {
		const input = 'Hello<br><a href="https://example.com/a">link</a>';
		const clean = sanitizeEmailHtml(input);

		expect(clean).toContain('<br');
		expect(clean).toContain('href="https://example.com/a"');
		expect(clean).toContain('link');
		expect(clean).toContain('Hello');
	});

	test('escapes subject for HTML context', () => {
		const subject = '<script>x</script>&"';
		const escaped = escapeHtmlForEmail(subject);

		expect(escaped).toBe('&lt;script&gt;x&lt;/script&gt;&amp;&quot;');
		expect(escaped).not.toContain('<script');
	});

	test('matches bare sanitize-html defaults (abuse-report policy parity)', () => {
		const dirty = '<b>ok</b><img src=x onerror=1><script>x</script>';
		expect(sanitizeEmailHtml(dirty)).toBe(sanitizeHtml(dirty));
	});
});
