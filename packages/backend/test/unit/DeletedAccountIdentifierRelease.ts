/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';

const deleteAccountProcessorSource = readFileSync(new URL('../../src/queue/processors/DeleteAccountProcessorService.ts', import.meta.url), 'utf8');
const deleteAccountServiceSource = readFileSync(new URL('../../src/core/DeleteAccountService.ts', import.meta.url), 'utf8');
const emailServiceSource = readFileSync(new URL('../../src/core/EmailService.ts', import.meta.url), 'utf8');
const signupServiceSource = readFileSync(new URL('../../src/core/SignupService.ts', import.meta.url), 'utf8');
const signupApiSource = readFileSync(new URL('../../src/server/api/SignupApiService.ts', import.meta.url), 'utf8');
const usernameAvailableSource = readFileSync(new URL('../../src/server/api/endpoints/username/available.ts', import.meta.url), 'utf8');
const releaseMigrationSource = readFileSync(new URL('../../migration/1783000000000-release-deleted-account-identifiers.js', import.meta.url), 'utf8');

describe('deleted account identifier release', () => {
	test('account deletion keeps a database tombstone instead of physically deleting the user row', () => {
		assert.match(deleteAccountServiceSource, /soft: true/);
		assert.doesNotMatch(deleteAccountProcessorSource, /usersRepository\.delete/);
	});

	test('deleting a local account releases the preserved username lock', () => {
		assert.match(deleteAccountProcessorSource, /DI\.usedUsernamesRepository/);
		assert.match(deleteAccountProcessorSource, /isLocalUser\(user\)/);
		assert.match(deleteAccountProcessorSource, /lower\("username"\) = :username/);
	});

	test('soft-deleted profiles no longer retain email identifiers', () => {
		assert.match(deleteAccountProcessorSource, /email: null/);
		assert.match(deleteAccountProcessorSource, /emailVerified: false/);
		assert.match(deleteAccountProcessorSource, /emailVerifyCode: null/);
	});

	test('email availability ignores deleted accounts', () => {
		assert.match(emailServiceSource, /\.innerJoin\('profile\.user', 'account'\)/);
		assert.match(emailServiceSource, /"account"\."isDeleted" = FALSE/);
		assert.match(signupApiSource, /"account"\."isDeleted" = FALSE/);
	});

	test('migration releases historical deleted account locks', () => {
		assert.match(releaseMigrationSource, /DROP INDEX IF EXISTS "IDX_5deb01ae162d1d70b80d064c27"/);
		assert.match(releaseMigrationSource, /NULLS NOT DISTINCT/);
		assert.match(releaseMigrationSource, /WHERE "isDeleted" = FALSE/);
		assert.match(releaseMigrationSource, /UPDATE "user_profile" AS profile/);
		assert.match(releaseMigrationSource, /account\."isDeleted" = TRUE/);
		assert.match(releaseMigrationSource, /DELETE FROM "used_username" AS used/);
		assert.match(releaseMigrationSource, /account\."isDeleted" = FALSE/);
	});

	test('username availability and signup only consider active local accounts', () => {
		assert.match(signupServiceSource, /usernameLower: username\.toLowerCase\(\), host: IsNull\(\), isDeleted: false/);
		assert.match(signupApiSource, /usernameLower: username\.toLowerCase\(\), host: IsNull\(\), isDeleted: false/);
		assert.match(usernameAvailableSource, /usernameLower: ps\.username\.toLowerCase\(\),\n\t\t\t\tisDeleted: false/);
	});
});
