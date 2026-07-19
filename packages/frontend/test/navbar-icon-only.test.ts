/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import navbarSource from '@/ui/_common_/navbar.vue?raw';
import mobileNavbarSource from '@/ui/_common_/navbar-for-mobile.vue?raw';

describe('icon-only navbar', () => {
	test('centers collapsed sidebar icons with explicit flex sizing', () => {
		assert.match(navbarSource, /\.root\.iconOnly\s*\{[\s\S]*\.instance\s*\{[\s\S]*display: flex;[\s\S]*justify-content: center;[\s\S]*\}/);
		assert.match(navbarSource, /\.root\.iconOnly\s*\{[\s\S]*\.item\s*\{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*height: 52px;[\s\S]*line-height: 1;[\s\S]*\}/);
		assert.match(navbarSource, /\.root\.iconOnly\s*\{[\s\S]*\.itemIcon\s*\{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*width: 32px;[\s\S]*height: 32px;[\s\S]*line-height: 1;[\s\S]*\}/);
		assert.match(navbarSource, /\.root\.iconOnly\s*\{[\s\S]*\.post\s*\{[\s\S]*display: flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*\}/);
		assert.match(navbarSource, /\.root\.iconOnly\s*\{[\s\S]*\.postIcon\s*\{[\s\S]*display: inline-flex;[\s\S]*align-items: center;[\s\S]*justify-content: center;[\s\S]*\}/);
		assert.strictEqual(/\.root\.iconOnly\s*\{[\s\S]*\.itemIcon\s*\{[\s\S]*display: block;/.test(navbarSource), false);
	});

	test('keeps mobile drawer brand icon compact', () => {
		assert.include(mobileNavbarSource, ':src="instanceIconUrl"');
		assert.include(mobileNavbarSource, 'const instanceIconUrl = computed');
		assert.include(mobileNavbarSource, 'return withBrandAssetVersion(instance.iconUrl) ?? withBrandAssetVersion(instance.sidebarLogoUrl) ?? DEFAULT_BRAND_ICON_URL;');
		assert.include(mobileNavbarSource, "const BRAND_ASSET_VERSION = 'uf3';");
		assert.include(mobileNavbarSource, 'const DEFAULT_BRAND_ICON_URL = `/client-assets/about-icon.png?v=${BRAND_ASSET_VERSION}`;');
		assert.match(mobileNavbarSource, /\.top\s*\{[\s\S]*height: 60px;[\s\S]*padding: 8px 16px;[\s\S]*box-sizing: border-box;[\s\S]*\}/);
		assert.match(mobileNavbarSource, /\.instance\s*\{[\s\S]*display: inline-flex;[\s\S]*width: 44px;[\s\S]*height: 44px;[\s\S]*overflow: clip;[\s\S]*\}/);
		assert.match(mobileNavbarSource, /\.instanceIcon\s*\{[\s\S]*width: 34px;[\s\S]*height: 34px;[\s\S]*object-fit: contain;[\s\S]*\}/);
		assert.strictEqual(/wideInstanceIcon/.test(mobileNavbarSource), false);
	});
});
