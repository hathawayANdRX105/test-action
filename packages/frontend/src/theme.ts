/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ref } from 'vue';
import tinycolor from 'tinycolor2';
import lightTheme from '@@/themes/_light.json5';
import darkTheme from '@@/themes/_dark.json5';
import JSON5 from 'json5';
import type { Ref } from 'vue';
import type { BundledTheme } from 'shiki/themes';
import { deepClone } from '@/utility/clone.js';
import { globalEvents } from '@/events.js';
import { miLocalStorage } from '@/local-storage.js';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';

export type Theme = {
	id: string;
	name: string;
	author: string;
	desc?: string;
	base?: 'dark' | 'light';
	props: Record<string, string>;
	codeHighlighter?: {
		base: BundledTheme;
		overrides?: Record<string, any>;
	} | {
		base: '_none_';
		overrides: Record<string, any>;
	};
};

export const themeProps = Object.keys(lightTheme.props).filter(key => !key.startsWith('X'));

export const getBuiltinThemes = () => Promise.all(
	[
		'l-light',
		'l-coffee',
		'l-apricot',
		'l-rainy',
		'l-botanical',
		'l-vivid',
		'l-cherry',
		'l-sushi',
		'l-u0',

		'd-dark',
		'd-persimmon',
		'd-astro',
		'd-future',
		'd-botanical',
		'd-green-lime',
		'd-green-orange',
		'd-cherry',
		'd-ice',
		'd-u0',
		'rosepine',
		'rosepine-dawn',
	].map(name => import(`@@/themes/${name}.json5`).then(({ default: _default }): Theme => _default)),
);

export function getBuiltinThemesRef() {
	const builtinThemes = ref<Theme[]>([]);
	getBuiltinThemes().then(themes => builtinThemes.value = themes);
	return builtinThemes;
}

export function getThemesRef(): Ref<Theme[]> {
	return prefer.r.themes;
}

export async function addTheme(theme: Theme): Promise<void> {
	if ($i == null) return;
	const builtinThemes = await getBuiltinThemes();
	if (builtinThemes.some(t => t.id === theme.id)) {
		throw new Error('builtin theme');
	}
	const themes = prefer.s.themes;
	if (themes.some(t => t.id === theme.id)) {
		throw new Error('already exists');
	}
	prefer.commit('themes', [...themes, theme]);
}

export async function removeTheme(theme: Theme): Promise<void> {
	if ($i == null) return;
	const themes = prefer.s.themes.filter(t => t.id !== theme.id);
	prefer.commit('themes', themes);
}

const themeFontFaceName = 'sharkey-theme-font-face';

let timeout: number | null = null;

export function applyTheme(theme: Theme, persist = true) {
	if (timeout) window.clearTimeout(timeout);

	window.document.documentElement.classList.add('_themeChanging_');

	timeout = window.setTimeout(() => {
		window.document.documentElement.classList.remove('_themeChanging_');

		// 色計算など再度行えるようにクライアント全体に通知
		globalEvents.emit('themeChanged');
	}, 1000);

	const colorScheme = theme.base === 'dark' ? 'dark' : 'light';

	window.document.documentElement.dataset.colorScheme = colorScheme;

	// Deep copy
	const _theme = deepClone(theme);

	if (_theme.base) {
		const base = [lightTheme, darkTheme].find(x => x.id === _theme.base);
		if (base) _theme.props = Object.assign({}, base.props, _theme.props);
	}

	normalizeThemeContrast(_theme);

	const props = compile(_theme);
	normalizeCompiledThemeContrast(props, colorScheme);

	for (const tag of window.document.head.children) {
		if (tag.tagName === 'META' && tag.getAttribute('name') === 'theme-color') {
			tag.setAttribute('content', props['htmlThemeColor']);
			break;
		}
	}

	let existingFontFace;
	window.document.fonts.forEach(
		(fontFace) => {
			if (fontFace.family === themeFontFaceName) existingFontFace = fontFace;
		},
	);
	if (existingFontFace) window.document.fonts.delete(existingFontFace);

	const fontFaceSrc = props.fontFaceSrc;
	const fontFaceOpts = props.fontFaceOpts || {};

	if (fontFaceSrc) {
		const fontFace = new FontFace(
			themeFontFaceName,
			fontFaceSrc, fontFaceOpts,
		);
		window.document.fonts.add(fontFace);
		fontFace.load().catch(
			(failure) => {
				console.log(failure);
			},
		);
	}

	for (const [k, v] of Object.entries(props)) {
		if (k.startsWith('font')) continue;
		window.document.documentElement.style.setProperty(`--MI_THEME-${k}`, v.toString(), 'important');
	}

	window.document.documentElement.style.setProperty('color-scheme', colorScheme, 'important');

	if (persist) {
		miLocalStorage.setItem('theme', JSON.stringify(props));
		miLocalStorage.setItem('themeId', theme.id);
		miLocalStorage.setItem('colorScheme', colorScheme);
	}

	// 色計算など再度行えるようにクライアント全体に通知
	globalEvents.emit('themeChanging');
}

