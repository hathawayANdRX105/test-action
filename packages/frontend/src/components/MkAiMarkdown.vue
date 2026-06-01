<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<template v-for="(block, i) in blocks" :key="i">
		<MkCode v-if="block.type === 'code'" :code="block.code" :lang="block.lang" :forceShow="true"/>
		<!-- eslint-disable-next-line vue/no-v-html -->
		<div v-else :class="$style.prose" v-html="block.html"></div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import MkCode from '@/components/MkCode.vue';
import sanitizeHtml from '@/utility/sanitize-html.js';

const props = defineProps<{
	text: string;
}>();

type Block =
	| { type: 'code'; code: string; lang: string | undefined; }
	| { type: 'prose'; html: string; };

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// Only http(s) and mailto links are allowed; everything else becomes plain text.
function safeUrl(url: string): string | null {
	const trimmed = url.trim();
	if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
	return null;
}

// Inline markdown on already-escaped text. Order matters: code spans first so
// their contents are not further transformed.
function renderInline(escaped: string): string {
	let out = escaped;

	// Inline code: `code`
	out = out.replace(/`([^`]+?)`/g, (_, code: string) => `<code>${code}</code>`);

	// Links: [label](url)
	out = out.replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (whole, label: string, rawUrl: string) => {
		// rawUrl is HTML-escaped (e.g. &amp;); decode the entity we introduced for URL validation.
		const url = safeUrl(rawUrl.replace(/&amp;/g, '&'));
		if (url == null) return whole;
		return `<a href="${escapeHtml(url)}" target="_blank" rel="nofollow noopener">${label}</a>`;
	});

	// Bold: **text** or __text__
	out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
	out = out.replace(/__([^_]+?)__/g, '<strong>$1</strong>');

	// Italic: *text* or _text_
	out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>');
	out = out.replace(/(^|[^_])_([^_\n]+?)_(?!_)/g, '$1<em>$2</em>');

	// Strikethrough: ~~text~~
	out = out.replace(/~~([^~]+?)~~/g, '<del>$1</del>');

	return out;
}

function isTableSeparator(line: string): boolean {
	return /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
	return line
		.trim()
		.replace(/^\||\|$/g, '')
		.split('|')
		.map(cell => cell.trim());
}

// Render a chunk of prose (no fenced code) to safe HTML.
function renderProse(raw: string): string {
	const lines = escapeHtml(raw).split('\n');
	const html: string[] = [];
	let i = 0;

	let listType: 'ul' | 'ol' | null = null;
	const closeList = () => {
		if (listType) {
			html.push(`</${listType}>`);
			listType = null;
		}
	};

	while (i < lines.length) {
		const line = lines[i];

		// Blank line
		if (line.trim() === '') {
			closeList();
			i++;
			continue;
		}

		// Heading: # .. ######
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			closeList();
			const level = heading[1].length;
			html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
			i++;
			continue;
		}

		// Horizontal rule
		if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
			closeList();
			html.push('<hr>');
			i++;
			continue;
		}

		// Blockquote (collapse consecutive lines)
		if (/^\s*&gt;\s?/.test(line)) {
			closeList();
			const quote: string[] = [];
			while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
				quote.push(lines[i].replace(/^\s*&gt;\s?/, ''));
				i++;
			}
			html.push(`<blockquote>${renderInline(quote.join('<br>'))}</blockquote>`);
			continue;
		}

		// Table: header row followed by a separator row
		if (line.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
			closeList();
			const header = splitTableRow(line);
			i += 2;
			const rows: string[][] = [];
			while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
				rows.push(splitTableRow(lines[i]));
				i++;
			}
			const head = `<thead><tr>${header.map(c => `<th>${renderInline(c)}</th>`).join('')}</tr></thead>`;
			const body = `<tbody>${rows.map(r => `<tr>${r.map(c => `<td>${renderInline(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
			html.push(`<table>${head}${body}</table>`);
			continue;
		}

		// Unordered list
		const ul = /^\s*[-*+]\s+(.*)$/.exec(line);
		if (ul) {
			if (listType !== 'ul') {
				closeList();
				html.push('<ul>');
				listType = 'ul';
			}
			html.push(`<li>${renderInline(ul[1])}</li>`);
			i++;
			continue;
		}

		// Ordered list
		const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
		if (ol) {
			if (listType !== 'ol') {
				closeList();
				html.push('<ol>');
				listType = 'ol';
			}
			html.push(`<li>${renderInline(ol[1])}</li>`);
			i++;
			continue;
		}

		// Paragraph: gather consecutive plain lines
		closeList();
		const para: string[] = [];
		while (
			i < lines.length &&
			lines[i].trim() !== '' &&
			!/^(#{1,6})\s+/.test(lines[i]) &&
			!/^\s*[-*+]\s+/.test(lines[i]) &&
			!/^\s*\d+[.)]\s+/.test(lines[i]) &&
			!/^\s*&gt;\s?/.test(lines[i]) &&
			!/^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i])
		) {
			para.push(lines[i]);
			i++;
		}
		html.push(`<p>${renderInline(para.join('<br>'))}</p>`);
	}

	closeList();
	return html.join('');
}

