<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.root">
	<div :class="$style.summary">
		<div>
			<div :class="$style.summaryTitle">{{ i18n.ts._chat.mutedUsers }}</div>
			<div :class="$style.summarySub">{{ i18n.ts._chat.muteUserInRoomConfirm }}</div>
		</div>
	</div>

	<MkLoading v-if="fetching"/>
	<MkError v-else-if="error" @retry="init"/>
	<div v-else-if="mutings.length === 0" :class="$style.empty">
		<i class="ti ti-eye-off"></i>
		<span>{{ i18n.ts._chat.noMutedUsers }}</span>
	</div>
	<div v-else :class="$style.userList">
		<div v-for="muting in mutings" :key="muting.id" :class="$style.userRow">
			<MkUserCardMini :user="muting.user" :withChart="false"/>
			<div :class="$style.meta">{{ dateString(muting.createdAt) }}</div>
			<MkButton rounded :wait="unmutingUserId === muting.user.id" @click="unmute(muting)">
				<i class="ti ti-eye"></i> {{ i18n.ts._chat.unmuteUserInRoom }}
			</MkButton>
		</div>
	</div>

	<MkButton v-if="canFetchMore" rounded :wait="moreFetching" :class="$style.moreButton" @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import * as os from '@/os.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkError from '@/components/global/MkError.vue';

const LIMIT = 30;

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
	refreshKey?: number;
}>();

const emit = defineEmits<{
	(ev: 'unmuted', userId: string): void;
}>();

const mutings = ref<Misskey.entities.ChatRoomUserMuting[]>([]);
const fetching = ref(true);
const moreFetching = ref(false);
const error = ref(false);
const canFetchMore = ref(false);
const unmutingUserId = ref<string | null>(null);
let disposed = false;
let requestId = 0;

function dateString(value: string) {
	return new Date(value).toLocaleString();
}

async function init() {
	const currentRequestId = ++requestId;
	fetching.value = true;
	error.value = false;
	canFetchMore.value = false;
	try {
		const res = await misskeyApi('chat/rooms/user-mutes/list', {
			roomId: props.room.id,
			limit: LIMIT,
		});
		if (disposed || currentRequestId !== requestId) return;
		mutings.value = res;
		canFetchMore.value = res.length >= LIMIT;
	} catch {
		if (disposed || currentRequestId !== requestId) return;
		error.value = true;
	} finally {
		if (!disposed && currentRequestId === requestId) {
			fetching.value = false;
		}
	}
}

async function fetchMore() {
	const untilId = mutings.value.at(-1)?.id;
	if (untilId == null || moreFetching.value) return;

	const currentRequestId = requestId;
	moreFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/user-mutes/list', {
			roomId: props.room.id,
			limit: LIMIT,
			untilId,
		});
		if (disposed || currentRequestId !== requestId) return;
		mutings.value = [...mutings.value, ...res];
		canFetchMore.value = res.length >= LIMIT;
	} catch {
		if (disposed || currentRequestId !== requestId) return;
		error.value = true;
	} finally {
		if (!disposed && currentRequestId === requestId) {
			moreFetching.value = false;
		}
	}
}

async function unmute(muting: Misskey.entities.ChatRoomUserMuting) {
	if (unmutingUserId.value != null) return;

	unmutingUserId.value = muting.user.id;
	try {
		await os.apiWithDialog('chat/rooms/user-mutes/delete', {
			roomId: props.room.id,
			userId: muting.user.id,
		});
		mutings.value = mutings.value.filter(item => item.user.id !== muting.user.id);
		emit('unmuted', muting.user.id);
	} finally {
		unmutingUserId.value = null;
	}
}

onMounted(init);

watch(() => [props.room.id, props.refreshKey], () => {
	mutings.value = [];
	init();
});

onBeforeUnmount(() => {
	disposed = true;
	requestId++;
});
</script>

<style lang="scss" module>
.root {
	min-width: 0;
}

.summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 16px;
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.12);
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.55);
}

.summaryTitle {
	font-weight: 700;
}

.summarySub {
	margin-top: 4px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);
	font-size: 0.9em;
}

.empty {
	display: grid;
	place-items: center;
	gap: 10px;
	min-height: 180px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);

	i {
		font-size: 2em;
	}
}

.userList {
	display: grid;
	gap: 10px;
}

.userRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto auto;
	align-items: center;
	gap: 12px;
	min-width: 0;
	padding: 12px;
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.10);
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.45);
}

.meta {
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.55);
	font-size: 0.85em;
	white-space: nowrap;
}

.moreButton {
	justify-self: center;
}

@container (max-width: 520px) {
	.userRow {
		grid-template-columns: minmax(0, 1fr);
		align-items: stretch;
	}

	.meta {
		white-space: normal;
	}
}
</style>
