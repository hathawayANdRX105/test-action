/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';

const emailServiceSource = readFileSync(new URL('../../src/core/EmailService.ts', import.meta.url), 'utf8');
const signupApiSource = readFileSync(new URL('../../src/server/api/SignupApiService.ts', import.meta.url), 'utf8');
const updateEmailSource = readFileSync(new URL('../../src/server/api/endpoints/i/update-email.ts', import.meta.url), 'utf8');

describe('email case-insensitive account safety', () => {
	test('normalizes account email input before validation and storage', () => {
		assert.match(emailServiceSource, /normalizeEmailAddress\(emailAddress: string\): string \{/);
		assert.match(emailServiceSource, /emailAddress\.trim\(\)\.toLowerCase\(\)/);
		assert.match(signupApiSource, /this\.emailService\.normalizeEmailAddress\(body\['emailAddress'\]\)/);
		assert.match(signupApiSource, /email: emailAddress!/);
		assert.match(updateEmailSource, /const email = ps\.email == null \? null : this\.emailService\.normalizeEmailAddress\(ps\.email\);/);
		assert.match(updateEmailSource, /email,/);
		assert.match(updateEmailSource, /sendEmail\(email, 'Email verification'/);
	});

	test('checks verified and pending emails case-insensitively', () => {
		assert.match(emailServiceSource, /LOWER\(TRIM\(\$\{alias\}\)\) = :email/);
		assert.match(emailServiceSource, /this\.userProfilesRepository\.createQueryBuilder\('profile'\)/);
		assert.match(emailServiceSource, /\.innerJoin\('profile\.user', 'account'\)/);
		assert.match(emailServiceSource, /"account"\."isDeleted" = FALSE/);
		assert.match(emailServiceSource, /this\.userPendingsRepository\.existsBy\(\{/);
		assert.match(emailServiceSource, /"profile"\."emailVerified" = TRUE/);
	});

	test('rechecks pending signup completion before creating the account', () => {
		assert.match(signupApiSource, /DUPLICATED_EMAIL/);
		assert.match(signupApiSource, /LOWER\(TRIM\("profile"\."email"\)\) = :email/);
		assert.match(signupApiSource, /"account"\."isDeleted" = FALSE/);
		assert.match(signupApiSource, /email: emailAddress,/);
	});
});
