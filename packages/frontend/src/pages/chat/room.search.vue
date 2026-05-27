<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.inner">
		<div :class="$style.searchBar">
			<MkInput
				v-model="searchQuery"
				:placeholder="i18n.ts._chat.searchMessages"
				type="search"
				:disabled="fetching"
				@enter="search()"
			>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>
			<MkButton primary rounded :wait="fetching" :disabled="searchQuery.trim().length === 0" @click="search">{{ i18n.ts.search }}</MkButton>
		</div>

		<div v-if="searched" class="_gaps_s" :class="$style.results">
			<div :class="$style.resultHeader">{{ i18n.ts.searchResult }}</div>
			<MkLoading v-if="fetching"/>
			<MkError v-else-if="error" @retry="search"/>
			<template v-else-if="searchResults.length > 0">
				<div
					v-for="message in searchResults"
					:key="message.id"
					role="button"
					tabindex="0"
					:class="$style.searchResultItem"
					@click="openContext(message)"
					@keydown.enter.prevent="openContext(message)"
					@keydown.space.prevent="openContext(message)"
				>
				<XMessage :message="message" :user="message.fromUser" :isSearchResult="true"/>
				<button class="_button" :class="$style.openContext" @click.stop="openContext(message)">
					<i class="ti ti-messages"></i>
					<span>{{ i18n.ts.show }}</span>
				</button>
				</div>
				<div v-if="canFetchMore || moreFetching || moreError" v-appear="canFetchMore && !moreError ? fetchMore : null" :class="$style.more">
					<MkLoading v-if="moreFetching" :mini="true"/>
					<MkError v-else-if="moreError" @retry="fetchMore"/>
					<MkButton v-else rounded @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>
			</template>
			<MkResult v-else type="notFound"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import { useRouter } from '@/router.js';
import { chatMessageContextPath, isSameChatMessageContext } from './chat-navigation.js';

const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

const emit = defineEmits<{
	(ev: 'openContext', messageId: string): void;
}>();

const searchQuery = ref('');
const searched = ref(false);
const fetching = ref(false);
const error = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const moreFetching = ref(false);
const moreError = ref(false);
const canFetchMore = ref(false);
const SEARCH_LIMIT = 30;

async function search() {
	const query = searchQuery.value.trim();
	if (query.length === 0 || fetching.value) return;

	searched.value = true;
	fetching.value = true;
	error.value = false;
	moreError.value = false;
	canFetchMore.value = false;

	try {
		const res = await misskeyApi('chat/messages/search', {
			query,
			limit: SEARCH_LIMIT,
			roomId: props.roomId,
			userId: props.userId,
		});

		searchResults.value = res;
		canFetchMore.value = res.length === SEARCH_LIMIT;
	} catch (err) {
		console.error('Failed to search chat messages:', err);
		searchResults.value = [];
		error.value = true;
	} finally {
		fetching.value = false;
	}
}

async function fetchMore() {
	if (!canFetchMore.value || moreFetching.value || searchResults.value.length === 0) return;

	moreFetching.value = true;
	moreError.value = false;
	try {
		const res = await misskeyApi('chat/messages/search', {
			query: searchQuery.value.trim(),
			limit: SEARCH_LIMIT,
			untilId: searchResults.value[searchResults.value.length - 1].id,
			roomId: props.roomId,
			userId: props.userId,
		});

		searchResults.value = [...searchResults.value, ...res];
		canFetchMore.value = res.length === SEARCH_LIMIT;
	} catch (err) {
		console.error('Failed to fetch more chat search results:', err);
		moreError.value = true;
	} finally {
		moreFetching.value = false;
	}
}

function openContext(message: Misskey.entities.ChatMessage) {
	if (isSameChatMessageContext(message, props)) {
		emit('openContext', message.id);
	} else {
		router.push(chatMessageContextPath(message, props.userId));
	}
}
</script>

<style lang="scss" module>
.root {
	height: 100%;
	min-height: 0;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	touch-action: pan-y;
	overscroll-behavior: contain;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);
}

.inner {
	width: 100%;
	max-width: min(700px, calc(100% - 24px));
	min-height: 100%;
	margin: 0 auto;
	padding: 16px 0 max(24px, env(safe-area-inset-bottom));
	box-sizing: border-box;
}

.searchBar {
	position: sticky;
	top: 0;
	z-index: 1;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 8px;
	align-items: end;
	padding-bottom: 12px;
	background: var(--MI_THEME-bg);
}

.results {
	padding-bottom: 8px;
}

.resultHeader {
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}

.searchResultItem {
	cursor: pointer;
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
	background: var(--MI_THEME-panel);
	outline: none;

	&:hover,
	&:focus-visible {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:focus-visible {
		box-shadow: 0 0 0 3px var(--MI_THEME-focus);
	}
}

.openContext {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin-top: 8px;
	color: var(--MI_THEME-accent);
	font-size: 85%;
}

.more {
	min-height: 44px;
	display: grid;
	place-items: center;
}

@container (max-width: 520px) {
	.inner {
		max-width: calc(100% - 20px);
		padding-top: 12px;
	}

	.searchBar {
		grid-template-columns: 1fr;
	}
}
</style>
