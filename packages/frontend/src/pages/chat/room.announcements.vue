<!--
SPDX-FileCopyrightText: Universe Federation contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.root">
	<!-- 公告页签：仅历史记录；置顶由「管理」控制，普通用户不可关聊天页横幅 -->
	<div v-if="currentText" :class="$style.section">
		<div :class="$style.sectionHead">
			<div :class="$style.sectionTitle">
				<span>{{ i18n.ts._chat.announcementHistoryCurrent }}</span>
				<span v-if="room.announcementPinned" :class="$style.badge">{{ i18n.ts._chat.pinAnnouncement }}</span>
			</div>
			<button
				v-if="canManage"
				type="button"
				class="_button"
				:class="$style.deleteBtn"
				:disabled="busy"
				@click="deleteCurrent"
			>
				{{ i18n.ts.delete }}
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
						v-if="canManage"
						type="button"
						class="_button"
						:class="$style.deleteBtn"
						:disabled="busy"
						@click="deleteHistoryItem(item)"
					>
						{{ i18n.ts.delete }}
					</button>
				</div>
				<div :class="$style.cardText">{{ item.text }}</div>
			</div>
		</div>
	</div>

	<div v-if="!currentText && history.length === 0" :class="$style.empty">
		{{ i18n.ts._chat.announcementHistoryEmpty }}
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
	canManage?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
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

/** 管理员删除当前公告（归档进历史，聊天页横幅随之消失） */
async function deleteCurrent() {
	if (!props.canManage || busy.value) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: i18n.ts._chat.deleteCurrentAnnouncementConfirm,
	});
	if (canceled) return;

	busy.value = true;
	try {
		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			announcement: '',
			announcementPinned: false,
		});
		emit('updated', updated);
	} finally {
		busy.value = false;
	}
}

/** 管理员删除一条历史记录 */
async function deleteHistoryItem(item: HistoryItem) {
	if (!props.canManage || busy.value) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: i18n.ts._chat.deleteAnnouncementHistoryConfirm,
	});
	if (canceled) return;

	busy.value = true;
	try {
		const next = history.value.filter(h => h.id !== item.id);
		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			announcementHistory: next,
		});
		emit('updated', updated);
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

.deleteBtn {
	flex: 0 0 auto;
	padding: 4px 10px;
	font-size: 0.78em;
	font-weight: 700;
	line-height: 1.2;
	border-radius: 999px;
	color: var(--MI_THEME-error);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-error) 35%, var(--MI_THEME-divider));
	background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
	cursor: pointer;

	&:hover:not(:disabled) {
		background: color-mix(in srgb, var(--MI_THEME-error) 18%, transparent);
	}

	&:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
}

.empty {
	padding: 24px 12px;
	text-align: center;
	font-size: 0.9em;
	opacity: 0.7;
}
</style>