function normalizeThemeContrast(theme: Theme) {
	const bg = tinycolor(theme.props.bg ?? (theme.base === 'dark' ? '#000' : '#fff'));
	const fg = tinycolor(theme.props.fg);
	const minReadableContrast = theme.base === 'dark' ? 4.5 : 3;

	if (!fg.isValid() || tinycolor.readability(bg, fg) < minReadableContrast) {
		theme.props.fg = theme.base === 'dark' ? '#dee7e4' : '#5f5f5f';
	}

	if (theme.base === 'dark') {
		const panel = tinycolor(theme.props.panel ?? theme.props.bg ?? '#000');
		const panelFg = tinycolor(theme.props.fg);

		if (!panelFg.isValid() || tinycolor.readability(panel, panelFg) < minReadableContrast) {
			theme.props.fg = '#dee7e4';
		}
	}

	const readableFg = theme.props.fg ?? (theme.base === 'dark' ? '#dee7e4' : '#5f5f5f');
	const navBg = tinycolor(theme.props.navBg ?? theme.props.panel ?? theme.props.bg ?? (theme.base === 'dark' ? '#000' : '#fff'));
	const navFg = tinycolor(theme.props.navFg ?? readableFg);
	const navReadableFg = navBg.isDark() ? '#fff' : readableFg;

	if (navBg.isDark()) {
		theme.props.navFg = navReadableFg;
		theme.props.navActive = navReadableFg;
	} else if (!navFg.isValid() || tinycolor.readability(navBg, navFg) < minReadableContrast) {
		theme.props.navFg = navReadableFg;
	}
}

function normalizeCompiledThemeContrast(props: Record<string, string>, colorScheme: 'dark' | 'light') {
	if (colorScheme !== 'dark') return;

	const darkSurfaceFallbacks: Record<string, string> = {
		bg: '#111111',
		panel: '#1b1b1b',
		panelHighlight: '#242424',
		panelHeaderBg: '#202020',
		folderHeaderBg: 'rgba(255, 255, 255, 0.05)',
		folderHeaderHoverBg: 'rgba(255, 255, 255, 0.1)',
		header: 'rgba(27, 27, 27, 0.7)',
		navBg: '#171717',
		pageHeaderBg: '#111111',
		popup: '#202020',
		windowHeader: 'rgba(27, 27, 27, 0.85)',
		htmlThemeColor: '#111111',
	};

	for (const [key, fallback] of Object.entries(darkSurfaceFallbacks)) {
		const color = tinycolor(props[key]);
		if (!color.isValid() || isVisiblyLightOnDark(color, props.bg)) {
			props[key] = fallback;
		}
	}

	const fg = tinycolor(props.fg);
	if (!fg.isValid() || tinycolor.readability(props.bg, props.fg) < 4.5) {
		props.fg = '#dee7e4';
	}

	const pageHeaderFg = tinycolor(props.pageHeaderFg);
	if (!pageHeaderFg.isValid() || tinycolor.readability(props.pageHeaderBg, props.pageHeaderFg) < 4.5) {
		props.pageHeaderFg = props.fg;
	}

	const navFg = tinycolor(props.navFg);
	if (!navFg.isValid() || tinycolor.readability(props.navBg, props.navFg) < 4.5) {
		props.navFg = '#ffffff';
		props.navActive = '#ffffff';
	}

	const panelHeaderFg = tinycolor(props.panelHeaderFg);
	if (!panelHeaderFg.isValid() || tinycolor.readability(props.panelHeaderBg, props.panelHeaderFg) < 4.5) {
		props.panelHeaderFg = props.fg;
	}
}

