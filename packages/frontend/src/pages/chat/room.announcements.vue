<!--
SPDX-FileCopyrightText: Universe Federation contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.root">
	<div v-if="currentText" :class="$style.section">
		<div :class="$style.sectionHead">
			<div :class="$style.sectionTitle">
				<span>{{ i18n.ts._chat.announcementHistoryCurrent }}</span>
				<span v-if="room.announcementPinned" :class="$style.badge">{{ i18n.ts._chat.pinAnnouncement }}</span>
			</div>
			<button
				type="button"
				class="_button"
				:class="[$style.pinBtn, { [$style.pinBtnActive]: room.announcementPinned }]"
				:disabled="busy"
				@click="setPinnedCurrent(!room.announcementPinned)"
			>
				{{ room.announcementPinned ? i18n.ts._chat.unpinFromChat : i18n.ts._chat.pinToChat }}
			</button>
		</div>
		<div :class="$style.card">
			<div :class="$style.cardText">{{ currentText }}</div>
		</div>
	</div>

	<div v-if="history.length > 0" :class="$style.section">
		<div :class="$style.sectionTitle">{{ i18n.ts._chat.announcementHistoryPast }}</div>
		<div :class="$style.list">
			<div v-for="item in history" :key="item.id" :class="$style.card">
				<div :class="$style.meta">
					<span :class="$style.time">{{ formatTime(item.createdAt) }}</span>
					<button
						type="button"
						class="_button"
						:class="$style.pinBtn"
						:disabled="busy"
						@click="pinHistoryItem(item)"
					>
						{{ i18n.ts._chat.pinToChat }}
					</button>
				</div>
				<div :class="$style.cardText">{{ item.text }}</div>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

type HistoryItem = {
	id: string;
	text: string;
	createdAt: string;
	pinned: boolean;
};

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
	/** 置顶到聊天后，清除本机永久关闭状态并切到聊天页 */
	(ev: 'pinnedToChat'): void;
}>();

const busy = ref(false);

const currentText = computed(() => (props.room.announcement ?? '').trim());

const history = computed((): HistoryItem[] => {
	const raw = (props.room as Misskey.entities.ChatRoom & { announcementHistory?: HistoryItem[] }).announcementHistory;
	return Array.isArray(raw) ? raw : [];
});

function formatTime(iso: string): string {
	try {
		return new Date(iso).toLocaleString();
	} catch {
		return iso;
	}
}

async function setPinnedCurrent(pinned: boolean) {
	if (busy.value) return;
	const text = currentText.value;
	if (text.length === 0) return;
	busy.value = true;
	try {
		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			announcement: text,
			announcementPinned: pinned,
		});
		emit('updated', updated);
		if (pinned) emit('pinnedToChat');
	} finally {
		busy.value = false;
	}
}

async function pinHistoryItem(item: HistoryItem) {
	if (busy.value) return;
	const text = (item.text ?? '').trim();
	if (text.length === 0) return;
	busy.value = true;
	try {
		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			announcement: text,
			announcementPinned: true,
		});
		emit('updated', updated);
		emit('pinnedToChat');
	} finally {
		busy.value = false;
	}
}
</script>

<style lang="scss" module>
.root {
	padding-bottom: 24px;
}

.section {
	display: grid;
	gap: 8px;
}

.sectionHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	min-width: 0;
}

.sectionTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	font-size: 0.85em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	opacity: 0.9;
}

.badge {
	font-size: 0.75em;
	font-weight: 600;
	padding: 1px 6px;
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 14%, transparent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 28%, transparent);
}

.list {
	display: grid;
	gap: 10px;
}

.card {
	padding: 10px 12px;
	border-radius: var(--MI-radius-sm);
	background: color-mix(in srgb, var(--MI_THEME-panel) 92%, var(--MI_THEME-bg));
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
}

.meta {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 6px;
}

.time {
	font-size: 0.75em;
	opacity: 0.7;
}

.cardText {
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-size: 0.9em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
}

.pinBtn {
	flex: 0 0 auto;
	padding: 4px 10px;
	font-size: 0.78em;
	font-weight: 700;
	line-height: 1.2;
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-accent) 35%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	cursor: pointer;

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-accent) 18%, transparent);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
}

.pinBtnActive {
	color: var(--MI_THEME-fg);
	border-color: color-mix(in srgb, var(--MI_THEME-divider) 80%, transparent);
	background: color-mix(in srgb, var(--MI_THEME-panel) 80%, transparent);
}
</style>
