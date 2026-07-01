/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { assert, describe, test } from 'vitest';
import { isILoveUniverseFederationAchievementText } from '@/utility/achievement-post-triggers.js';

describe('achievement post triggers', () => {
	test('I Love Universe Federation accepts the public achievement phrase', () => {
		assert.isTrue(isILoveUniverseFederationAchievementText('I ❤️ #UniverseFederation'));
		assert.isTrue(isILoveUniverseFederationAchievementText('I ❤ #UniverseFederation'));
		assert.isTrue(isILoveUniverseFederationAchievementText('I $[jelly ❤] #UniverseFederation'));
		assert.isTrue(isILoveUniverseFederationAchievementText('i love #universefederation'));
	});

	test('I Love Universe Federation keeps legacy targets working', () => {
		assert.isTrue(isILoveUniverseFederationAchievementText('I love sharkey'));
		assert.isTrue(isILoveUniverseFederationAchievementText('I ❤ #Misskey'));
	});

	test('I Love Universe Federation still requires love and the target hashtag', () => {
		assert.isFalse(isILoveUniverseFederationAchievementText('#UniverseFederation'));
		assert.isFalse(isILoveUniverseFederationAchievementText('I ❤️ #OtherProject'));
		assert.isFalse(isILoveUniverseFederationAchievementText('lovely #UniverseFederation'));
	});
});
