<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header>
		<MkTab v-model="tab" :class="$style.tab">
			<option value="recommended">{{ i18n.ts.profileRecommended }}</option>
			<option value="notes">{{ i18n.ts.notes }}</option>
			<option value="all">{{ i18n.ts.all }}</option>
			<option value="channels">{{ i18n.ts.channels }}</option>
			<option value="media">{{ i18n.ts.media }}</option>
		</MkTab>
	</template>
	<div v-if="tab === 'recommended'" class="_gaps">
		<div v-if="user.pinnedNotes.length < 1" class="_fullinfo">
			<MkResult type="empty" :text="i18n.ts.noProfileRecommendedNotes"/>
		</div>
		<div v-else class="_panel">
			<DynamicNote v-for="note of user.pinnedNotes" :key="note.id" class="note" :class="$style.pinnedNote" :note="note" :pinned="true"/>
		</div>
	</div>
	<div v-else-if="tab === 'channels'" :class="$style.channelSurface">
		<div :class="$style.channelFilters">
			<MkLoading v-if="userNoteChannelsFetching" mode="compact"/>
			<template v-else-if="userNoteChannels.length > 0">
				<div :class="$style.channelCategoryRow">
					<button
						class="_button"
						:class="[$style.channelChip, { [$style.activeChannelChip]: selectedChannelCategory === null }]"
						@click="selectedChannelCategory = null"
					>
						{{ i18n.ts.all }}
					</button>
					<button
						v-for="category in channelCategories"
						:key="category"
						class="_button"
						:class="[$style.channelChip, { [$style.activeChannelChip]: selectedChannelCategory === category }]"
						@click="selectChannelCategory(category)"
					>
						{{ category === UNCATEGORIZED_CATEGORY ? i18n.ts.uncategorized : category }}
					</button>
				</div>
				<div :class="$style.channelChipRow">
					<button
						class="_button"
						:class="[$style.channelChip, { [$style.activeChannelChip]: selectedChannelId === null }]"
						@click="selectedChannelId = null"
					>
						<i class="ti ti-layout-grid"></i>
						<span>{{ i18n.ts.allChannels }}</span>
					</button>
					<button
						v-for="row in filteredUserNoteChannels"
						:key="row.channel.id"
						class="_button"
						:class="[$style.channelChip, { [$style.activeChannelChip]: selectedChannelId === row.channel.id }]"
						@click="selectedChannelId = row.channel.id"
					>
						<i class="ti ti-device-tv"></i>
						<span>{{ row.channel.name }}</span>
						<b>{{ row.notesCount }}</b>
					</button>
				</div>
			</template>
			<MkResult v-else type="empty" :text="i18n.ts.noNotes"/>
		</div>
		<MkNotes v-if="userNoteChannels.length > 0" :key="`channels-${selectedChannelId ?? 'all'}`" :noGap="true" :pagination="channelNotesPagination" :class="$style.tl"/>
	</div>
	<MkPagination v-else-if="tab === 'media'" v-slot="{items}" :pagination="mediaPagination">
		<div :class="$style.mediaStream">
			<MkNoteMediaGrid v-for="note in items" :key="note.id" :note="note" square/>
		</div>
	</MkPagination>
	<MkNotes v-else-if="tab === 'all'" :noGap="true" :pagination="allNotesPagination" :class="$style.tl"/>
	<MkNotes v-else :noGap="true" :pagination="profileNotesPagination" :class="$style.tl"/>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkNotes from '@/components/MkNotes.vue';
import MkTab from '@/components/MkTab.vue';
import { i18n } from '@/i18n.js';
import DynamicNote from '@/components/DynamicNote.vue';
import MkNoteMediaGrid from '@/components/MkNoteMediaGrid.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	user: Misskey.entities.UserDetailed;
}>();

const tab = ref<'recommended' | 'notes' | 'all' | 'channels' | 'media'>('all');
const userNoteChannels = ref<Misskey.entities.UsersNoteChannelsResponse>([]);
const userNoteChannelsFetching = ref(false);
const UNCATEGORIZED_CATEGORY = '__uncategorized__';
const selectedChannelCategory = ref<string | null>(null);
const selectedChannelId = ref<string | null>(null);

