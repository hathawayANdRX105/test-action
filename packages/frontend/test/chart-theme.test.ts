/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { applyChartThemeToOptions, getChartThemeColors } from '@/utility/chart-theme.js';
import { chartVLine } from '@/utility/chart-vline.js';

describe('chart theme colors', () => {
	afterEach(() => {
		window.document.documentElement.removeAttribute('data-color-scheme');
		window.document.documentElement.removeAttribute('style');
	});

	test('uses white chart text in dark color scheme', () => {
		window.document.documentElement.dataset.colorScheme = 'dark';
		window.document.documentElement.style.setProperty('--MI_THEME-fg', '#111111');

		expect(getChartThemeColors()).toEqual({
			textColor: '#ffffff',
			gridColor: 'rgba(255, 255, 255, 0.16)',
			borderColor: 'rgba(255, 255, 255, 0.16)',
			vLineColor: 'rgba(255, 255, 255, 0.28)',
			miniChartLineColor: '#ffffff',
			miniChartGridColor: 'rgba(255, 255, 255, 0.2)',
			activityNotesColor: '#ffffff',
			activityRepliesColor: 'rgba(255, 255, 255, 0.78)',
			activityRenotesColor: 'rgba(255, 255, 255, 0.58)',
			activityWeekendColor: 'rgba(255, 255, 255, 0.9)',
		});
	});

	test('applies readable dark colors to chart options', () => {
		window.document.documentElement.dataset.colorScheme = 'dark';
		const options: Record<string, any> = {
			plugins: {
				legend: {},
			},
			scales: {
				x: {
					grid: {},
					ticks: {},
				},
				y: {
					grid: { display: false },
					ticks: {},
					title: { display: true },
				},
			},
		};

		applyChartThemeToOptions(options);

		expect(options.color).toBe('#ffffff');
		expect(options.borderColor).toBe('rgba(255, 255, 255, 0.16)');
		expect(options.plugins.legend.labels.color).toBe('#ffffff');
		expect(options.scales.x.ticks.color).toBe('#ffffff');
		expect(options.scales.x.grid.color).toBe('rgba(255, 255, 255, 0.16)');
		expect(options.scales.y.ticks.color).toBe('#ffffff');
		expect(options.scales.y.title.color).toBe('#ffffff');
		expect(options.scales.y.grid.color).toBeUndefined();
	});

	test('keeps light chart text from theme foreground', () => {
		window.document.documentElement.dataset.colorScheme = 'light';
		window.document.documentElement.style.setProperty('--MI_THEME-fg', 'rgb(17, 24, 39)');

		expect(getChartThemeColors().textColor).toBe('rgb(17, 24, 39)');
		expect(getChartThemeColors().gridColor).toBe('rgba(0, 0, 0, 0.1)');
		expect(getChartThemeColors().miniChartLineColor).toBe('#2AABEE');
		expect(getChartThemeColors().activityNotesColor).toBe('#41ddde');
	});

	test('trusts data color scheme over stale color-scheme style', () => {
		window.document.documentElement.dataset.colorScheme = 'light';
		window.document.documentElement.style.setProperty('color-scheme', 'dark');
		window.document.documentElement.style.setProperty('--MI_THEME-fg', 'rgb(17, 24, 39)');

		expect(getChartThemeColors().textColor).toBe('rgb(17, 24, 39)');
	});

	test('uses configured light accent for mini chart line', () => {
		window.document.documentElement.dataset.colorScheme = 'light';
		window.document.documentElement.style.setProperty('--MI_THEME-accent', 'rgb(34, 197, 94)');

		expect(getChartThemeColors().miniChartLineColor).toBe('rgb(34, 197, 94)');
	});

	test('draws hover guide line with current dark theme color', () => {
		window.document.documentElement.dataset.colorScheme = 'dark';
		const ctx = {
			save: vi.fn(),
			beginPath: vi.fn(),
			moveTo: vi.fn(),
			lineTo: vi.fn(),
			stroke: vi.fn(),
			restore: vi.fn(),
			lineWidth: 0,
			strokeStyle: '',
		};
		const chart = {
			ctx,
			tooltip: {
				_active: [
					{ element: { x: 10 } },
					{ element: { x: 30 } },
				],
			},
			scales: {
				y: {
					top: 5,
					bottom: 50,
				},
			},
		};

		(chartVLine() as any).beforeDraw(chart);

		expect(ctx.moveTo).toHaveBeenCalledWith(20, 50);
		expect(ctx.lineTo).toHaveBeenCalledWith(20, 5);
		expect(ctx.strokeStyle).toBe('rgba(255, 255, 255, 0.28)');
	});
});
