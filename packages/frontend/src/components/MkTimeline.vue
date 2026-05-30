<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component :is="prefer.s.enablePullToRefresh ? MkPullToRefresh : 'div'" :refresher="() => reloadTimeline()">
	<MkPagination v-if="paginationQuery" ref="pagingComponent" :pagination="paginationQuery" @queue="emit('queue', $event)">
		<template #empty><MkResult type="empty" :text="i18n.ts.noNotes"/></template>

		<template #default="{ items: notes }">
			<SkTransitionGroup
				:class="[$style.root, { [$style.noGap]: noGap, '_gaps': !noGap, [$style.reverse]: paginationQuery.reversed }]"
				:enterActiveClass="$style.transition_x_enterActive"
				:leaveActiveClass="$style.transition_x_leaveActive"
				:enterFromClass="$style.transition_x_enterFrom"
				:leaveToClass="$style.transition_x_leaveTo"
				:moveClass="$style.transition_x_move"
				:animate="false"
				tag="div"
			>
				<div v-for="(note, i) in notes" :key="note.id" :class="{ '_gaps': !noGap }">
					<DynamicNote :class="$style.note" :note="note as Misskey.entities.Note" :withHardMute="true" :data-scroll-anchor="note.id"/>
					<MkAd v-if="note._shouldInsertAd_" :preferForms="['horizontal', 'horizontal-big']" :class="$style.ad"/>
				</div>
			</SkTransitionGroup>
		</template>
	</MkPagination>
</component>
</template>