// Split the raw text into fenced code blocks and prose. Tolerates an unterminated
// fence (during streaming) by treating the trailing part as a code block.
const blocks = computed<Block[]>(() => {
	const text = props.text ?? '';
	const result: Block[] = [];
	const fenceRe = /```([^\n`]*)\n?([\s\S]*?)```/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	const pushProse = (chunk: string) => {
		if (chunk.trim() === '') return;
		const html = sanitizeHtml(renderProse(chunk)) ?? '';
		if (html !== '') result.push({ type: 'prose', html });
	};

	while ((match = fenceRe.exec(text)) !== null) {
		pushProse(text.slice(lastIndex, match.index));
		result.push({
			type: 'code',
			lang: match[1].trim() || undefined,
			code: match[2].replace(/\n$/, ''),
		});
		lastIndex = fenceRe.lastIndex;
	}

	const rest = text.slice(lastIndex);
	// Unterminated fence still being streamed.
	const openFence = /```([^\n`]*)\n?([\s\S]*)$/.exec(rest);
	if (openFence && rest.trimStart().startsWith('```')) {
		pushProse(rest.slice(0, openFence.index));
		result.push({
			type: 'code',
			lang: openFence[1].trim() || undefined,
			code: openFence[2],
		});
	} else {
		pushProse(rest);
	}

	return result;
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	gap: 10px;
	line-height: 1.65;
	overflow-wrap: anywhere;
}

.prose {
	:first-child {
		margin-top: 0;
	}

	:last-child {
		margin-bottom: 0;
	}

	p {
		margin: 0 0 0.6em;
	}

	h1, h2, h3, h4, h5, h6 {
		margin: 0.8em 0 0.4em;
		line-height: 1.3;
	}

	h1 { font-size: 1.5em; }
	h2 { font-size: 1.3em; }
	h3 { font-size: 1.15em; }
	h4, h5, h6 { font-size: 1em; }

	ul, ol {
		margin: 0 0 0.6em;
		padding-left: 1.5em;
	}

	li {
		margin: 0.15em 0;
	}

	a {
		color: var(--MI_THEME-link);
		text-decoration: underline;
	}

	code {
		padding: 0.15em 0.4em;
		border-radius: var(--MI-radius-xs);
		background: var(--MI_THEME-bg);
		font-family: var(--MI-fontCode, monospace);
		font-size: 0.92em;
	}

	blockquote {
		margin: 0 0 0.6em;
		padding: 0.2em 0 0.2em 1em;
		border-left: 3px solid var(--MI_THEME-divider);
		color: var(--MI_THEME-fgTransparentWeak);
	}

	hr {
		margin: 1em 0;
		border: none;
		border-top: 1px solid var(--MI_THEME-divider);
	}

	table {
		display: block;
		width: max-content;
		max-width: 100%;
		margin: 0 0 0.6em;
		overflow-x: auto;
		border-collapse: collapse;
	}

	th, td {
		padding: 6px 10px;
		border: 1px solid var(--MI_THEME-divider);
		text-align: left;
	}

	th {
		background: var(--MI_THEME-bg);
		font-weight: 700;
	}
}
</style>
