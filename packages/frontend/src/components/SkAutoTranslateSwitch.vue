<!--
SPDX-FileCopyrightText: lpHex
SPDX-License-Identifier: AGPL-3.0-only

时间线 header 上的一颗 🌐 按钮:
- 点击展开小弹层,2 个开关:① 自动翻译总开关 ② 替换原文
- 弹层底部小字提示译文本地缓存条数(说明"重复帖子不会重复请求")
- 缓存清除按钮(只在缓存非空时显示)
-->

<template>
<div :class="$style.wrap">
	<button
		ref="btnEl"
		type="button"
		class="_button"
		:class="[$style.btn, { [$style.btnActive]: enabled }]"
		:title="i18n.ts._autoTranslate?.title ?? '自动翻译'"
		:aria-expanded="open"
		@click="toggle()"
	>
		<i class="ph-translate ph-bold ph-lg"></i>
		<span v-if="enabled" :class="$style.badge">{{ i18n.ts._autoTranslate?.on ?? '开' }}</span>
	</button>

	<div v-if="open" ref="popupEl" :class="$style.popup" :style="popupStyle" @click.stop>
		<div :class="$style.row">
			<label :class="$style.label">
				<input type="checkbox" :checked="enabled" @change="toggleEnabled(($event.target as HTMLInputElement).checked)"/>
				<span>{{ i18n.ts._autoTranslate?.enable ?? '开启全局自动翻译' }}</span>
			</label>
			<div :class="$style.caption">{{ i18n.ts._autoTranslate?.enableHint ?? '所有展示的帖子会自动翻译成当前界面语言。译文本地缓存 7 天,避免重复请求。' }}</div>
		</div>

		<div :class="$style.row" :style="{ opacity: enabled ? 1 : 0.5 }">
			<label :class="$style.label">
				<input type="checkbox" :checked="replace" :disabled="!enabled" @change="toggleReplace(($event.target as HTMLInputElement).checked)"/>
				<span>{{ i18n.ts._autoTranslate?.replace ?? '用译文替换原文' }}</span>
			</label>
			<div :class="$style.caption">{{ i18n.ts._autoTranslate?.replaceHint ?? '关:译文显示在原文下方;开:直接替换原文(更干净)。' }}</div>
		</div>

		<div :class="$style.cacheRow">
			<span :class="$style.cacheStats">{{ i18n.tsx._autoTranslate?.cached?.({ n: cacheSize }) ?? `已缓存 ${cacheSize} 条译文` }}</span>
			<button v-if="cacheSize > 0" class="_button" :class="$style.cacheClear" @click="onClearCache">{{ i18n.ts._autoTranslate?.clearCache ?? '清空缓存' }}</button>
		</div>

		<div v-if="!translatorAvailable" :class="$style.warn">
			<i class="ph-warning ph-bold ph-lg"></i>
			{{ i18n.ts._autoTranslate?.notAvailable ?? '本站未配置翻译服务(管理员需在 外部服务 设置 DeepL/LibreTranslate)。' }}
		</div>
	</div>
