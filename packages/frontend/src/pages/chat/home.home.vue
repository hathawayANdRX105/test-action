<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkButton v-if="$i.policies.chatAvailability === 'available'" primary gradate rounded :class="$style.start" @click="start"><i class="ti ti-plus"></i> {{ i18n.ts.startChat }}</MkButton>

	<MkInfo v-else>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>

	<MkAd :preferForms="['horizontal', 'horizontal-big']"/>

	<MkInput
		v-model="searchQuery"
		:placeholder="i18n.ts._chat.searchMessages"
		type="search"
		:disabled="searchFetching"
		@enter="search"
	>
		<template #prefix><i class="ti ti-search"></i></template>
	</MkInput>

	<MkButton v-if="searchQuery.length > 0" primary rounded :wait="searchFetching" :disabled="searchQuery.trim().length < MIN_SEARCH_QUERY_LENGTH" @click="search">{{ i18n.ts.search }}</MkButton>

	<MkFoldableSection v-if="searched">
		<template #header>{{ i18n.ts.searchResult }}</template>

		<MkLoading v-if="searchFetching"/>
		<MkError v-else-if="searchError" @retry="search"/>
		<div v-else-if="searchResults.length > 0" class="_gaps_s">
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
				<XMessage :message="message" :isSearchResult="true"/>
				<button class="_button" :class="$style.openContext" @click.stop="openContext(message)">
					<i class="ti ti-messages"></i>
					<span>{{ i18n.ts.show }}</span>
				</button>
			</div>
		</div>
		<MkResult v-else type="notFound"/>
	</MkFoldableSection>

	<MkFoldableSection>
		<template #header>{{ i18n.ts._chat.history }}</template>

		<MkChatHistories/>
	</MkFoldableSection>
</div>
</template>

<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import { updateCurrentAccountPartial } from '@/accounts.js';
import MkInput from '@/components/MkInput.vue';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkChatHistories from '@/components/MkChatHistories.vue';
import { chatMessageContextPath } from './chat-navigation.js';

const $i = ensureSignin();

const router = useRouter();

const searchQuery = ref('');
const searched = ref(false);
const searchFetching = ref(false);
const searchError = ref(false);
const searchResults = ref<Misskey.entities.ChatMessage[]>([]);
const MIN_SEARCH_QUERY_LENGTH = 2;
let disposed = false;
let searchRequestId = 0;

function start(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}], ev.currentTarget ?? ev.target);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push(`/chat/user/${user.id}`);
	});
}

async function createRoom() {
	const { canceled, result } = await os.form(i18n.ts._chat.createRoom, {
		name: {
			type: 'string',
			label: i18n.ts.name,
		},
		description: {
			type: 'string',
			label: i18n.ts.description,
			required: false,
			multiline: true,
		},
		joinMode: {
			type: 'radio',
			label: i18n.ts._chat.roomJoinMode,
			default: 'inviteOnly',
			options: [{
				label: i18n.ts._chat.inviteOnlyRoom,
				value: 'inviteOnly',
			}, {
				label: i18n.ts._chat.openRoom,
				value: 'open',
			}, {
				label: i18n.ts._chat.closedRoom,
				value: 'closed',
			}],
		},
	});
	if (canceled) return;
	if (result.name.trim() === '') return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result.name.trim(),
		description: result.description?.trim() ?? '',
		joinMode: result.joinMode as 'inviteOnly' | 'open' | 'closed',
	});

	router.push(`/chat/room/${room.id}`);
}

async function search() {
	const query = searchQuery.value.trim();
	if (query.length < MIN_SEARCH_QUERY_LENGTH || searchFetching.value) return;

	const requestId = ++searchRequestId;
	searched.value = true;
	searchFetching.value = true;
	searchError.value = false;

	try {
		const res = await misskeyApi('chat/messages/search', {
			query,
		});

		if (disposed || requestId !== searchRequestId) return;
		searchResults.value = res;
	} catch (err) {
		if (disposed || requestId !== searchRequestId) return;
		console.error('Failed to search chat messages:', err);
		searchResults.value = [];
		searchError.value = true;
	} finally {
		if (!disposed && requestId === searchRequestId) {
			searchFetching.value = false;
		}
	}
}

function openContext(message: Misskey.entities.ChatMessage) {
	router.push(chatMessageContextPath(message));
}

onMounted(() => {
	updateCurrentAccountPartial({ hasUnreadChatMessages: false });
});

onBeforeUnmount(() => {
	disposed = true;
	searchRequestId++;
});
</script>

<style lang="scss" module>
.start {
	margin: 0 auto;
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
</style>
