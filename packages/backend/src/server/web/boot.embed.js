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
		renderError('SOMETHING_HAPPENED_IN_PROMISE', e?.reason ?? e);
	};

	let forceError = localStorage.getItem('forceError');
	if (forceError != null) {
		renderError('FORCED_ERROR', 'This error is forced by having forceError in local storage.');
		return;
	}

	// パラメータに応じてsplashのスタイルを変更
	const params = new URLSearchParams(location.search);
	if (params.has('rounded') && params.get('rounded') === 'false') {
		document.documentElement.classList.add('norounded');
	}
	if (params.has('border') && params.get('border') === 'false') {
		document.documentElement.classList.add('noborder');
	}

	// Force update when locales change
	const langsVersion = typeof LANGS_VERSION === 'string' ? LANGS_VERSION : VERSION;
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
			renderError('LOCALE_FETCH', `Failed to load locale: ${localeFile} (${localRes.status})`);
			return;
		}
	}
	//#endregion

	//#region Script
	async function importAppScript() {
		await import(`/embed_vite/${CLIENT_ENTRY}`)
			.catch(async e => {
				console.error(e);
				renderError('APP_IMPORT', e);
			});
	}

	// タイミングによっては、この時点でDOMの構築が済んでいる場合とそうでない場合とがある
	if (document.readyState !== 'loading') {
		importAppScript();
	} else {
		window.addEventListener('DOMContentLoaded', () => {
			importAppScript();
		});
	}
	//#endregion

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

		const title = locale?._bootErrors?.title || 'Failed to initialize Sharkey';
		const reload = locale?.reload || 'Reload';
		const detailsText = details == null ? '' : (() => {
			try {
				if (details instanceof Error) return `${details.name}: ${details.message}\n${details.stack ?? ''}`;
				if (typeof details === 'string') return details;
				return `${String(details)} ${JSON.stringify(details)}`;
			} catch (err) {
				return String(details);
			}
		})();

		document.body.innerHTML = `<main class="boot-error">
		<div class="boot-error__mark">!</div>
		<div class="message">${title}</div>
		<div class="submessage">Failed to initialize Sharkey</div>
		<div class="submessage">Error Code: ${code}</div>
		<button onclick="location.reload(!0)">
			<div>${reload}</div>
		</button>
		<details class="errorInfo">
			<summary>Details</summary>
			<pre><code></code></pre>
		</details>
		</main>`;
		document.querySelector('.errorInfo code').textContent = detailsText;
		addStyle(`
		* {
			box-sizing: border-box;
		}

		#sharkey_app,
		#splash {
			display: none !important;
		}

		html,
		body {
			margin: 0;
		}

		body {
			position: relative;
			background: #000;
			color: #f5f5f5;
			font-family: Hiragino Maru Gothic Pro, BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
			line-height: 1.35;
			display: grid;
			place-items: center;
			min-height: 100vh;
			margin: 0;
			padding: 24px;
			overflow: hidden;

			border-radius: var(--radius, 16px);
			border: 1px solid #2f3336;
		}

		body::before {
			content: '';
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background: #000;
			border-radius: var(--radius, 16px);
			z-index: -1;
		}

		html.embed.norounded body,
		html.embed.norounded body::before {
			border-radius: 0;
		}

		html.embed.noborder body {
			border: none;
		}

		.boot-error {
			max-width: 420px;
			text-align: center;
			width: 100%;
		}

		.boot-error__mark {
			align-items: center;
			border: 1px solid #2f3336;
			border-radius: 999px;
			display: inline-flex;
			font-size: 18px;
			font-weight: 800;
			height: 44px;
			justify-content: center;
			margin-bottom: 18px;
			width: 44px;
		}

		.message {
			text-align: center;
			font-size: 22px;
			font-weight: 800;
			margin-bottom: 12px;
		}

		.submessage {
			color: #71767b;
			text-align: center;
			font-size: 14px;
			margin-bottom: 7.5px;
		}

		.submessage:last-of-type {
			margin-bottom: 20px;
		}

		button {
			padding: 0 18px;
			min-height: 40px;
			min-width: 100px;
			font-weight: 700;
			font-family: Hiragino Maru Gothic Pro, BIZ UDGothic, Roboto, HelveticaNeue, Arial, sans-serif;
			line-height: 1.35;
			border-radius: 99rem;
			background-color: #eff3f4;
			color: #0f1419;
			border: 1px solid #eff3f4;
			cursor: pointer;
			-webkit-tap-highlight-color: transparent;
		}

		button:hover {
			background-color: #d7dbdc;
			border-color: #d7dbdc;
		}

		.errorInfo {
			background: #16181c;
			border: 1px solid #2f3336;
			border-radius: 16px;
			color: #e7e9ea;
			margin-top: 18px;
			padding: 12px 14px;
			text-align: left;
			width: 100%;
		}

		.errorInfo summary {
			cursor: pointer;
			font-weight: 700;
		}

		.errorInfo pre {
			color: #71767b;
			font-family: Fira, FiraCode, Menlo, Consolas, monospace;
			margin: 10px 0 0;
			overflow-wrap: anywhere;
			white-space: pre-wrap;
		}`);
	}
})();
