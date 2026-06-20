<!--
SPDX-FileCopyrightText: lpHex
SPDX-License-Identifier: AGPL-3.0-only

小红书风的网格模式 timeline 单条。
有图帖:首图作为卡片主体,底部用户+互动数。
纯文字帖:用户 ID 哈希色作为背景,前 6 行文本居中显示。
点击整卡跳转帖子。
-->

<template>
<a :class="$style.card" :href="`/notes/${note.id}`" @click.prevent="goNote">
	<!-- 顶部图片或纯色文字块 -->
	<div v-if="firstImage && cardImageUrl" :class="$style.imageWrap">
		<img :src="cardImageUrl" :alt="firstImage.comment ?? ''" :class="$style.image" loading="lazy" decoding="async" referrerpolicy="no-referrer" @error="onImageError"/>
		<span v-if="filesCount > 1" :class="$style.imageBadge">×{{ filesCount }}</span>
		<span v-if="firstImage.type?.startsWith('video')" :class="$style.playBadge"><i class="ph-play ph-bold ph-lg"></i></span>
	</div>
	<div v-else :class="$style.textCard" :style="{ background: textBg }">
		<div :class="$style.textCardInner">
			<span v-if="appearNote.cw" :class="$style.textCw">[CW] {{ appearNote.cw }}</span>
			<span v-else>{{ textPreview }}</span>
		</div>
	</div>

	<!-- 底部信息 -->
	<div :class="$style.foot">
		<div :class="$style.caption">{{ captionShort }}</div>
		<div v-if="previewTranslationLine" :class="$style.translationCaption">
			<span :class="$style.translationBadge">🌐</span>
			<span>{{ previewTranslationLine }}</span>
		</div>
		<div :class="$style.bottomLine">
			<div :class="$style.author">
				<MkAvatar :class="$style.avatar" :user="note.user" link :preview="false"/>
				<span :class="$style.name"><MkUserName :user="note.user" :nowrap="true"/></span>
			</div>
			<div :class="$style.stats">
				<span v-if="totalReactions > 0"><i class="ph-heart ph-bold ph-lg"></i>{{ totalReactions }}</span>
				<span v-if="note.repliesCount > 0"><i class="ph-chat-circle ph-bold ph-lg"></i>{{ note.repliesCount }}</span>
			</div>
		</div>
	</div>
</a>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkAvatar from '@/components/global/MkAvatar.vue';
import MkUserName from '@/components/global/MkUserName.vue';
import { useRouter } from '@/router.js';
import { getStaticImageUrl } from '@/utility/media-proxy.js';
import { useTimelinePreviewTranslation } from '@/composables/use-timeline-preview-translation.js';
import { getAppearNote } from '@/utility/get-appear-note.js';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

const router = useRouter();
const imageLoadFailed = ref(false);
const appearNote = computed(() => getAppearNote(props.note));
const translationNoteRef = computed(() => appearNote.value);
const {
	previewTranslationText,
	translatedPreview,
	shouldReplacePreviewText,
} = useTimelinePreviewTranslation(translationNoteRef);

// 找第一张图(或有封面的短视频),作为卡片主体
const firstImage = computed(() => {
	const files = appearNote.value.files ?? [];
	return files.find(f => f.type?.startsWith('image') || (f.type?.startsWith('video') && f.thumbnailUrl)) ?? null;
});

const filesCount = computed(() => (appearNote.value.files ?? []).length);

const cardImageUrl = computed(() => {
	if (imageLoadFailed.value) return '';
	const image = firstImage.value;
	if (!image) return '';
	if (image.thumbnailUrl) return safeCardImageUrl(image.thumbnailUrl);
	if (image.type?.startsWith('image') && image.url) return safeCardImageUrl(image.url);
	return '';
});

function safeCardImageUrl(source: string): string {
	if (!source) return '';
	try {
		const url = new URL(source, window.location.href);
		if (isSameOriginUrl(url)) return withGridCoverCacheKey(url);
		return getStaticImageUrl(source);
	} catch {
		return source;
	}
}

function isSameOriginUrl(url: URL): boolean {
	return url.origin === window.location.origin;
}

function withGridCoverCacheKey(url: URL): string {
	url.searchParams.set('gridCover', '20260620');
	return url.href;
}

watch(() => props.note.id, () => {
	imageLoadFailed.value = false;
});

function onImageError(): void {
	imageLoadFailed.value = true;
}

function shrinkText(text: string, max: number): string {
	return text.length > max ? text.slice(0, max) + '…' : text;
}

