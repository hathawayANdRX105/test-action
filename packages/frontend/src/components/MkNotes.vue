<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkPagination ref="pagingComponent" :pagination="pagination" :disableAutoLoad="disableAutoLoad">
	<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

	<template #default="{ items: notes }">
		<!-- 网格(小红书风)模式 -->
		<div v-if="viewMode === 'masonry'" :class="$style.masonryRoot">
			<SkTimelineMasonryCard
				v-for="note in notes"
				:key="note.id"
				:note="note as Misskey.entities.Note"
				:data-scroll-anchor="note.id"
			/>
		</div>

		<!-- 论坛模式 -->
		<div v-else-if="viewMode === 'forum'" :class="$style.forumRoot">
			<SkTimelineForumItem
				v-for="note in notes"
				:key="note.id"
				:note="note as Misskey.entities.Note"
				:data-scroll-anchor="note.id"
			/>
		</div>

		<!-- 推特(默认)模式 -->
		<div v-else :class="[$style.root, { [$style.noGap]: noGap, '_gaps': !noGap, [$style.reverse]: pagination.reversed }]">
			<template v-for="(note, i) in notes" :key="note.id">
				<DynamicNote :class="$style.note" :note="note as Misskey.entities.Note" :withHardMute="true" :data-scroll-anchor="note.id" @expandMute="n => emit('expandMute', n)"/>
				<MkAd v-if="note._shouldInsertAd_" :preferForms="['horizontal', 'horizontal-big']" :class="$style.ad"/>
			</template>
		</div>
	</template>
</MkPagination>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { computed, useTemplateRef } from 'vue';
import type { Paging } from '@/components/MkPagination.vue';
import DynamicNote from '@/components/DynamicNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';
import SkTimelineForumItem from '@/components/SkTimelineForumItem.vue';
import SkTimelineMasonryCard from '@/components/SkTimelineMasonryCard.vue';

const viewMode = computed(() => prefer.r.timelineViewMode.value ?? 'twitter');

const props = defineProps<{
	pagination: Paging;
	noGap?: boolean;
	disableAutoLoad?: boolean;
}>();

const pagingComponent = useTemplateRef('pagingComponent');

defineExpose({
	pagingComponent,
});

const emit = defineEmits<{
	(ev: 'expandMute', note: Misskey.entities.Note): void;
}>();
</script>

<style lang="scss" module>
.reverse {
	display: flex;
	flex-direction: column-reverse;
}

.root {
	container-type: inline-size;

	&.noGap {
		background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);

		.note:not(:empty) {
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}

		.ad {
			padding: 8px;
			background-size: auto auto;
			background-image: repeating-linear-gradient(45deg, transparent, transparent 8px, var(--MI_THEME-bg) 8px, var(--MI_THEME-bg) 14px);
			border-bottom: solid 0.5px var(--MI_THEME-divider);
		}
	}

	&:not(.noGap) {
		background: var(--MI_THEME-bg);

		.note {
			background: color-mix(in srgb, var(--MI_THEME-panel) 65%, transparent);
			border-radius: var(--MI-radius);
		}
	}
}

.ad:empty {
	display: none;
}

.masonryRoot {
	container-type: inline-size;
	column-count: 2;
	column-gap: 8px;
	padding: 8px;

	@container (min-width: 900px) { column-count: 3; column-gap: 12px; padding: 12px; }
	@container (min-width: 1400px) { column-count: 4; column-gap: 14px; }
	@container (min-width: 2000px) { column-count: 5; column-gap: 16px; }
}

.forumRoot {
	container-type: inline-size;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius, 8px);
	overflow: hidden;

	@media (max-width: 700px) {
		border-radius: 0;
	}
}
</style>
