/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import locales from '../../../../../locales/index.js';

const FALLBACK_LOCALE = 'en-US';
const SUPPORTED_LOCALES = Object.keys(locales);
const SUPPORTED_LOCALE_SET = new Set(SUPPORTED_LOCALES);

type AcceptLanguageHeader = string | string[] | undefined;

export type SigninEmailContent = {
	locale: string;
	subject: string;
	html: string;
	text: string;
	emailSettingLabel: string;
};

function resolveLocaleCandidate(candidate: unknown): string | null {
	if (typeof candidate !== 'string') return null;

	const normalized = candidate.trim().replaceAll('_', '-');
	if (normalized === '') return null;
	if (SUPPORTED_LOCALE_SET.has(normalized)) return normalized;

	const lower = normalized.toLowerCase();
	const exactCaseInsensitive = SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === lower);
	if (exactCaseInsensitive != null) return exactCaseInsensitive;

	const primary = lower.split('-')[0];
	return SUPPORTED_LOCALES.find(locale => locale.toLowerCase().split('-')[0] === primary) ?? null;
}

function parseAcceptLanguage(header: AcceptLanguageHeader): string[] {
	const value = Array.isArray(header) ? header.join(',') : header;
	if (value == null) return [];

	return value
		.split(',')
		.map(item => {
			const [tag, ...params] = item.trim().split(';');
			const q = params
				.map(param => param.trim().match(/^q=([0-9.]+)$/)?.[1])
				.find(param => param != null);

			return {
				tag,
				q: q == null ? 1 : Number(q),
			};
		})
		.filter(item => item.tag !== '' && Number.isFinite(item.q) && item.q > 0)
		.sort((a, b) => b.q - a.q)
		.map(item => item.tag);
}

export function resolveSigninEmailLocale(
	profileLang: string | null | undefined,
	requestLang?: unknown,
	acceptLanguage?: AcceptLanguageHeader,
): string {
	return resolveLocaleCandidate(profileLang)
		?? resolveLocaleCandidate(requestLang)
		?? parseAcceptLanguage(acceptLanguage)
			.map(resolveLocaleCandidate)
			.find(locale => locale != null)
		?? FALLBACK_LOCALE;
}

export function buildSigninEmail(
	profileLang: string | null | undefined,
	requestLang?: unknown,
	acceptLanguage?: AcceptLanguageHeader,
): SigninEmailContent {
	const localeName = resolveSigninEmailLocale(profileLang, requestLang, acceptLanguage);
	const locale = locales[localeName] ?? locales[FALLBACK_LOCALE];
	const subject = locale._email._login.title;
	const body = locale._email._login.body;

	return {
		locale: localeName,
		subject,
		html: body,
		text: body,
		emailSettingLabel: locale._email.emailSetting,
	};
}
