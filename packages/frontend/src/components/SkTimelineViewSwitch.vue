<!--
SPDX-FileCopyrightText: lpHex
SPDX-License-Identifier: AGPL-3.0-only

3 段切换:推特(默认大卡) / 论坛(Discourse 风) / 网格(小红书风)
读写全局 pref timelineViewMode。
-->

<template>
<div :class="$style.switch" role="tablist" :aria-label="i18n.ts.viewMode ?? '浏览方式'">
	<button
		v-for="m in modes"
		:key="m.value"
		type="button"
		:class="[$style.btn, { [$style.active]: current === m.value }]"
		role="tab"
		:aria-selected="current === m.value"
		:title="m.label"
		@click="set(m.value)"
	>
		<i :class="m.icon"></i>
		<span :class="$style.label">{{ m.label }}</span>
	</button>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import { prefer } from '@/preferences.js';
import { i18n } from '@/i18n.js';

type Mode = 'twitter' | 'forum' | 'masonry';

// 必须用 prefer.r.X.value 才能响应式;prefer.s.X 是非响应式快照
const current = computed(() => prefer.r.timelineViewMode.value);

const modes: { value: Mode; label: string; icon: string }[] = [
	{ value: 'twitter', label: i18n.ts._viewMode?.twitter ?? '推特', icon: 'ph-list-bullets ph-bold ph-lg' },
	{ value: 'forum', label: i18n.ts._viewMode?.forum ?? '论坛', icon: 'ph-rows ph-bold ph-lg' },
	{ value: 'masonry', label: i18n.ts._viewMode?.masonry ?? '网格', icon: 'ph-squares-four ph-bold ph-lg' },
];

function set(m: Mode) {
	prefer.commit('timelineViewMode', m);
}
</script>

<style lang="scss" module>
.switch {
	display: inline-flex;
	align-items: center;
	gap: 2px;
	padding: 3px;
	background: var(--MI_THEME-buttonBg);
	border-radius: 999px;
}

.btn {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 6px 12px;
	border: none;
	background: transparent;
	color: var(--MI_THEME-fgTransparentWeak);
	border-radius: 999px;
	font-size: 0.85em;
	cursor: pointer;
	transition: background 0.12s, color 0.12s;

	&:hover {
		color: var(--MI_THEME-fg);
	}

	i {
		font-size: 1em;
	}
}

.active {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);

	&:hover {
		color: var(--MI_THEME-fgOnAccent, #fff);
	}
}

@media (max-width: 600px) {
	.label { display: none; }
	.btn { padding: 6px 10px; }
}
</style>
