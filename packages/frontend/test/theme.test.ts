/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { applyTheme } from '@/theme.js';
import type { Theme } from '@/theme.js';

vi.mock('@/i.js', () => ({
	$i: null,
}));

vi.mock('@/preferences.js', () => ({
	prefer: {
		s: {
			themes: [],
		},
		commit: vi.fn(),
	},
}));

const makeTheme = (base: 'light' | 'dark', bg: string, fg: string): Theme => ({
	id: `test-${base}`,
	name: `Test ${base}`,
	author: 'test',
	base,
	props: {
		bg,
		fg,
		accent: '#86b300',
		htmlThemeColor: bg,
	},
});

describe(applyTheme, () => {
	beforeEach(() => {
		document.documentElement.removeAttribute('style');
		document.documentElement.removeAttribute('data-color-scheme');
		localStorage.clear();

		const themeColor = document.createElement('meta');
		themeColor.name = 'theme-color';
		document.head.appendChild(themeColor);

		Object.defineProperty(document, 'fonts', {
			configurable: true,
			value: {
				forEach: vi.fn(),
				add: vi.fn(),
				delete: vi.fn(),
			},
		});
	});

	afterEach(() => {
		document.head.querySelector('meta[name="theme-color"]')?.remove();
		vi.useRealTimers();
	});

	test('applies and persists the selected light theme', () => {
		applyTheme(makeTheme('light', '#ffffff', '#111111'));

		expect(document.documentElement.dataset.colorScheme).toBe('light');
		expect(document.documentElement.style.getPropertyValue('--MI_THEME-bg')).toBe('rgb(255, 255, 255)');
		expect(document.documentElement.style.getPropertyPriority('--MI_THEME-bg')).toBe('important');
		expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('light');
		expect(document.documentElement.style.getPropertyPriority('color-scheme')).toBe('important');
		expect(localStorage.getItem('themeId')).toBe('test-light');
		expect(localStorage.getItem('colorScheme')).toBe('light');
		expect(JSON.parse(localStorage.getItem('theme') ?? '{}').fg).toBe('rgb(17, 17, 17)');
		expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('rgb(255, 255, 255)');
	});

	test('switches persisted values when applying a dark theme', () => {
		applyTheme(makeTheme('light', '#ffffff', '#111111'));
		applyTheme(makeTheme('dark', '#000000', '#eeeeee'));

		expect(document.documentElement.dataset.colorScheme).toBe('dark');
		expect(document.documentElement.style.getPropertyValue('--MI_THEME-bg')).toBe('rgb(0, 0, 0)');
		expect(document.documentElement.style.getPropertyPriority('--MI_THEME-bg')).toBe('important');
		expect(document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
		expect(localStorage.getItem('themeId')).toBe('test-dark');
		expect(localStorage.getItem('colorScheme')).toBe('dark');
		expect(JSON.parse(localStorage.getItem('theme') ?? '{}').fg).toBe('rgb(238, 238, 238)');
		expect(document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('rgb(0, 0, 0)');
	});
});
