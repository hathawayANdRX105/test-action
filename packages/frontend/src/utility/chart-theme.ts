/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type ChartThemeColors = {
	textColor: string;
	gridColor: string;
	borderColor: string;
	vLineColor: string;
	miniChartLineColor: string;
	miniChartGridColor: string;
	activityNotesColor: string;
	activityRepliesColor: string;
	activityRenotesColor: string;
	activityWeekendColor: string;
};

function isDarkColorScheme(): boolean {
	const html = window.document.documentElement;
	if (html.dataset.colorScheme === 'dark') return true;
	if (html.dataset.colorScheme === 'light') return false;

	const computedStyle = getComputedStyle(html);
	const colorScheme = computedStyle.colorScheme || html.style.getPropertyValue('color-scheme');

	return colorScheme.split(/\s+/).includes('dark');
}

function getCssVariable(name: string, fallback: string): string {
	const value = getComputedStyle(window.document.documentElement).getPropertyValue(name).trim();
	return value === '' ? fallback : value;
}

export function getChartThemeColors(): ChartThemeColors {
	const isDark = isDarkColorScheme();
	const textColor = isDark ? '#ffffff' : getCssVariable('--MI_THEME-fg', '#222222');
	const dividerColor = getCssVariable('--MI_THEME-divider', isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(0, 0, 0, 0.1)');

	if (isDark) {
		return {
			textColor,
			gridColor: dividerColor,
			borderColor: dividerColor,
			vLineColor: 'rgba(255, 255, 255, 0.28)',
			miniChartLineColor: textColor,
			miniChartGridColor: 'rgba(255, 255, 255, 0.2)',
			activityNotesColor: textColor,
			activityRepliesColor: 'rgba(255, 255, 255, 0.78)',
			activityRenotesColor: 'rgba(255, 255, 255, 0.58)',
			activityWeekendColor: 'rgba(255, 255, 255, 0.9)',
		};
	}

	return {
		textColor,
		gridColor: dividerColor,
		borderColor: dividerColor,
		vLineColor: 'rgba(0, 0, 0, 0.2)',
		miniChartLineColor: getCssVariable('--MI_THEME-accent', '#86b300'),
		miniChartGridColor: 'rgba(0, 0, 0, 0.16)',
		activityNotesColor: '#41ddde',
		activityRepliesColor: '#ff7a70',
		activityRenotesColor: '#a1de41',
		activityWeekendColor: '#9d7dff',
	};
}

export function applyChartThemeToOptions(options: Record<string, any>, colors: ChartThemeColors = getChartThemeColors()): void {
	options.color = colors.textColor;
	options.borderColor = colors.borderColor;

	if (options.plugins?.legend != null) {
		options.plugins.legend.labels ??= {};
		options.plugins.legend.labels.color = colors.textColor;
	}

	if (options.scales == null) return;

	for (const scale of Object.values(options.scales) as Record<string, any>[]) {
		scale.ticks ??= {};
		scale.ticks.color = colors.textColor;

		scale.title ??= {};
		scale.title.color = colors.textColor;

		scale.grid ??= {};
		if (scale.grid.display !== false) {
			scale.grid.color = colors.gridColor;
		}

		scale.border ??= {};
		if (scale.border.display !== false) {
			scale.border.color = colors.borderColor;
		}
	}
}