function isVisiblyLightOnDark(color: tinycolor.Instance, darkBg: string): boolean {
	const alpha = color.getAlpha();

	if (alpha >= 0.65) {
		return color.isLight();
	}

	const bg = tinycolor(darkBg);
	if (!bg.isValid()) {
		return color.isLight() && alpha >= 0.2;
	}

	const fgRgb = color.toRgb();
	const bgRgb = bg.toRgb();
	const mixed = tinycolor({
		r: Math.round(fgRgb.r * alpha + bgRgb.r * (1 - alpha)),
		g: Math.round(fgRgb.g * alpha + bgRgb.g * (1 - alpha)),
		b: Math.round(fgRgb.b * alpha + bgRgb.b * (1 - alpha)),
	});

	return mixed.isLight();
}

export function compile(theme: Theme): Record<string, string> {
	function getColor(val: string): tinycolor.Instance {
		if (val[0] === '@') { // ref (prop)
			return getColor(theme.props[val.substring(1)]);
		} else if (val[0] === '$') { // ref (const)
			return getColor(theme.props[val]);
		} else if (val[0] === ':') { // func
			const parts = val.split('<');
			const func = parts.shift().substring(1);
			const arg = parseFloat(parts.shift());
			const color = getColor(parts.join('<'));

			switch (func) {
				case 'darken': return color.darken(arg);
				case 'lighten': return color.lighten(arg);
				case 'alpha': return color.setAlpha(arg);
				case 'hue': return color.spin(arg);
				case 'saturate': return color.saturate(arg);
			}
		}

		// other case
		return tinycolor(val);
	}

	const props = {};

	for (const [k, v] of Object.entries(theme.props)) {
		if (k.startsWith('$')) continue; // ignore const
		if (k.startsWith('font')) { // font specs are different
			props[k] = v;
			continue;
		}

		props[k] = v.startsWith('"') ? v.replace(/^"\s*/, '') : genValue(getColor(v));
	}

	return props;
}

function genValue(c: tinycolor.Instance): string {
	return c.toRgbString();
}

export function validateTheme(theme: Record<string, any>): boolean {
	if (theme.id == null || typeof theme.id !== 'string') return false;
	if (theme.name == null || typeof theme.name !== 'string') return false;
	if (theme.base == null || !['light', 'dark'].includes(theme.base)) return false;
	if (theme.props == null || typeof theme.props !== 'object') return false;
	return true;
}

export function parseThemeCode(code: string): Theme {
	let theme;

	try {
		theme = JSON5.parse(code);
	} catch (err) {
		throw new Error('Failed to parse theme json');
	}
	if (!validateTheme(theme)) {
		throw new Error('This theme is invaild');
	}
	if (prefer.s.themes.some(t => t.id === theme.id)) {
		throw new Error('This theme is already installed');
	}

	return theme;
}

export function previewTheme(code: string): void {
	const theme = parseThemeCode(code);
	if (theme) applyTheme(theme, false);
}

export async function installTheme(code: string): Promise<void> {
	const theme = parseThemeCode(code);
	if (!theme) return;
	await addTheme(theme);
	if (theme.base === 'dark') {
		prefer.commit('darkTheme', theme);
	} else {
		prefer.commit('lightTheme', theme);
	}
	applyTheme(theme);
}