</div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue';
import { prefer } from '@/preferences.js';
import { instance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { clearTranslationCache, getCacheStats } from '@/utility/note-translation-cache.js';

const open = ref(false);
const btnEl = ref<HTMLElement | null>(null);
const popupEl = ref<HTMLElement | null>(null);
const popupStyle = ref<Record<string, string>>({});

const enabled = computed(() => prefer.r.autoTranslateNotes.value);
const replace = computed(() => prefer.r.autoTranslateReplaceOriginal.value);
const translatorAvailable = computed(() => !!instance.translatorAvailable);

const cacheSize = ref(getCacheStats().size);
const MOBILE_BREAKPOINT = 700;
const MOBILE_MARGIN = 12;
const MOBILE_POPUP_MAX_WIDTH = 320;

function refreshCacheStats() {
	cacheSize.value = getCacheStats().size;
}

async function toggle(): Promise<void> {
	open.value = !open.value;
	if (open.value) {
		refreshCacheStats();
		await nextTick();
		updatePopupPosition();
	} else {
		popupStyle.value = {};
	}
}

function toggleEnabled(v: boolean) {
	prefer.commit('autoTranslateNotes', v);
}

function toggleReplace(v: boolean) {
	prefer.commit('autoTranslateReplaceOriginal', v);
}

function onClearCache() {
	clearTranslationCache();
	cacheSize.value = 0;
}

function onDocClick(ev: MouseEvent) {
	if (!open.value) return;
	const t = ev.target as Node;
	if (btnEl.value?.contains(t)) return;
	if (popupEl.value?.contains(t)) return;
	popupStyle.value = {};
	open.value = false;
}

function updatePopupPosition(): void {
	if (!open.value || !btnEl.value || window.innerWidth > MOBILE_BREAKPOINT) {
		popupStyle.value = {};
		return;
	}

	const rect = btnEl.value.getBoundingClientRect();
	const width = Math.min(MOBILE_POPUP_MAX_WIDTH, window.innerWidth - (MOBILE_MARGIN * 2));
	const maxLeft = Math.max(MOBILE_MARGIN, window.innerWidth - width - MOBILE_MARGIN);
	const left = Math.min(Math.max(MOBILE_MARGIN, rect.right - width), maxLeft);
	const top = rect.bottom + 8;
	const maxHeight = Math.min(360, Math.max(160, window.innerHeight - top - MOBILE_MARGIN));

	popupStyle.value = {
		position: 'fixed',
		top: `${Math.round(top)}px`,
		right: 'auto',
		bottom: 'auto',
		left: `${Math.round(left)}px`,
		width: `${Math.round(width)}px`,
		maxHeight: `${Math.round(maxHeight)}px`,
	};
}

onMounted(() => {
	window.document.addEventListener('click', onDocClick);
	window.addEventListener('resize', updatePopupPosition);
	window.addEventListener('scroll', updatePopupPosition, true);
});

onUnmounted(() => {
	window.document.removeEventListener('click', onDocClick);
	window.removeEventListener('resize', updatePopupPosition);
	window.removeEventListener('scroll', updatePopupPosition, true);
});
</script>

<style lang="scss" module>
.wrap {
	position: relative;
	display: inline-block;
}

.btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 6px 10px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	cursor: pointer;
	transition: background 0.12s, color 0.12s;

	&:hover {
		color: var(--MI_THEME-fg);
	}

	i { font-size: 1em; }
}

.btnActive {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);

	&:hover { color: var(--MI_THEME-fgOnAccent, #fff); }
}

.badge {
	font-size: 0.78em;
	font-weight: 700;
}

.popup {
	position: absolute;
	top: calc(100% + 8px);
	right: 0;
	z-index: 1000;
	min-width: 280px;
	max-width: 340px;
	padding: 12px;
	border-radius: 12px;
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
	display: flex;
	flex-direction: column;
	gap: 12px;

	// 移动端保持跟随按钮的紧凑弹层,避免固定到底部挡住时间线。
	@media (max-width: 700px) {
		position: fixed;
		top: 0;
		right: auto;
		bottom: auto;
		left: 12px;
		width: min(320px, calc(100vw - 24px));
		min-width: 0;
		max-width: calc(100vw - 24px);
		border-radius: 12px;
		max-height: min(52vh, 360px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
}

.row {
	display: flex;
	flex-direction: column;
	gap: 4px;
}

.label {
	display: flex;
	align-items: center;
	gap: 8px;
	cursor: pointer;
	font-size: 0.95em;

	input { cursor: pointer; }
}

.caption {
	font-size: 0.78em;
	color: var(--MI_THEME-fgTransparentWeak);
	padding-left: 22px;
	line-height: 1.4;
}

.cacheRow {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex-wrap: wrap;
	gap: 8px;
	padding-top: 8px;
	border-top: solid 0.5px var(--MI_THEME-divider);
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.cacheStats {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.cacheClear {
	flex-shrink: 0;
	color: var(--MI_THEME-error, #e74c3c);
	font-size: 0.85em;
	padding: 3px 8px;
	border-radius: 6px;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}
}

.warn {
	display: flex;
	gap: 6px;
	padding: 8px;
	border-radius: 8px;
	font-size: 0.82em;
	background: color-mix(in srgb, var(--MI_THEME-warn, #f59e0b) 12%, transparent);
	color: var(--MI_THEME-warn, #f59e0b);
	line-height: 1.4;

	i { flex-shrink: 0; font-size: 1em; }
}
</style>
