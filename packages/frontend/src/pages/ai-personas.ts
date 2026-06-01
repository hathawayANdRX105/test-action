/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export type AiPersona = {
	key: string;
	icon: string;
	/** Localized display name. */
	label: () => string;
	/** System prompt written to the conversation. Empty string = no persona. */
	systemPrompt: string;
};

// Built-in persona presets. Selecting one sets the conversation's systemPrompt.
// `none` clears any persona; `custom` is handled in the UI (free-text prompt).
export const AI_PERSONAS: AiPersona[] = [
	{
		key: 'none',
		icon: 'ti ti-circle',
		label: () => i18n.ts._ai.personaNone,
		systemPrompt: '',
	},
	{
		key: 'general',
		icon: 'ti ti-sparkles',
		label: () => i18n.ts._ai.personaGeneral,
		systemPrompt: 'You are a helpful, friendly and knowledgeable assistant. Answer clearly and concisely, and use Markdown (including fenced code blocks with a language tag) when it helps readability. Reply in the same language the user writes in.',
	},
	{
		key: 'translate',
		icon: 'ti ti-language',
		label: () => i18n.ts._ai.personaTranslate,
		systemPrompt: 'You are a professional translator. Detect the language of the user\'s message and translate it. If the user writes in English, translate to Chinese; otherwise translate to English. Preserve tone, formatting and meaning. Output only the translation unless asked to explain.',
	},
	{
		key: 'coding',
		icon: 'ti ti-code',
		label: () => i18n.ts._ai.personaCoding,
		systemPrompt: 'You are an expert software engineer. Give correct, idiomatic, production-quality answers. Always wrap code in fenced code blocks with the correct language tag. Explain non-obvious decisions briefly, point out edge cases, and prefer simple solutions.',
	},
	{
		key: 'copywriting',
		icon: 'ti ti-feather',
		label: () => i18n.ts._ai.personaCopywriting,
		systemPrompt: 'You are a skilled copywriter and editor. Improve the user\'s text for clarity, flow and impact while keeping their voice. Offer alternatives when useful and explain notable changes briefly.',
	},
	{
		key: 'brainstorm',
		icon: 'ti ti-bulb',
		label: () => i18n.ts._ai.personaBrainstorm,
		systemPrompt: 'You are a creative brainstorming partner. Generate a diverse range of original ideas, build on the user\'s direction, and organize suggestions clearly with short rationales. Favor quantity and variety, then highlight the most promising options.',
	},
];

export function findPersonaBySystemPrompt(systemPrompt: string | null): AiPersona | null {
	const value = (systemPrompt ?? '').trim();
	if (value === '') return AI_PERSONAS.find(p => p.key === 'none') ?? null;
	return AI_PERSONAS.find(p => p.systemPrompt === value) ?? null;
}
