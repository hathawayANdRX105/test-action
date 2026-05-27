/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from '@jest/globals';
import { buildSigninEmail, resolveSigninEmailLocale } from './signin-email.js';

describe('signin-email', () => {
	test('uses the profile language for login notification emails', () => {
		const email = buildSigninEmail('zh-CN', 'ja-JP', 'ja-JP, en-US;q=0.8');

		expect(email.locale).toBe('zh-CN');
		expect(email.subject).toBe('有新的登录');
		expect(email.text).toContain('您的账户有新的登录');
		expect(email.emailSettingLabel).toBe('邮件通知设置');
	});

	test('falls back to the current request language when profile language is unset', () => {
		expect(resolveSigninEmailLocale(null, 'zh-CN', 'ja-JP, en-US;q=0.8')).toBe('zh-CN');
	});

	test('falls back to Accept-Language before the default locale', () => {
		expect(resolveSigninEmailLocale(null, undefined, 'zh-TW, ja-JP;q=0.8')).toBe('zh-TW');
		expect(resolveSigninEmailLocale(null, undefined, 'xx-YY')).toBe('en-US');
	});
});