<script lang="ts" setup>
import { computed, watch, onUnmounted, provide, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import type { BasicTimelineType } from '@/timelines.js';
import type { Paging } from '@/components/MkPagination.vue';
import type { MisskeyEntity } from '@/types/date-separated-list.js';
import MkPullToRefresh from '@/components/MkPullToRefresh.vue';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { $i } from '@/i.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';
import DynamicNote from '@/components/DynamicNote.vue';
import MkPagination from '@/components/MkPagination.vue';
import { i18n } from '@/i18n.js';
import SkTransitionGroup from '@/components/SkTransitionGroup.vue';

const props = withDefaults(defineProps<{
	src: BasicTimelineType | 'mentions' | 'directs' | 'list' | 'antenna' | 'channel' | 'role';
	list?: string;
	antenna?: string;
	channel?: string;
	role?: string;
	sound?: boolean;
	withRenotes?: boolean;
	withReplies?: boolean;
	withBots?: boolean;
	withSensitive?: boolean;
	onlyFiles?: boolean;
	localTimelineMode?: 'chronological' | 'replies' | 'recommended';
	discoveryMode?: boolean;
	recommendationSurface?: 'home' | 'explore';
	recommendationCategory?: 'forYou' | 'trending' | 'messages' | 'sports' | 'entertainment' | 'tutorials' | 'resources';
	recommendationSort?: 'personalized' | 'latestReply';
	recommendationRankMode?: 'personalized' | 'trending';
}>(), {
	withRenotes: true,
	withReplies: false,
	withSensitive: true,
	onlyFiles: false,
	withBots: true,
	localTimelineMode: 'chronological',
	discoveryMode: false,
	recommendationSurface: 'home',
	recommendationCategory: 'forYou',
	recommendationSort: 'personalized',
	recommendationRankMode: 'personalized',
});

const emit = defineEmits<{
	(ev: 'note'): void;
	(ev: 'queue', count: number): void;
}>();

provide('inTimeline', true);
provide('tl_withSensitive', computed(() => props.withSensitive));
provide('inChannel', computed(() => props.src === 'channel'));

type TimelineQueryType = {
	scope?: 'local' | 'social' | 'global' | 'mixed',
	antennaId?: string,
	withRenotes?: boolean,
	withReplies?: boolean,
	withFiles?: boolean,
	withBots?: boolean,
	visibility?: string,
	timelineMode?: 'chronological' | 'replies' | 'recommended',
	listId?: string,
	channelId?: string,
	roleId?: string
};
type TimelineNote = Misskey.entities.Note & MisskeyEntity;

const pagingComponent = useTemplateRef('pagingComponent');

let tlNotesCount = 0;

function prepend(note: TimelineNote) {
	if (pagingComponent.value == null) return;
	if (!props.withBots && note.user.isBot) return;

	tlNotesCount++;

	if (instance.notesPerOneAd > 0 && tlNotesCount % instance.notesPerOneAd === 0) {
		note._shouldInsertAd_ = true;
	}

	pagingComponent.value.prepend(note);

	emit('note');

	if (props.sound) {
		sound.playMisskeySfx($i && (note.userId === $i.id) ? 'noteMy' : 'note');
	}
}

let connection: Misskey.IChannelConnection<any> | null = null;
let connection2: Misskey.IChannelConnection<any> | null = null;
let paginationQuery: Paging | null = null;
const noGap = !prefer.s.showGapBetweenNotesInTimeline;

const stream = useStream();

function connectChannel() {
	const onNote = (note: TimelineNote) => prepend(note);
	if (props.discoveryMode && ['recommended', 'local', 'social', 'global'].includes(props.src)) return;

	if (props.src === 'antenna') {
		if (props.antenna == null) return;
		connection = stream.useChannel('antenna', {
			antennaId: props.antenna,
		});
	} else if (props.src === 'home') {
		connection = stream.useChannel('homeTimeline', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		});
		connection2 = stream.useChannel('main');
	} else if (props.src === 'local') {
		connection = stream.useChannel('localTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		});
	} else if (props.src === 'social') {
		connection = stream.useChannel('hybridTimeline', {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		});
	} else if (props.src === 'bubble') {
		connection = stream.useChannel('bubbleTimeline', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		});
	} else if (props.src === 'global') {
		connection = stream.useChannel('globalTimeline', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		});
	} else if (props.src === 'mentions') {
		const mainConnection = stream.useChannel('main');
		mainConnection.on('mention', onNote);
		connection = mainConnection;
	} else if (props.src === 'directs') {
		const onDirectNote = (note: TimelineNote) => {
			if (note.visibility === 'specified') {
				prepend(note);
			}
		};
		const mainConnection = stream.useChannel('main');
		mainConnection.on('mention', onDirectNote);
		connection = mainConnection;
	} else if (props.src === 'list') {
		if (props.list == null) return;
		connection = stream.useChannel('userList', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
			listId: props.list,
		});
	} else if (props.src === 'channel') {
		if (props.channel == null) return;
		connection = stream.useChannel('channel', {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
			channelId: props.channel,
		});
	} else if (props.src === 'role') {
		if (props.role == null) return;
		connection = stream.useChannel('roleTimeline', {
			roleId: props.role,
			withBots: props.withBots,
		});
	}
	if (props.src !== 'directs' && props.src !== 'mentions') connection?.on('note', onNote);
}

function disconnectChannel() {
	if (connection) connection.dispose();
	if (connection2) connection2.dispose();
}

