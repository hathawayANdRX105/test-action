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

const makeTheme = (base: 'light' | 'dark', bg: string, fg: string, props: Record<string, string> = {}): Theme => ({
	id: `test-${base}`,
	name: `Test ${base}`,
	author: 'test',
	base,
	props: {
		bg,
		fg,
		accent: '#86b300',
		htmlThemeColor: bg,
		...props,
	},
});

describe(applyTheme, () => {
	beforeEach(() => {
		window.document.documentElement.removeAttribute('style');
		window.document.documentElement.removeAttribute('data-color-scheme');
		localStorage.clear();

		const themeColor = window.document.createElement('meta');
		themeColor.name = 'theme-color';
		window.document.head.appendChild(themeColor);

		Object.defineProperty(window.document, 'fonts', {
			configurable: true,
			value: {
				forEach: vi.fn(),
				add: vi.fn(),
				delete: vi.fn(),
			},
		});
	});

	afterEach(() => {
		window.document.head.querySelector('meta[name="theme-color"]')?.remove();
		vi.useRealTimers();
	});

	test('applies and persists the selected light theme', () => {
		applyTheme(makeTheme('light', '#ffffff', '#111111'));

		expect(window.document.documentElement.dataset.colorScheme).toBe('light');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-bg')).toBe('rgb(255, 255, 255)');
		expect(window.document.documentElement.style.getPropertyPriority('--MI_THEME-bg')).toBe('important');
		expect(window.document.documentElement.style.getPropertyValue('color-scheme')).toBe('light');
		expect(window.document.documentElement.style.getPropertyPriority('color-scheme')).toBe('important');
		expect(localStorage.getItem('themeId')).toBe('test-light');
		expect(localStorage.getItem('colorScheme')).toBe('light');
		expect(JSON.parse(localStorage.getItem('theme') ?? '{}').fg).toBe('rgb(17, 17, 17)');
		expect(window.document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('rgb(255, 255, 255)');
	});

	test('switches persisted values when applying a dark theme', () => {
		applyTheme(makeTheme('light', '#ffffff', '#111111'));
		applyTheme(makeTheme('dark', '#000000', '#eeeeee'));

		expect(window.document.documentElement.dataset.colorScheme).toBe('dark');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-bg')).toBe('rgb(0, 0, 0)');
		expect(window.document.documentElement.style.getPropertyPriority('--MI_THEME-bg')).toBe('important');
		expect(window.document.documentElement.style.getPropertyValue('color-scheme')).toBe('dark');
		expect(localStorage.getItem('themeId')).toBe('test-dark');
		expect(localStorage.getItem('colorScheme')).toBe('dark');
		expect(JSON.parse(localStorage.getItem('theme') ?? '{}').fg).toBe('rgb(238, 238, 238)');
		expect(window.document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('rgb(0, 0, 0)');
	});

	test('normalizes light custom surfaces in dark themes', () => {
		applyTheme(makeTheme('dark', '#0c1210', '#dee7e4', {
			panel: '#ffffff',
			pageHeaderBg: '#ffffff',
			pageHeaderFg: '#111111',
			navBg: '#ffffff',
			navFg: '#111111',
			panelHeaderBg: '#ffffff',
			panelHeaderFg: '#111111',
			htmlThemeColor: '#ffffff',
		}));

		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-panel')).toBe('#1b1b1b');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-pageHeaderBg')).toBe('#111111');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-pageHeaderFg')).toBe('rgb(222, 231, 228)');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-navBg')).toBe('#171717');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-navFg')).toBe('#ffffff');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-panelHeaderBg')).toBe('#202020');
		expect(window.document.documentElement.style.getPropertyValue('--MI_THEME-panelHeaderFg')).toBe('rgb(222, 231, 228)');
		expect(window.document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#111111');
	});
});