const isRenotePreview = computed(() => appearNote.value.id !== props.note.id);
const sourcePreviewText = computed(() => {
	const t = shouldReplacePreviewText.value ? translatedPreview.value : (appearNote.value.text ?? '').replace(/\s+/g, ' ').trim();
	if (!t) return '';
	return isRenotePreview.value ? `RN: ${t}` : t;
});

// 纯文字摘要(给纯文字帖用,最多 80 字)
const textPreview = computed(() => {
	const t = sourcePreviewText.value;
	if (!t) {
		if (appearNote.value.poll) return '📊 投票';
		return '';
	}
	return shrinkText(t, 80);
});

// 底部 caption(给图帖用,1 行截断)
const captionShort = computed(() => {
	return shrinkText(sourcePreviewText.value, 40);
});

const previewTranslationLine = computed(() => {
	if (shouldReplacePreviewText.value || !previewTranslationText.value) return '';
	const t = isRenotePreview.value ? `RN: ${previewTranslationText.value}` : previewTranslationText.value;
	return shrinkText(t, 72);
});

// 反应数总和
const totalReactions = computed(() => {
	const r = props.note.reactions ?? {};
	let sum = 0;
	for (const k in r) sum += (r[k] as number) || 0;
	return sum;
});

// 用 userId 哈希出一个柔和的背景色(纯文字帖)
const textBg = computed(() => {
	const id = props.note.userId ?? '0';
	let h = 0;
	for (let i = 0; i < id.length; i++) {
		h = (h * 31 + id.charCodeAt(i)) % 360;
	}
	return `linear-gradient(135deg, hsl(${h}, 50%, 35%) 0%, hsl(${(h + 40) % 360}, 50%, 25%) 100%)`;
});

function goNote(ev: MouseEvent) {
	if (ev.metaKey || ev.ctrlKey || ev.button === 1) return;
	router.push(`/notes/${props.note.id}`);
}
</script>

<style lang="scss" module>
.card {
	display: block;
	break-inside: avoid;
	margin-bottom: 12px;
	border-radius: 14px;
	overflow: hidden;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);
	text-decoration: none;
	transition: transform 0.18s, box-shadow 0.18s;
	box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

	&:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
	}

	@media (max-width: 700px) {
		border-radius: 10px;
		margin-bottom: 8px;
	}
}

.imageWrap {
	position: relative;
	width: 100%;
	aspect-ratio: 4 / 3;
	background: var(--MI_THEME-panelHighlight);
	overflow: hidden;
}

.image {
	display: block;
	width: 100%;
	height: 100%;
	max-height: 480px;
	object-fit: cover;
	object-position: center;
}

.imageBadge {
	position: absolute;
	top: 8px;
	right: 8px;
	padding: 2px 8px;
	background: rgba(0, 0, 0, 0.6);
	color: #fff;
	font-size: 0.75em;
	border-radius: 999px;
	font-weight: 600;
}

.playBadge {
	position: absolute;
	top: 50%;
	left: 50%;
	transform: translate(-50%, -50%);
	width: 44px;
	height: 44px;
	display: flex;
	align-items: center;
	justify-content: center;
	background: rgba(0, 0, 0, 0.5);
	color: #fff;
	border-radius: 50%;
	font-size: 1.2em;
}

.textCard {
	width: 100%;
	aspect-ratio: 4 / 5;
	color: #fff;
	display: flex;
	align-items: center;
	justify-content: center;
	padding: 18px;
	box-sizing: border-box;
}

.textCardInner {
	font-size: 0.98em;
	line-height: 1.5;
	text-align: center;
	max-height: 100%;
	overflow: hidden;
	text-shadow: 0 1px 2px rgba(0, 0, 0, 0.25);
	display: -webkit-box;
	-webkit-line-clamp: 6;
	-webkit-box-orient: vertical;
}

.textCw {
	display: block;
	font-weight: 600;
	opacity: 0.92;
}

.foot {
	padding: 10px 12px 12px;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.caption {
	font-size: 0.88em;
	color: var(--MI_THEME-fg);
	line-height: 1.35;
	overflow: hidden;
	text-overflow: ellipsis;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	min-height: 1em;
}

.translationCaption {
	font-size: 0.8em;
	line-height: 1.35;
	color: var(--MI_THEME-fgTransparentWeak);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
}

.translationBadge {
	display: inline-block;
	margin-inline-end: 5px;
	opacity: 0.72;
}

.bottomLine {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
}

.author {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.avatar {
	width: 22px;
	height: 22px;
}

.name {
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
	max-width: 110px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.stats {
	display: flex;
	gap: 10px;
	font-size: 0.78em;
	color: var(--MI_THEME-fgTransparentWeak);

	span {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	i {
		font-size: 0.9em;
	}
}
</style>
