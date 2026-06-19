<!--
SPDX-FileCopyrightText: hazelnoot and other Sharkey contributors
SPDX-License-Identifier: AGPL-3.0-only

Displays a translated version of a note.
-->

<template>
<div v-if="translating || translation != null" :class="[$style.translation, { [$style.replaceMode]: replaceMode }]">
	<MkLoading v-if="translating" mini/>
	<div v-else-if="translation && translation.text != null">
		<!-- 替换模式:省略 "Translated from xx:" 标签,加一个🌐图标暗示这是译文 -->
		<span v-if="replaceMode" :class="$style.replaceBadge" :title="translation.sourceLang ? i18n.tsx.translatedFrom({ x: translation.sourceLang }) : ''">🌐</span>
		<b v-else-if="translation.sourceLang">{{ i18n.tsx.translatedFrom({ x: translation.sourceLang }) }}: </b>
		<Mfm :text="translation.text" :isBlock="true" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis" class="_selectable"/>
	</div>
	<div v-else>{{ i18n.ts.translationFailed }}</div>
</div>
</template>

<script setup lang="ts">
import * as Misskey from 'misskey-js';
import { watch } from 'vue';
import { i18n } from '@/i18n.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	translating?: boolean;
	translation?: Misskey.entities.NotesTranslateResponse | false | null;
	// 替换模式:原文已经被外层 v-if 隐藏,这里去掉边框/外间距,作为正文直接显示
	replaceMode?: boolean;
}>(), {
	translating: false,
	translation: null,
	replaceMode: false,
});

if (_DEV_) {
	// Prop watch syntax: https://stackoverflow.com/a/59127059
	watch(
		[() => props.translation, () => props.translating],
		([translation, translating]) => console.debug('Translation status changed: ', { translation, translating }),
	);
}
</script>

<style module lang="scss">
.translation {
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	padding: 12px;
	margin-top: 8px;
}

.replaceMode {
	// 替换模式当正文用,不要边框、不要额外间距
	border: none;
	padding: 0;
	margin-top: 0;
}

.replaceBadge {
	font-size: 0.85em;
	margin-right: 6px;
	opacity: 0.65;
}
</style>
