<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" data-chat-search-scroller :class="$style.root" @scroll.passive="onResultsScroll">
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
			<MkButton primary rounded :wait="fetching" :disabled="searchQuery.trim().length < MIN_SEARCH_QUERY_LENGTH" @click="search">{{ i18n.ts.search }}</MkButton>
		</div>
		<div :class="$style.filters">
			<button class="_button" :class="$style.senderFilter" :disabled="fetching || moreFetching" @click="selectSender">
				<i class="ti ti-user-search"></i>
				<span :class="$style.filterLabel">{{ i18n.ts._chat.sender }}</span>
				<span v-if="selectedSender == null" :class="$style.filterValue">{{ i18n.ts._chat.allSenders }}</span>
				<span v-else :class="$style.selectedSender">
					<MkAvatar :user="selectedSender" :class="$style.senderAvatar"/>
					<span :class="$style.senderName"><MkUserName :user="selectedSender" :nowrap="true"/></span>
				</span>
				<i class="ti ti-chevron-down"></i>
			</button>
			<button v-if="selectedSender != null" class="_button" :class="$style.clearFilter" :disabled="fetching || moreFetching" @click="clearSender">
				<i class="ti ti-x"></i>
				<span>{{ i18n.ts.clear }}</span>
			</button>
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
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkInput from '@/components/MkInput.vue';
import { useRouter } from '@/router.js';
import { ensureSignin } from '@/i.js';
import type { MenuItem } from '@/types/menu.js';
import * as os from '@/os.js';
import { chatMessageContextPath, isSameChatMessageContext } from './chat-navigation.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
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
const rootEl = ref<HTMLElement | null>(null);
const senderOptions = ref<Misskey.entities.UserLite[]>([]);
const selectedSender = ref<Misskey.entities.UserLite | null>(null);
const SEARCH_LIMIT = 30;
const MIN_SEARCH_QUERY_LENGTH = 2;
const FETCH_MORE_SCROLL_THRESHOLD = 360;
let disposed = false;
let searchRequestId = 0;
let senderOptionsRequestId = 0;
let senderOptionsLoadedKey: string | null = null;
let senderOptionsLoadPromise: Promise<void> | null = null;
let fetchMoreCheckFrame: number | null = null;

const searchParams = computed(() => ({
	query: searchQuery.value.trim(),
	limit: SEARCH_LIMIT,
	roomId: props.roomId,
	userId: props.userId,
	fromUserId: selectedSender.value?.id,
}));

const senderOptionsKey = computed(() => [
	props.roomId ?? '',
	props.userId ?? '',
	props.room?.id ?? '',
	props.room?.owner.id ?? '',
	props.user?.id ?? '',
].join(':'));

watch(() => [props.room?.id ?? null, props.user?.id ?? null, props.roomId ?? null, props.userId ?? null], () => {
	senderOptionsLoadedKey = null;
	senderOptionsRequestId++;
	initKnownSenderOptions();
});

initKnownSenderOptions();

function addSenderOption(options: Misskey.entities.UserLite[], user: Misskey.entities.UserLite | Misskey.entities.UserDetailed | null | undefined) {
	if (user == null) return;
	if (options.some(item => item.id === user.id)) return;
	options.push(user);
}

function applySenderOptions(options: Misskey.entities.UserLite[], loadedKey: string | null) {
	senderOptions.value = options;
	senderOptionsLoadedKey = loadedKey;
	if (loadedKey != null && selectedSender.value != null && !options.some(user => user.id === selectedSender.value?.id)) {
		selectedSender.value = null;
	}
}

function buildKnownSenderOptions() {
	const options: Misskey.entities.UserLite[] = [];

	if (props.userId != null) {
		addSenderOption(options, $i);
		addSenderOption(options, props.user);
	} else if (props.roomId != null) {
		addSenderOption(options, props.room?.owner);
	}

	return options;
}

function initKnownSenderOptions() {
	applySenderOptions(buildKnownSenderOptions(), null);
}