const profileNotesPagination = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.user.id,
		withRenotes: false,
		withReplies: false,
		withChannelNotes: false,
	})),
};

const allNotesPagination = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.user.id,
		withRenotes: true,
		withReplies: true,
		withChannelNotes: true,
	})),
};

const channelNotesPagination = {
	endpoint: 'users/notes' as const,
	limit: 10,
	params: computed(() => ({
		userId: props.user.id,
		withRenotes: true,
		withReplies: true,
		withChannelNotes: true,
		channelId: selectedChannelId.value ?? undefined,
	})),
};

const mediaPagination = {
	endpoint: 'users/notes' as const,
	limit: 15,
	params: computed(() => ({
		userId: props.user.id,
		withRenotes: true,
		withReplies: false,
		withChannelNotes: true,
		withFiles: true,
	})),
};

const channelCategories = computed(() => {
	const categories = new Set<string>();
	for (const row of userNoteChannels.value) {
		categories.add(row.category ?? UNCATEGORIZED_CATEGORY);
	}
	return [...categories];
});

const filteredUserNoteChannels = computed(() => {
	if (selectedChannelCategory.value == null) return userNoteChannels.value;
	return userNoteChannels.value.filter(row => (row.category ?? UNCATEGORIZED_CATEGORY) === selectedChannelCategory.value);
});

function selectChannelCategory(category: string) {
	selectedChannelCategory.value = category;
	if (selectedChannelId.value != null && !filteredUserNoteChannels.value.some(row => row.channel.id === selectedChannelId.value)) {
		selectedChannelId.value = null;
	}
}

async function loadUserNoteChannels() {
	if (userNoteChannelsFetching.value) return;
	userNoteChannelsFetching.value = true;
	try {
		userNoteChannels.value = await misskeyApi('users/note-channels', {
			userId: props.user.id,
		});
		if (selectedChannelId.value != null && !userNoteChannels.value.some(row => row.channel.id === selectedChannelId.value)) {
			selectedChannelId.value = null;
		}
	} finally {
		userNoteChannelsFetching.value = false;
	}
}

watch(tab, (value) => {
	if (value === 'channels' && userNoteChannels.value.length === 0) {
		loadUserNoteChannels();
	}
}, { immediate: true });

watch(() => props.user.id, () => {
	userNoteChannels.value = [];
	selectedChannelCategory.value = null;
	selectedChannelId.value = null;
	if (tab.value === 'channels') {
		loadUserNoteChannels();
	}
});
</script>

<style lang="scss" module>
.tab {
	padding: calc(var(--MI-margin) / 2) 0;
	background: var(--MI_THEME-bg);
}

.tl {
	background: var(--MI_THEME-bg);
	border-radius: var(--MI-radius);
	overflow: clip;
}

.channelSurface {
	display: flex;
	flex-direction: column;
	gap: var(--MI-marginHalf);
}

.channelFilters {
	padding: 10px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.channelCategoryRow,
.channelChipRow {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.channelChipRow {
	margin-top: 8px;
}

.channelChip {
	display: inline-flex;
	align-items: center;
	max-width: 100%;
	min-height: 34px;
	gap: 6px;
	padding: 7px 10px;
	color: var(--MI_THEME-fg);
	background: color-mix(in srgb, var(--MI_THEME-buttonBg), transparent 20%);
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);

	> span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	> b {
		min-width: 1.5em;
		padding: 1px 6px;
		border-radius: var(--MI-radius-ellipse);
		background: color-mix(in srgb, var(--MI_THEME-fg), transparent 88%);
		font-size: 0.78em;
		font-weight: 700;
		text-align: center;
	}
}

.activeChannelChip {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent), transparent 88%);
	border-color: color-mix(in srgb, var(--MI_THEME-accent), transparent 35%);
}

.mediaStream {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(128px, 1fr));
	gap: var(--MI-marginHalf);
	padding: 8px;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}
</style>
