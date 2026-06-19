<!--
SPDX-FileCopyrightText: lpHex
SPDX-License-Identifier: AGPL-3.0-only

Discourse 风的论坛模式 timeline 单条。
单行紧凑布局:头像 · 用户名 · 时间 · 标题(=首行文本截断) · 回复数 · 反应数。
点击整行跳转帖子。
-->

<template>
<a :class="$style.row" :href="`/notes/${note.id}`" @click.prevent="goNote">
	<MkAvatar :class="$style.avatar" :user="note.user" link :preview="false"/>
	<div :class="$style.body">
		<div :class="$style.meta">
			<MkUserName :class="$style.author" :user="note.user" :nowrap="true"/>
			<span :class="$style.acct">@{{ note.user.username }}<span v-if="note.user.host">@{{ note.user.host }}</span></span>
			<span :class="$style.dot">·</span>
			<MkTime :class="$style.time" :time="note.createdAt"/>
			<span v-if="note.channel" :class="$style.channelChip"><i class="ph-television ph-bold ph-lg"></i>{{ note.channel.name }}</span>
		</div>
		<div :class="$style.titleBlock">
			<div :class="$style.title">
				<span v-if="note.cw" :class="$style.cw">[CW] {{ note.cw }}</span>
				<span v-else>{{ textPreview }}</span>
				<span v-for="tag in topTags" :key="tag" :class="$style.tag">#{{ tag }}</span>
			</div>
			<div v-if="previewTranslationLine" :class="$style.translationLine">
				<span :class="$style.translationBadge">🌐</span>
				<span>{{ previewTranslationLine }}</span>
			</div>
		</div>
	</div>
	<div :class="$style.counts">
		<span :class="$style.count" :title="i18n.ts._notification.youGotReply"><i class="ph-chat-circle ph-bold ph-lg"></i>{{ note.repliesCount }}</span>
		<span :class="$style.count" :title="i18n.ts.reactions"><i class="ph-smiley ph-bold ph-lg"></i>{{ totalReactions }}</span>
		<span v-if="note.renoteCount > 0" :class="$style.count" :title="i18n.ts.renoted"><i class="ph-rocket-launch ph-bold ph-lg"></i>{{ note.renoteCount }}</span>
	</div>
</a>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import MkTime from '@/components/global/MkTime.vue';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import { useTimelinePreviewTranslation } from '@/composables/use-timeline-preview-translation.js';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

const router = useRouter();
const noteRef = computed(() => props.note);
const {
	previewTranslationText,
	translatedPreview,
	shouldReplacePreviewText,
} = useTimelinePreviewTranslation(noteRef);

function shrinkText(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + '…' : text;
}

// 提取首行文本,去掉换行,截到 120 字
const textPreview = computed(() => {
	const t = shouldReplacePreviewText.value ? translatedPreview.value : (props.note.text ?? '').replace(/\s+/g, ' ').trim();
	if (!t) {
		if (props.note.files && props.note.files.length > 0) return `[${i18n.ts.file} × ${props.note.files.length}]`;
		if (props.note.poll) return `[${i18n.ts.poll}]`;
		if (props.note.renote) return `RN: ${(props.note.renote.text ?? '').slice(0, 60)}`;
		return '';
	}
	return shrinkText(t, 120);
});

const previewTranslationLine = computed(() => {
	if (shouldReplacePreviewText.value || !previewTranslationText.value) return '';
	return shrinkText(previewTranslationText.value, 140);
});

// 拿前 3 个 hashtag
const topTags = computed(() => (props.note.tags ?? []).slice(0, 3));

// 反应数总和
const totalReactions = computed(() => {
	const r = props.note.reactions ?? {};
	let sum = 0;
	for (const k in r) sum += (r[k] as number) || 0;
	return sum;
});

function goNote(ev: MouseEvent) {
	if (ev.metaKey || ev.ctrlKey || ev.button === 1) return;
	router.push(`/notes/${props.note.id}`);
}
</script>

<style lang="scss" module>
.row {
	display: flex;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
	border-bottom: 0.5px solid var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition: background 0.12s;

	&:hover {
		background: var(--MI_THEME-panelHighlight, rgba(127, 127, 127, 0.06));
	}
}

.avatar {
	flex-shrink: 0;
	width: 32px;
	height: 32px;
}

.body {
	flex: 1;
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.meta {
	display: flex;
	align-items: center;
	gap: 6px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.author {
	font-weight: 600;
	color: var(--MI_THEME-fg);
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.acct {
	color: var(--MI_THEME-fgTransparentWeak);
	max-width: 200px;
	overflow: hidden;
	text-overflow: ellipsis;
}

.dot {
	opacity: 0.4;
}

.time {
	color: var(--MI_THEME-fgTransparentWeak);
}

.channelChip {
	display: inline-flex;
	align-items: center;
	gap: 3px;
	padding: 0 6px;
	font-size: 0.85em;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);

	i { font-size: 0.85em; }
}

.title {
	font-size: 0.95em;
	line-height: 1.4;
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 1;
	-webkit-box-orient: vertical;
	color: var(--MI_THEME-fg);
}

.titleBlock {
	display: flex;
	flex-direction: column;
	gap: 2px;
	min-width: 0;
}

.translationLine {
	display: flex;
	align-items: flex-start;
	gap: 5px;
	font-size: 0.84em;
	line-height: 1.35;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.translationBadge {
	opacity: 0.72;
}

.cw {
	color: var(--MI_THEME-warn, #f5a623);
	margin-right: 6px;
}

.tag {
	display: inline-block;
	margin-left: 6px;
	font-size: 0.85em;
	color: var(--MI_THEME-hashtag);
}

.counts {
	flex-shrink: 0;
	display: flex;
	gap: 14px;
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.count {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	min-width: 24px;

	i { font-size: 0.9em; }
}

@media (max-width: 700px) {
	.acct, .dot, .channelChip { display: none; }
	.counts { gap: 10px; }
}
</style>
