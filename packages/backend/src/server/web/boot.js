/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

'use strict';

// ブロックの中に入れないと、定義した変数がブラウザのグローバルスコープに登録されてしまい邪魔なので
(async () => {
	window.onerror = (e) => {
		console.error(e);
		renderError('SOMETHING_HAPPENED', e);
	};
	window.onunhandledrejection = (e) => {
		console.error(e);
		renderError('SOMETHING_HAPPENED_IN_PROMISE', e);
	};

	let forceError = localStorage.getItem('forceError');
	if (forceError != null) {
		renderError('FORCED_ERROR', 'This error is forced by having forceError in local storage.');
		return;
	}

	// Force update when locales change
	const bootVersion = typeof window['VERSION'] === 'string' ? window['VERSION'] : 'unknown';
	const injectedLangsVersion = window['LA' + 'NGS' + '_VERSION'];
	const langsVersion = typeof injectedLangsVersion === 'string' ? injectedLangsVersion : bootVersion;
	const repairKey = `sharkey:boot-repair:${bootVersion}:${langsVersion}`;
	const maxRepairAttempts = 2;

	async function repairAndReload(reason) {
		const repairAttempts = Number(sessionStorage.getItem(repairKey) ?? '0');
		if (repairAttempts >= maxRepairAttempts) {
			renderError('AUTO_REPAIR_FAILED', reason);
			return;
		}
		sessionStorage.setItem(repairKey, String(repairAttempts + 1));
		console.warn('Boot failed. Clearing stale client caches and reloading once.', reason);
		localStorage.removeItem('localeVersion');
		localStorage.removeItem('locale');
		try {
			if ('caches' in window) {
				await Promise.all((await caches.keys()).map(key => caches.delete(key)));
			}
		} catch (err) {
			console.warn('Failed to clear caches during boot repair.', err);
		}
		try {
			if ('serviceWorker' in navigator) {
				const registrations = await navigator.serviceWorker.getRegistrations();
				await Promise.all(registrations.map(registration => registration.unregister()));
			}
		} catch (err) {
			console.warn('Failed to unregister service workers during boot repair.', err);
		}
		const url = new URL(location.href);
		url.searchParams.set('_bootRepair', Date.now().toString());
		location.replace(url.toString());
	}

	const localeVersion = localStorage.getItem('localeVersion');
	if (localeVersion !== langsVersion) {
		console.info(`Updating locales from version ${localeVersion ?? 'N/A'} to ${langsVersion}`);
		localStorage.removeItem('localeVersion');
		localStorage.removeItem('locale');
	}

	//#region Detect language & fetch translations
	if (!localStorage.getItem('locale')) {
		const supportedLangs = Array.isArray(LANGS) ? LANGS : ['en-US'];
		/** @type {string | null | undefined} */
		let lang = localStorage.getItem('lang');
		if (lang == null || !supportedLangs.includes(lang)) {
			if (supportedLangs.includes(navigator.language)) {
				lang = navigator.language;
			} else {
				lang = supportedLangs.find(x => x.split('-')[0] === navigator.language.split('-')[0]);

				// Fallback
				if (lang == null) lang = 'en-US';
			}
		}

		// for https://github.com/misskey-dev/misskey/issues/10202
		if (lang == null || lang.toString == null || lang.toString() === 'null') {
			console.error('invalid lang value detected!!!', typeof lang, lang);
			lang = 'en-US';
		}

		const localeFile = `${lang}.${langsVersion}.json`;
		const localRes = await window.fetch(`/assets/locales/${localeFile}`);
		if (localRes.status === 200) {
			localStorage.setItem('lang', lang);
			localStorage.setItem('locale', await localRes.text());
			localStorage.setItem('localeVersion', langsVersion);
		} else {
			await repairAndReload(`Failed to load locale: ${localeFile} (${localRes.status})`);
			return;
		}
	}
	//#endregion

	//#region Script
	async function importAppScript() {
		await import(`/vite/${CLIENT_ENTRY}`)
			.catch(async e => {
				console.error(e);
				await repairAndReload(e);
			});
	}

	window.setTimeout(() => {
		if (window.__sharkeyBootMounted === true) return;
		if (!document.getElementById('splash')) return;
		repairAndReload('The client did not finish mounting before the startup timeout.');
	}, 15000);

	// タイミングによっては、この時点でDOMの構築が済んでいる場合とそうでない場合とがある
	if (document.readyState !== 'loading') {
		importAppScript();
	} else {
		window.addEventListener('DOMContentLoaded', () => {
			importAppScript();
		});
	}
	//#endregion

	//#region Theme
	const theme = localStorage.getItem('theme');
	const themeFontFaceName = 'sharkey-theme-font-face';
	if (theme) {
		let existingFontFace;
		document.fonts.forEach((v) => { if (v.family === themeFontFaceName) existingFontFace = v;});
		if (existingFontFace) document.fonts.delete(existingFontFace);

		const themeProps = JSON.parse(theme);
		const fontFaceSrc = themeProps.fontFaceSrc;
		const fontFaceOpts = themeProps.fontFaceOpts || {};
		if (fontFaceSrc) {
			const fontFace = new FontFace(
				themeFontFaceName,
				fontFaceSrc, fontFaceOpts || {},
			);
			document.fonts.add(fontFace);
			fontFace.load().catch(
				(failure) => {
					console.log(failure);
				},
			);
		}
		for (const [k, v] of Object.entries(themeProps)) {
			if (k.startsWith('font')) continue;
			document.documentElement.style.setProperty(`--MI_THEME-${k}`, v.toString(), 'important');

			// HTMLの theme-color 適用
			if (k === 'htmlThemeColor') {
				for (const tag of document.head.children) {
					if (tag.tagName === 'META' && tag.getAttribute('name') === 'theme-color') {
						tag.setAttribute('content', v);
						break;
					}
				}
			}
		}
	}
	const colorScheme = localStorage.getItem('colorScheme');
	if (colorScheme) {
		document.documentElement.style.setProperty('color-scheme', colorScheme, 'important');
	}
	//#endregion

	const fontSize = localStorage.getItem('fontSize');
	if (fontSize) {
		if (fontSize === "custom") {
			const customFontSize = localStorage.getItem('customFontSize');
			document.documentElement.style.setProperty('font-size', `${customFontSize}px`);
		} else {
			document.documentElement.classList.add('f-' + fontSize);
		}
	}

	const cornerRadius = localStorage.getItem('cornerRadius');
	if (cornerRadius) {
		document.documentElement.classList.add(`radius-${cornerRadius}`);
	}

	const useSystemFont = localStorage.getItem('useSystemFont');
	if (useSystemFont) {
		document.documentElement.classList.add('useSystemFont');
	}

	const customCss = localStorage.getItem('customCss');
	if (customCss && customCss.length > 0) {
		const style = document.createElement('style');
		style.innerHTML = customCss;
		document.head.appendChild(style);
	}

	/**
	 * @param {string} styleText
	 * @returns {Promise<void>}
	 */
	async function addStyle(styleText) {
		let css = document.createElement('style');
		css.appendChild(document.createTextNode(styleText));
		document.head.appendChild(css);
	}

	/**
	 * @param {string} code
	 * @param {any} [details]
	 * @returns {Promise<void>}
	 */
	async function renderError(code, details) {
		// Cannot set property 'innerHTML' of null を回避
		if (document.readyState === 'loading') {
			await new Promise(resolve => window.addEventListener('DOMContentLoaded', resolve));
		}

		const locale = JSON.parse(localStorage.getItem('locale') || '{}');

		const messages = Object.assign({
			title: 'Failed to initialize hhhl',
			solution: 'The following actions may solve the problem.',
			solution1: 'Update your os and browser',
			solution2: 'Disable an adblocker',
			solution3: 'Clear the browser cache',
			solution4: '(Tor Browser) Set dom.webaudio.enabled to true',
			otherOption: 'Other options',
			otherOption1: 'Clear preferences and cache',
			otherOption2: 'Start the simple client',
			otherOption3: 'Start the repair tool',
		}, locale?._bootErrors || {});
		const reload = locale?.reload || 'Reload';
		const detailsText = details == null ? '' : (() => {
			try {
				if (details instanceof Error) return `${details.name}: ${details.message}\n${details.stack ?? ''}`;
				if (typeof details === 'string') return details;
				return `${String(details)} ${JSON.stringify(details)}`;
			} catch {
				return String(details);
			}
		})();

		let errorsElement = document.getElementById('errors');

		if (!errorsElement) {
			document.body.innerHTML = `
			<main class="boot-error">
				<div class="boot-error__mark">!</div>
				<p class="boot-error__eyebrow">Startup error</p>
				<h1>${messages.title}</h1>
				<p class="boot-error__lead">${messages.solution}</p>
				<button class="button-big" onclick="location.reload(true);">
					<span class="button-label-big">${reload}</span>
				</button>
				<div class="boot-error__tips">
					<p>${messages.solution1}</p>
					<p>${messages.solution2}</p>
					<p>${messages.solution3}</p>
					<p>${messages.solution4}</p>
				</div>
				<details class="boot-error__options">
				<summary>${messages.otherOption}</summary>
				<a href="/flush">
					<button class="button-small">
						<span class="button-label-small">${messages.otherOption1}</span>
					</button>
				</a>
				<br>
				<a href="/cli">
					<button class="button-small">
						<span class="button-label-small">${messages.otherOption2}</span>
					</button>
				</a>
				<br>
				<a href="/bios">
					<button class="button-small">
						<span class="button-label-small">${messages.otherOption3}</span>
					</button>
				</a>
				</details>
				<div id="errors"></div>
			</main>
			`;
			errorsElement = document.getElementById('errors');
		}
		const detailsElement = document.createElement('details');
		detailsElement.id = 'errorInfo';
		detailsElement.innerHTML = `
		<summary>
			<code>ERROR CODE: ${code}</code>
		</summary>
		<pre><code></code></pre>`;
		detailsElement.querySelector('code:last-child').textContent = detailsText;
		errorsElement?.appendChild(detailsElement);
		addStyle(`
		* {
			box-sizing: border-box;
			font-family: BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
		}

		#sharkey_app,
		#splash {
			display: none !important;
		}

		body,
		html {
			min-height: 100%;
			margin: 0;
		}

		body {
			background: #000;
			color: #f5f5f5;
			display: grid;
			min-height: 100vh;
			place-items: center;
			padding: 24px;
		}

		.boot-error {
			width: min(100%, 560px);
			text-align: left;
		}

		.boot-error__mark {
			align-items: center;
			border: 1px solid #2f3336;
			border-radius: 999px;
			display: inline-flex;
			font-size: 22px;
			font-weight: 800;
			height: 48px;
			justify-content: center;
			margin-bottom: 24px;
			width: 48px;
		}

		.boot-error__eyebrow {
			color: #71767b;
			font-size: 13px;
			font-weight: 700;
			letter-spacing: 0;
			margin: 0 0 8px;
			text-transform: uppercase;
		}

		h1 {
			color: #f5f5f5;
			font-size: 31px;
			line-height: 1.15;
			margin: 0 0 12px;
		}

		.boot-error__lead {
			color: #e7e9ea;
			font-size: 16px;
			line-height: 1.45;
			margin: 0 0 20px;
		}

		button {
			border-radius: 999px;
			cursor: pointer;
			font-weight: 700;
			min-height: 44px;
			padding: 0 18px;
		}

		.button-big {
			background: #eff3f4;
			border: 1px solid #eff3f4;
			color: #0f1419;
			margin-bottom: 24px;
		}

		.button-big:hover {
			background: #d7dbdc;
			border-color: #d7dbdc;
		}

		.button-small {
			background: transparent;
			border: 1px solid #536471;
			color: #eff3f4;
			margin: 10px 8px 0 0;
		}

		.button-small:hover {
			background: rgba(239, 243, 244, 0.1);
		}

		.button-label-big,
		.button-label-small {
			color: inherit;
			font-size: 15px;
		}

		a {
			color: inherit;
			text-decoration: none;
		}

		.boot-error__tips {
			border-bottom: 1px solid #2f3336;
			border-top: 1px solid #2f3336;
			color: #71767b;
			line-height: 1.45;
			margin-bottom: 18px;
			padding: 16px 0;
		}

		.boot-error__tips p {
			margin: 0 0 8px;
		}

		.boot-error__tips p:last-child {
			margin-bottom: 0;
		}

		.boot-error__options {
			color: #eff3f4;
			margin-bottom: 16px;
		}

		code,
		pre {
			font-family: Fira, FiraCode, Menlo, Consolas, monospace;
		}

		#errorInfo {
			background: #16181c;
			border: 1px solid #2f3336;
			border-radius: 16px;
			color: #e7e9ea;
			margin-top: 16px;
			padding: 14px 16px;
			width: 100%;
		}

		#errorInfo pre {
			color: #71767b;
			margin: 12px 0 0;
			overflow-wrap: anywhere;
			white-space: pre-wrap;
		}

		.boot-error__options summary,
		#errorInfo summary {
			cursor: pointer;
		}

		@media screen and (max-width: 500px) {
			body {
				padding: 20px;
			}

			h1 {
				font-size: 26px;
			}
		}`);
	}
})();