async function initSenderOptions() {
	const requestId = ++senderOptionsRequestId;
	const key = senderOptionsKey.value;
	const options = buildKnownSenderOptions();

	if (props.roomId != null) {
		try {
			const memberships = await misskeyApi('chat/rooms/members', {
				roomId: props.roomId,
				limit: 100,
			});
			if (disposed || requestId !== senderOptionsRequestId || key !== senderOptionsKey.value) return;
			for (const membership of memberships) {
				addSenderOption(options, membership.user);
			}
		} catch {
			if (disposed || requestId !== senderOptionsRequestId || key !== senderOptionsKey.value) return;
		}
	}

	if (disposed || requestId !== senderOptionsRequestId || key !== senderOptionsKey.value) return;
	applySenderOptions(options, key);
}

async function ensureSenderOptionsLoaded() {
	if (senderOptionsLoadedKey === senderOptionsKey.value) return;
	if (senderOptionsLoadPromise != null) {
		await senderOptionsLoadPromise;
		return;
	}

	senderOptionsLoadPromise = initSenderOptions().finally(() => {
		senderOptionsLoadPromise = null;
	});
	await senderOptionsLoadPromise;
}

function clearSearchResults() {
	searchRequestId++;
	searchResults.value = [];
	canFetchMore.value = false;
	moreError.value = false;
	error.value = false;
}

function refetchAfterSenderChange() {
	clearSearchResults();
	if (searchQuery.value.trim().length > 0 && searched.value) {
		void search();
	} else {
		searched.value = false;
	}
}

function isNearResultsBottom() {
	const el = rootEl.value;
	if (el == null || el.clientHeight <= 0) return false;
	const distanceToBottom = el.scrollHeight - el.clientHeight - el.scrollTop;
	return distanceToBottom <= FETCH_MORE_SCROLL_THRESHOLD;
}

async function fetchMoreIfNeeded() {
	if (disposed || !canFetchMore.value || moreFetching.value || moreError.value || searchResults.value.length === 0) return;
	if (!isNearResultsBottom()) return;
	void fetchMore();
}

function queueFetchMoreIfNeeded() {
	if (fetchMoreCheckFrame != null) return;
	fetchMoreCheckFrame = requestAnimationFrame(() => {
		fetchMoreCheckFrame = null;
		void fetchMoreIfNeeded();
	});
}

function onResultsScroll() {
	queueFetchMoreIfNeeded();
}

function setSender(user: Misskey.entities.UserLite | Misskey.entities.UserDetailed) {
	if (fetching.value || moreFetching.value) return;
	if (selectedSender.value?.id === user.id) return;
	selectedSender.value = user;
	refetchAfterSenderChange();
}

function clearSender() {
	if (fetching.value || moreFetching.value) return;
	if (selectedSender.value == null) return;
	selectedSender.value = null;
	refetchAfterSenderChange();
}

async function selectSender(ev: MouseEvent) {
	if (fetching.value || moreFetching.value) return;
	await ensureSenderOptionsLoaded();

	const items: MenuItem[] = [{
		text: i18n.ts._chat.allSenders,
		icon: 'ti ti-users',
		active: selectedSender.value == null,
		action: clearSender,
	}];

	for (const user of senderOptions.value) {
		items.push({
			type: 'user',
			user,
			active: selectedSender.value?.id === user.id,
			action: () => setSender(user),
		});
	}

	items.push({
		type: 'divider',
	}, {
		text: i18n.ts.selectUser,
		icon: 'ti ti-user-plus',
		action: async () => {
			const user = await os.selectUser({ includeSelf: true, localOnly: true });
			setSender(user);
		},
	});

	await os.popupMenu(items, ev.currentTarget ?? ev.target, { width: 320 });
}