function updatePaginationQuery() {
	let endpoint: keyof Misskey.Endpoints | null;
	let query: TimelineQueryType | null;
	const recommendationScope =
		props.src === 'recommended' ? 'mixed' :
		props.discoveryMode && ['local', 'social', 'global'].includes(props.src) ? props.src as 'local' | 'social' | 'global' :
		null;

	if (props.src === 'antenna') {
		endpoint = 'antennas/notes';
		query = {
			antennaId: props.antenna,
		};
	} else if (recommendationScope != null) {
		endpoint = 'notes/recommended-timeline';
		query = {
			scope: recommendationScope,
			surface: props.recommendationSurface,
			category: props.recommendationCategory,
			sort: props.recommendationSort,
			rankMode: props.recommendationRankMode,
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		};
	} else if (props.src === 'home') {
		endpoint = 'notes/timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		};
	} else if (props.src === 'local') {
		endpoint = 'notes/local-timeline';
		query = {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
			timelineMode: props.localTimelineMode,
		};
	} else if (props.src === 'social') {
		endpoint = 'notes/hybrid-timeline';
		query = {
			withRenotes: props.withRenotes,
			withReplies: props.withReplies,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		};
	} else if (props.src === 'bubble') {
		endpoint = 'notes/bubble-timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		};
	} else if (props.src === 'global') {
		endpoint = 'notes/global-timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
		};
	} else if (props.src === 'mentions') {
		endpoint = 'notes/mentions';
		query = null;
	} else if (props.src === 'directs') {
		endpoint = 'notes/mentions';
		query = {
			visibility: 'specified',
		};
	} else if (props.src === 'list') {
		endpoint = 'notes/user-list-timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
			listId: props.list,
		};
	} else if (props.src === 'channel') {
		endpoint = 'channels/timeline';
		query = {
			withRenotes: props.withRenotes,
			withFiles: props.onlyFiles ? true : undefined,
			withBots: props.withBots,
			channelId: props.channel,
		};
	} else if (props.src === 'role') {
		endpoint = 'roles/notes';
		query = {
			roleId: props.role,
			withBots: props.withBots,
		};
	} else {
		endpoint = null;
		query = null;
	}

	if (endpoint && query) {
		paginationQuery = {
			endpoint: endpoint,
			limit: 10,
			params: query,
			offsetMode: recommendationScope != null || (props.src === 'local' && props.localTimelineMode !== 'chronological'),
		};
	} else {
		paginationQuery = null;
	}
}

function refreshEndpointAndChannel() {
	const shouldUseStreaming = !prefer.s.disableStreamingTimeline && !(props.src === 'local' && props.localTimelineMode !== 'chronological');
	if (shouldUseStreaming) {
		disconnectChannel();
		connectChannel();
	} else {
		disconnectChannel();
	}

	updatePaginationQuery();
}

// デッキのリストカラムでwithRenotesを変更した場合に自動的に更新されるようにさせる
// IDが切り替わったら切り替え先のTLを表示させたい
watch(() => [props.list, props.antenna, props.channel, props.role, props.withRenotes, props.withBots, props.withReplies, props.onlyFiles, props.localTimelineMode, props.recommendationSurface, props.recommendationCategory, props.recommendationSort, props.recommendationRankMode], refreshEndpointAndChannel);

// withSensitiveはクライアントで完結する処理のため、単にリロードするだけでOK
watch(() => props.withSensitive, reloadTimeline);

// 初回表示用
refreshEndpointAndChannel();

onUnmounted(() => {
	disconnectChannel();
});

function reloadTimeline() {
	return new Promise<void>((res) => {
		if (pagingComponent.value == null) return;

		tlNotesCount = 0;

		pagingComponent.value.reload().then(() => {
			res();
		});
	});
}

defineExpose({
	reloadTimeline,
});
</script>

<style lang="scss" module>
.transition_x_move {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1);
}

.transition_x_enterActive {
	transition: transform 0.7s cubic-bezier(0.23, 1, 0.32, 1), opacity 0.7s cubic-bezier(0.23, 1, 0.32, 1);

	&.note,
	.note {
		/* Skip Note Rendering有効時、TransitionGroupでnoteを追加するときに一瞬がくっとなる問題を抑制する */
		content-visibility: visible !important;
	}
}

.transition_x_leaveActive {
	transition: height 0.2s cubic-bezier(0,.5,.5,1), opacity 0.2s cubic-bezier(0,.5,.5,1);
}

.transition_x_enterFrom {
	opacity: 0;
	transform: translateY(max(-64px, -100%));
}

@supports (interpolate-size: allow-keywords) {
	.transition_x_leaveTo {
		interpolate-size: allow-keywords; // heightのtransitionを動作させるために必要
		height: 0;
	}
}

.transition_x_leaveTo {
	opacity: 0;
}

.reverse {
	display: flex;
	flex-direction: column-reverse;
}

.root {
	container-type: inline-size;

	&.noGap {
		background: var(--MI_THEME-panel);

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
			background: var(--MI_THEME-panel);
			border-radius: var(--MI-radius);
		}
	}
}

.ad:empty {
	display: none;
}

</style>
