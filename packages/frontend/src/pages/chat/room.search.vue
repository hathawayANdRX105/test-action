<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
		@enter="search()"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton primary rounded @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<div v-if="searchResults.length > 0" class="_gaps_s">
			<div v-for="message in searchResults" :key="message.id" :class="$style.searchResultItem">
				<XMessage :message="message" :user="message.fromUser" :isSearchResult="true"/>
			</div>
			<div v-if="canFetchMore || moreFetching" v-appear="canFetchMore ? fetchMore : null" :class="$style.more">
				<MkLoading v-if="moreFetching" :mini="true"/>
				<MkButton v-else rounded @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
			</div>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>
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
import MkFoldableSection from '@/components/MkFoldableSection.vue';

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

const searchQuery = ref('');
const searched = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const moreFetching = ref(false);
const canFetchMore = ref(false);
const SEARCH_LIMIT = 30;

async function search() {
	const res = await misskeyApi('chat/messages/search', {
		query: searchQuery.value,
		limit: SEARCH_LIMIT,
		roomId: props.roomId,
		userId: props.userId,
	});

	searchResults.value = res;
	canFetchMore.value = res.length === SEARCH_LIMIT;
	searched.value = true;
}

async function fetchMore() {
	if (!canFetchMore.value || moreFetching.value || searchResults.value.length === 0) return;

	moreFetching.value = true;
	try {
		const res = await misskeyApi('chat/messages/search', {
			query: searchQuery.value,
			limit: SEARCH_LIMIT,
			untilId: searchResults.value[searchResults.value.length - 1].id,
			roomId: props.roomId,
			userId: props.userId,
		});

		searchResults.value = [...searchResults.value, ...res];
		canFetchMore.value = res.length === SEARCH_LIMIT;
	} finally {
		moreFetching.value = false;
	}
}
</script>

<style lang="scss" module>
.searchResultItem {
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
}

.more {
	min-height: 44px;
	display: grid;
	place-items: center;
}
</style>