async function search() {
	const query = searchQuery.value.trim();
	if (query.length < MIN_SEARCH_QUERY_LENGTH || fetching.value) return;

	const requestId = ++searchRequestId;
	searched.value = true;
	fetching.value = true;
	error.value = false;
	moreError.value = false;
	canFetchMore.value = false;

	try {
		const res = await misskeyApi('chat/messages/search', {
			...searchParams.value,
		});

		if (disposed || requestId !== searchRequestId) return;
		searchResults.value = res;
		canFetchMore.value = res.length === SEARCH_LIMIT;
		queueFetchMoreIfNeeded();
	} catch {
		if (disposed || requestId !== searchRequestId) return;
		searchResults.value = [];
		error.value = true;
	} finally {
		if (!disposed && requestId === searchRequestId) {
			fetching.value = false;
		}
	}
}

async function fetchMore() {
	if (!canFetchMore.value || moreFetching.value || searchResults.value.length === 0) return;

	const requestId = searchRequestId;
	moreFetching.value = true;
	moreError.value = false;
	try {
		const res = await misskeyApi('chat/messages/search', {
			...searchParams.value,
			untilId: searchResults.value[searchResults.value.length - 1].id,
		});

		if (disposed || requestId !== searchRequestId) return;
		searchResults.value = [...searchResults.value, ...res];
		canFetchMore.value = res.length === SEARCH_LIMIT;
		queueFetchMoreIfNeeded();
	} catch {
		if (disposed || requestId !== searchRequestId) return;
		moreError.value = true;
	} finally {
		if (!disposed && requestId === searchRequestId) {
			moreFetching.value = false;
		}
	}
}

function openContext(message: Misskey.entities.ChatMessage) {
	if (isSameChatMessageContext(message, props)) {
		emit('openContext', message.id);
	} else {
		router.push(chatMessageContextPath(message, props.userId));
	}
}

onBeforeUnmount(() => {
	disposed = true;
	searchRequestId++;
	senderOptionsRequestId++;
	if (fetchMoreCheckFrame != null) {
		cancelAnimationFrame(fetchMoreCheckFrame);
		fetchMoreCheckFrame = null;
	}
});
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
	height: 100%;
	max-height: min(100%, var(--MI-visualViewportHeight, 100dvh));
	min-height: 0;
	flex: 1 1 auto;
	overflow-x: hidden;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	touch-action: pan-y;
	overscroll-behavior: contain;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);
	contain: layout style;
	scrollbar-gutter: stable;
	scroll-padding-bottom: max(72px, calc(env(safe-area-inset-bottom) + var(--MI-stickyBottom, 0px) + var(--MI-visualViewportBottom, 0px) + 32px));
}

.inner {
	width: 100%;
	max-width: min(700px, calc(100% - 24px));
	min-height: 100%;
	height: max-content;
	margin: 0 auto;
	padding: 16px 0 max(32px, calc(env(safe-area-inset-bottom) + var(--MI-stickyBottom, 0px) + var(--MI-visualViewportBottom, 0px) + 24px));
	box-sizing: border-box;
}

.searchBar {
	position: sticky;
	top: 0;
	z-index: 2;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 8px;
	align-items: end;
	padding-bottom: 12px;
	background: var(--MI_THEME-bg);
}

.filters {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	align-items: center;
	margin: -4px 0 12px;
}

.senderFilter,
.clearFilter {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	height: 36px;
	gap: 8px;
	padding: 0 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fg);

	&:hover,
	&:focus-visible {
		border-color: color(from var(--MI_THEME-accent) srgb r g b / 0.45);
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:disabled {
		opacity: 0.55;
		cursor: default;
	}
}

.senderFilter {
	max-width: 100%;
}

.clearFilter {
	color: var(--MI_THEME-fgTransparentWeak);
}

.filterLabel {
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.filterValue {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.selectedSender {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	gap: 6px;
}

.senderAvatar {
	width: 22px;
	height: 22px;
	flex: 0 0 auto;
}

.senderName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.results {
	min-height: 0;
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
		padding-top: 10px;
	}

	.searchBar {
		grid-template-columns: 1fr;
		gap: 6px;
	}

	.senderFilter {
		width: 100%;
		justify-content: flex-start;
	}

	.searchResultItem {
		padding: 10px;
		border-radius: 10px;
	}
}
</style>
