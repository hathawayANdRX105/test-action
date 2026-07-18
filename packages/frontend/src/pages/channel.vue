<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader ref="pageComponent" :actions="headerActions" :tabs="[]" :swipable="false" :hideTitle="true" :scrollKey="channelScrollKey">
	<div v-if="channel" class="xChannelWideShell" :class="$style.shell">
		<main :class="$style.main" @wheel.passive="onMainWheel">
			<section class="_panel" :class="$style.hero" :style="heroStyle">
				<div :class="$style.heroShade"></div>
				<div :class="$style.heroActions">
					<XChannelFollowButton :channel="channel" :full="true" :class="$style.followButton"/>
					<MkButton v-if="favorited" v-tooltip="i18n.ts.unfavorite" asLike rounded primary :class="$style.heroIconButton" @click="unfavorite()"><i class="ti ti-star"></i></MkButton>
					<MkButton v-else v-tooltip="i18n.ts.favorite" asLike rounded :class="$style.heroIconButton" @click="favorite()"><i class="ti ti-star"></i></MkButton>
				</div>
				<div :class="$style.heroContent">
					<div :class="$style.heroKicker"><i class="ti ti-device-tv"></i><span>{{ i18n.ts.channel }}</span></div>
					<h1 :class="$style.heroTitle">{{ channel.name }}</h1>
					<div :class="$style.heroMeta">
						<span><i class="ti ti-users"></i><I18n :src="i18n.ts._channel.usersCount" tag="span"><template #n><b>{{ channel.usersCount }}</b></template></I18n></span>
						<span><i class="ti ti-pencil"></i><I18n :src="i18n.ts._channel.notesCount" tag="span"><template #n><b>{{ channel.notesCount }}</b></template></I18n></span>
						<span v-if="channel.isSensitive" :class="$style.sensitiveBadge">{{ i18n.ts.sensitive }}</span>
					</div>
					<div v-if="channel.description" :class="$style.heroDescription">
						<Mfm :text="channel.description" :isBlock="true" :isNote="false"/>
					</div>
				</div>
			</section>

			<MkInfo v-if="channel.isArchived" warn>{{ i18n.ts.thisChannelArchived }}</MkInfo>

			<header :class="$style.tabs" role="tablist" :aria-label="channel.name">
				<button
					v-for="item in channelTabs"
					:key="item.key"
					class="_button"
					:class="[$style.tab, { [$style.tabActive]: tab === item.key }]"
					role="tab"
					:aria-selected="tab === item.key"
					@click="selectTab(item.key)"
				>
					<i :class="item.icon"></i>
					<span :class="$style.tabLabel">{{ item.title }}</span>
				</button>
			</header>

			<section v-if="tab === 'overview'" :class="$style.contentStack">
				<section v-if="channel.pinnedNotes && channel.pinnedNotes.length > 0" :class="$style.section">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ i18n.ts.channel }}</div>
							<h2><i class="ti ti-pin"></i>{{ i18n.ts.pinnedNotes }}</h2>
						</div>
					</div>
					<div class="_gaps_s">
						<MkNote v-for="note in channel.pinnedNotes" :key="note.id" class="_panel" :note="note"/>
					</div>
				</section>

				<section :class="$style.section">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ i18n.ts.timeline }}</div>
							<h2><i class="ti ti-clock"></i>{{ i18n.ts.channelRecentNotes }}</h2>
						</div>
						<button class="_button" :class="$style.sectionAction" @click="selectTab('timeline')">{{ i18n.ts.timeline }}</button>
					</div>
					<MkNotes class="xFeed" :pagination="recentPagination" :disableAutoLoad="true"/>
				</section>

				<section :class="$style.section">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ i18n.ts.hotDiscussions }}</div>
							<h2><i class="ti ti-bolt"></i>{{ i18n.ts.channelHotNotes }}</h2>
						</div>
						<button class="_button" :class="$style.sectionAction" @click="selectTab('featured')">{{ i18n.ts.featured }}</button>
					</div>
					<div v-if="previewLoading && channelHotNotes.length === 0" :class="$style.listLoading">
						<MkLoading mode="compact"/>
					</div>
					<div v-else-if="channelHotNotes.length > 0" class="xFeed" :class="$style.previewNotes">
						<MkNote v-for="note in channelHotNotes" :key="`overview-hot:${note.id}`" :note="note"/>
					</div>
					<div v-else :class="$style.searchEmpty">
						<i class="ti ti-bolt"></i>
						<strong>{{ i18n.ts.noNotes }}</strong>
					</div>
				</section>
			</section>

			<section v-else-if="tab === 'timeline'" :class="$style.contentStack">
				<MkPostForm v-if="$i && prefer.r.showFixedPostFormInChannel.value" :channel="channel" :class="$style.composer" fixed homeStyle :autofocus="deviceKind === 'desktop'"/>
				<MkTimeline
					:key="timelineKey"
					class="xFeed"
					:class="$style.timeline"
					src="channel"
					:channel="channelId"
					:withRenotes="withRenotes"
					:onlyFiles="onlyFiles"
					@note="miLocalStorage.setItemAsJson(`channelLastReadedAt:${channel.id}`, Date.now())"
				/>
			</section>

			<section v-else-if="tab === 'featured'" :class="$style.contentStack">
				<section :class="$style.section">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ channel.name }}</div>
							<h2><i class="ti ti-bolt"></i>{{ i18n.ts.channelHotNotes }}</h2>
						</div>
					</div>
					<div v-if="previewLoading && channelHotNotes.length === 0" :class="$style.listLoading">
						<MkLoading mode="compact"/>
					</div>
					<div v-else-if="channelHotNotes.length > 0" class="xFeed" :class="$style.previewNotes">
						<MkNote v-for="note in channelHotNotes" :key="`featured:${note.id}`" :note="note"/>
					</div>
					<div v-else :class="$style.searchEmpty">
						<i class="ti ti-bolt"></i>
						<strong>{{ i18n.ts.noNotes }}</strong>
					</div>
				</section>
			</section>

			<section v-else-if="tab === 'search'" :class="$style.contentStack">
				<section :class="$style.section">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ channel.name }}</div>
							<h2><i class="ti ti-search"></i>{{ i18n.ts.channelSearch }}</h2>
						</div>
					</div>
					<form :class="$style.searchPanel" @submit.prevent="submitChannelSearch">
						<MkInput ref="searchInputEl" v-model="searchQuery" type="search" :placeholder="i18n.ts.channelSearchPlaceholder">
							<template #prefix><i class="ti ti-search"></i></template>
						</MkInput>
						<MkButton primary rounded type="submit" :disabled="!canSearchQuery">{{ i18n.ts.search }}</MkButton>
					</form>

					<div v-if="searchHistory.length > 0 || channelTrendRows.length > 0" :class="$style.shortcutPanel">
						<div v-if="searchHistory.length > 0" :class="$style.shortcutGroup">
							<div :class="$style.shortcutTitle">{{ i18n.ts.channelSearchHistory }}</div>
							<div :class="$style.chipGrid">
								<button v-for="term in searchHistory" :key="`history:${term}`" class="_button" :class="$style.historyChip" @click="openSearchTerm(term)">
									<i class="ti ti-history"></i>
									<span>{{ term }}</span>
									<span
										class="_button"
										:class="$style.removeChip"
										role="button"
										tabindex="0"
										:aria-label="i18n.ts.delete"
										@click.stop="removeSearchHistory(term)"
										@keydown.enter.stop.prevent="removeSearchHistory(term)"
										@keydown.space.stop.prevent="removeSearchHistory(term)"
									>
										<i class="ti ti-x"></i>
									</span>
								</button>
							</div>
						</div>

						<div v-if="channelTrendRows.length > 0" :class="$style.shortcutGroup">
							<div :class="$style.shortcutTitle">{{ i18n.ts.channelTrendingTerms }}</div>
							<div :class="$style.chipGrid">
								<button v-for="trend in channelTrendRows" :key="`term:${trend.type}:${trend.term}`" class="_button" :class="$style.termChip" @click="openSearchTerm(trend.type === 'tag' ? `#${trend.term}` : trend.term)">
									<i :class="trend.type === 'tag' ? 'ti ti-hash' : 'ti ti-search'"></i>
									<span>{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
									<span
										v-if="canModerateChannelTrends"
										class="_button"
										:class="$style.removeChip"
										role="button"
										tabindex="0"
										:aria-label="i18n.ts.hide"
										@click.stop="hideChannelTrend(trend.term)"
										@keydown.enter.stop.prevent="hideChannelTrend(trend.term)"
										@keydown.space.stop.prevent="hideChannelTrend(trend.term)"
									>
										<i class="ti ti-x"></i>
									</span>
								</button>
							</div>
						</div>
					</div>

					<div v-if="searchFetching" :class="$style.searchStatus">
						<MkLoading mode="compact"/>
						<span>{{ i18n.ts.searching }}</span>
					</div>
					<div v-else-if="searchError" :class="[$style.searchStatus, $style.searchError]">
						<i class="ti ti-alert-triangle"></i>
						<span>{{ i18n.ts.channelSearchError }}</span>
						<MkButton small rounded @click="retrySearch">{{ i18n.ts.retry }}</MkButton>
					</div>
					<div v-else-if="submittedSearchQuery && searchResults.length === 0" :class="$style.searchEmpty">
						<i class="ti ti-mood-empty"></i>
						<strong>{{ i18n.tsx.channelSearchNoResults({ query: submittedSearchQuery }) }}</strong>
						<span>{{ i18n.ts.channelSearchNoResultsDescription }}</span>
					</div>
					<div v-else-if="searchResults.length > 0" class="xFeed" :class="$style.searchResults">
						<MkNote v-for="note in searchResults" :key="note.id" :note="note"/>
					</div>
					<div v-else :class="$style.searchEmpty">
						<i class="ti ti-search"></i>
						<strong>{{ i18n.ts.channelSearch }}</strong>
						<span>{{ i18n.ts.channelSearchPlaceholder }}</span>
					</div>
				</section>
			</section>
		</main>

		<aside ref="rightRailEl" :class="$style.rightRail" @wheel="onRightRailWheel">
			<form :class="$style.searchBox" @submit.prevent="submitSideSearch">
				<MkInput v-model="searchQuery" type="search" :placeholder="i18n.ts.channelSearchPlaceholder">
					<template #prefix><i class="ti ti-search"></i></template>
				</MkInput>
			</form>

			<section v-if="searchHistory.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.channelSearchHistory }}</div>
				<div :class="$style.sideList">
					<button v-for="term in searchHistory.slice(0, 6)" :key="`side-history:${term}`" class="_button" :class="$style.trendRow" @click="openSearchTerm(term)">
						<span :class="$style.trendBody">
							<span :class="$style.trendMeta">{{ i18n.ts.search }}</span>
							<span :class="$style.trendTitle">{{ term }}</span>
						</span>
						<i class="ti ti-history"></i>
					</button>
				</div>
			</section>

			<section v-if="channelTrendRows.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.channelTrendingTerms }}</div>
				<div :class="$style.sideList">
					<button v-for="trend in channelTrendRows" :key="`side-term:${trend.type}:${trend.term}`" class="_button" :class="[$style.trendRow, { [$style.trendRowWithAction]: canModerateChannelTrends }]" @click="openSearchTerm(trend.type === 'tag' ? `#${trend.term}` : trend.term)">
						<span :class="$style.trendBody">
							<span :class="$style.trendMeta">{{ trend.label }}</span>
							<span :class="$style.trendTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
						</span>
						<button
							v-if="canModerateChannelTrends"
							class="_button"
							:class="$style.trendHideButton"
							type="button"
							:aria-label="i18n.ts.hide"
							@click.stop="hideChannelTrend(trend.term)"
						>
							<i class="ti ti-x"></i>
						</button>
						<i v-else :class="trend.type === 'tag' ? 'ti ti-hash' : 'ti ti-search'"></i>
					</button>
				</div>
			</section>

			<section :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.overview }}</div>
				<div :class="$style.statGrid">
					<div :class="$style.statItem">
						<span>{{ i18n.ts.notes }}</span>
						<strong>{{ channel.notesCount }}</strong>
					</div>
					<div :class="$style.statItem">
						<span>{{ i18n.ts.users }}</span>
						<strong>{{ channel.usersCount }}</strong>
					</div>
				</div>
			</section>

			<section v-if="sideHotNotes.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.channelHotNotes }}</div>
				<div :class="$style.sideList">
					<MkA v-for="note in sideHotNotes" :key="note.id" :to="`/notes/${note.id}`" :class="$style.noteTeaser">
						<span :class="$style.noteTeaserText">{{ summarizeNote(note) }}</span>
						<span :class="$style.noteTeaserMeta">{{ i18n.tsx.noteStats({ replies: note.repliesCount, renotes: note.renoteCount }) }}</span>
					</MkA>
				</div>
			</section>
		</aside>
	</div>
	<div v-else class="_spacer" style="--MI_SPACER-w: 700px;">
		<MkLoading mode="bar"/>
	</div>
	<template #footer>
		<div v-if="channel" :class="$style.footer">
			<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 16px;">
				<div class="_buttonsCenter">
					<MkButton inline rounded primary gradate @click="openPostForm()"><i class="ti ti-pencil"></i> {{ i18n.ts.postToTheChannel }}</MkButton>
				</div>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import MkPostForm from '@/components/MkPostForm.vue';
import MkTimeline from '@/components/MkTimeline.vue';
import XChannelFollowButton from '@/components/MkChannelFollowButton.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i, iAmAdmin, iAmModerator } from '@/i.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import MkNotes from '@/components/MkNotes.vue';
import { favoritedChannelsCache } from '@/cache.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { prefer } from '@/preferences.js';
import MkNote from '@/components/MkNote.vue';
import MkInfo from '@/components/MkInfo.vue';
import { isSupportShare } from '@/utility/navigator.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { miLocalStorage } from '@/local-storage.js';
import { useRouter } from '@/router.js';
import { deepMerge } from '@/utility/merge.js';
import { store } from '@/store.js';
import { buildSearchTrendRows, isGoodSearchTrendTerm, normalizeSearchTrendKey } from '@/utility/search-trends.js';

provide('shouldOmitHeaderTitle', true);

type ChannelTab = 'overview' | 'timeline' | 'featured' | 'search';
type ChannelTrends = Misskey.Endpoints['notes/discovery-sections']['res']['trends'];

const router = useRouter();
const pageComponent = useTemplateRef('pageComponent');
const rightRailEl = useTemplateRef('rightRailEl');
const searchInputEl = useTemplateRef('searchInputEl');
let rightRailResizeObserver: ResizeObserver | undefined;
let rightRailOffset = 0;
let rightRailMaxOffset = 0;
let rightRailOffsetInitialized = false;

const props = defineProps<{
	channelId: string;
}>();

const tab = ref<ChannelTab>('overview');
const channel = ref<Misskey.entities.Channel | null>(null);
const favorited = ref(false);
const searchQuery = ref('');
const searchHistory = ref<string[]>([]);
const searchResults = shallowRef<Misskey.entities.Note[]>([]);
const searchFetching = ref(false);
const searchError = ref(false);
const submittedSearchQuery = ref('');
let searchGeneration = 0;
const previewRecentNotes = shallowRef<Misskey.entities.Note[]>([]);
const previewHotNotes = shallowRef<Misskey.entities.Note[]>([]);
const previewLoading = ref(false);

const channelTabs = computed(() => [{
	key: 'overview' as const,
	title: i18n.ts.overview,
	icon: 'ti ti-info-circle',
}, {
	key: 'timeline' as const,
	title: i18n.ts.timeline,
	icon: 'ti ti-home',
}, {
	key: 'featured' as const,
	title: i18n.ts.featured,
	icon: 'ti ti-bolt',
}, {
	key: 'search' as const,
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const heroStyle = computed(() => ({
	backgroundImage: `url(${channel.value?.bannerUrl ?? '/client-assets/universe-federation-bg.webp?v=uf3'})`,
}));

const recentPagination = computed(() => ({
	endpoint: 'channels/timeline' as const,
	limit: 8,
	params: {
		channelId: props.channelId,
		withRenotes: withRenotes.value,
		withFiles: onlyFiles.value ? true : undefined,
		withBots: true,
	},
}));

const featuredPagination = computed(() => ({
	endpoint: 'notes/featured' as const,
	limit: 8,
	params: {
		channelId: props.channelId,
	},
}));

const timelineKey = computed(() => `${props.channelId}:${withRenotes.value}:${onlyFiles.value}`);
const channelScrollKey = computed(() => `channel:${props.channelId}:${tab.value}:${timelineKey.value}`);
const canSearchQuery = computed(() => searchQuery.value.trim().length > 0);
const channelTrendRows = computed(() => buildSearchTrendRows(collectChannelTrends(), 10));
const channelHotNotes = computed(() => getChannelHotNotes(previewHotNotes.value, previewRecentNotes.value, 10));
const sideHotNotes = computed(() => channelHotNotes.value.slice(0, 4));
const canModerateChannelTrends = computed(() => iAmAdmin || (($i != null && channel.value?.userId === $i.id) || iAmModerator));

const withRenotes = computed<boolean>({
	get: () => store.r.tl.value.filter.withRenotes,
	set: (x) => saveTlFilter('withRenotes', x),
});

const onlyFiles = computed<boolean>({
	get: () => store.r.tl.value.filter.onlyFiles,
	set: (x) => saveTlFilter('onlyFiles', x),
});

watch(() => props.channelId, async () => {
	channel.value = null;
	searchQuery.value = '';
	searchHistory.value = readSearchHistory(props.channelId);
	searchResults.value = [];
	searchFetching.value = false;
	searchError.value = false;
	submittedSearchQuery.value = '';
	searchGeneration++;
	previewRecentNotes.value = [];
	previewHotNotes.value = [];
	previewLoading.value = true;

	channel.value = await misskeyApi('channels/show', {
		channelId: props.channelId,
	});
	favorited.value = channel.value.isFavorited ?? false;
	if (favorited.value || channel.value.isFollowing) {
		tab.value = 'timeline';
	} else {
		tab.value = 'overview';
	}

	if ((favorited.value || channel.value.isFollowing) && channel.value.lastNotedAt) {
		const lastReadedAt: number = miLocalStorage.getItemAsJson(`channelLastReadedAt:${channel.value.id}`) ?? 0;
		const lastNotedAt = Date.parse(channel.value.lastNotedAt);

		if (lastNotedAt > lastReadedAt) {
			miLocalStorage.setItemAsJson(`channelLastReadedAt:${channel.value.id}`, lastNotedAt);
		}
	}

	await loadChannelPreviewData(props.channelId);
	await nextTick();
	syncRightRailStickyBounds();
}, { immediate: true });

onMounted(() => {
	nextTick(() => {
		installRightRailStickyObserver();
		syncRightRailStickyBounds();
	});
	window.addEventListener('resize', syncRightRailStickyBounds);
	window.visualViewport?.addEventListener('resize', syncRightRailStickyBounds);
});

onActivated(() => {
	nextTick(syncRightRailStickyBounds);
});

onUnmounted(() => {
	rightRailResizeObserver?.disconnect();
	window.removeEventListener('resize', syncRightRailStickyBounds);
	window.visualViewport?.removeEventListener('resize', syncRightRailStickyBounds);
});

function saveTlFilter(key: keyof typeof store.s.tl.filter, newValue: boolean) {
	if (key !== 'withReplies' || $i) {
		store.r.tl.value = deepMerge({ filter: { [key]: newValue } }, store.s.tl);
	}
}

function selectTab(nextTab: ChannelTab): void {
	tab.value = nextTab;
	if (nextTab === 'search') nextTick(() => searchInputEl.value?.focus());
}

function edit() {
	router.push(`/channels/${channel.value?.id}/edit`);
}

function openPostForm() {
	os.post({
		channel: channel.value,
	});
}

function favorite() {
	if (!channel.value) return;

	os.apiWithDialog('channels/favorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = true;
		favoritedChannelsCache.delete();
	});
}

async function unfavorite() {
	if (!channel.value) return;

	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.ts.unfavoriteConfirm,
	});
	if (confirm.canceled) return;
	os.apiWithDialog('channels/unfavorite', {
		channelId: channel.value.id,
	}).then(() => {
		favorited.value = false;
		favoritedChannelsCache.delete();
	});
}

function submitChannelSearch(): void {
	openSearchTerm(searchQuery.value);
}

function submitSideSearch(): void {
	openSearchTerm(searchQuery.value);
}

function openSearchTerm(term: string): void {
	if (!channel.value) return;
	const query = term.trim();
	if (query.length === 0) return;

	searchQuery.value = query;
	tab.value = 'search';
	saveSearchHistory(query);
	runChannelSearch(query);
	nextTick(() => {
		pageComponent.value?.scrollToTop();
		syncRightRailStickyBounds();
	});
}

async function runChannelSearch(query: string): Promise<void> {
	if (!channel.value) return;
	const channelId = channel.value.id;
	const generation = ++searchGeneration;
	submittedSearchQuery.value = query;
	searchFetching.value = true;
	searchError.value = false;
	searchResults.value = [];

	try {
		const results = await misskeyApi<Misskey.entities.Note[]>('notes/search', {
			query,
			channelId,
			limit: 10,
			order: 'desc',
		});
		if (generation !== searchGeneration || channel.value?.id !== channelId) return;
		searchResults.value = results;
	} catch (err) {
		if (generation !== searchGeneration) return;
		console.error('Failed to search channel notes', err);
		searchResults.value = searchLocalChannelNotes(query, previewRecentNotes.value);
		searchError.value = searchResults.value.length === 0;
	} finally {
		if (generation === searchGeneration) {
			searchFetching.value = false;
			nextTick(syncRightRailStickyBounds);
		}
	}
}

function retrySearch(): void {
	const query = submittedSearchQuery.value.trim() || searchQuery.value.trim();
	if (query.length === 0) return;
	runChannelSearch(query);
}

function readSearchHistory(channelId: string): string[] {
	try {
		const value = miLocalStorage.getItemAsJson<string[]>(getSearchHistoryStorageKey(channelId));
		if (!Array.isArray(value)) return [];
		return value.filter(item => typeof item === 'string' && item.trim().length > 0).slice(0, 8);
	} catch {
		miLocalStorage.removeItem(getSearchHistoryStorageKey(channelId));
		return [];
	}
}

function saveSearchHistory(query: string): void {
	const normalized = query.trim();
	if (normalized.length === 0) return;
	searchHistory.value = [normalized, ...searchHistory.value.filter(item => item !== normalized)].slice(0, 8);
	miLocalStorage.setItem(getSearchHistoryStorageKey(props.channelId), JSON.stringify(searchHistory.value));
}

function removeSearchHistory(term: string): void {
	searchHistory.value = searchHistory.value.filter(item => item !== term);
	miLocalStorage.setItem(getSearchHistoryStorageKey(props.channelId), JSON.stringify(searchHistory.value));
}

async function hideChannelTrend(term: string): Promise<void> {
	if (!canModerateChannelTrends.value || !channel.value) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.hide,
		text: i18n.tsx.hideSearchTrendConfirm({ term }),
		okText: i18n.ts.hide,
	});
	if (canceled) return;

	removeLocalChannelTrend(term);
	if (iAmAdmin) {
		await os.apiWithDialog<{ hiddenSearchTrendTerms: string[] }, 'admin/search-trends/hide'>('admin/search-trends/hide', { term });
	} else {
		channel.value = await os.apiWithDialog<Misskey.entities.Channel, 'channels/update'>('channels/update', {
			channelId: channel.value.id,
			hiddenSearchTrendTerms: [
				...new Set([
					...((channel.value as Misskey.entities.Channel & { hiddenSearchTrendTerms?: string[] }).hiddenSearchTrendTerms ?? []),
					normalizeSearchTrendKey(term),
				]),
			],
		});
	}
}

function removeLocalChannelTrend(term: string): void {
	const normalized = normalizeSearchTrendKey(term);
	const remove = (notes: Misskey.entities.Note[]) => notes.filter(note => {
		const terms = [
			...(note.tags ?? []),
			...extractTermsFromNote(note),
		];
		return !terms.some(item => normalizeSearchTrendKey(item) === normalized);
	});
	previewRecentNotes.value = remove(previewRecentNotes.value);
	previewHotNotes.value = remove(previewHotNotes.value);
}

function getSearchHistoryStorageKey(channelId: string): string {
	return `channelSearchHistory:${channelId}`;
}

async function loadChannelPreviewData(channelId: string): Promise<void> {
	previewLoading.value = true;
	try {
		const [recent, hot] = await Promise.all([
			misskeyApi<Misskey.entities.Note[]>('channels/timeline', {
				channelId,
				limit: 50,
				withRenotes: false,
				withBots: true,
			}).catch(() => []),
			misskeyApi<Misskey.entities.Note[]>('notes/featured', {
				channelId,
				limit: 20,
			}).catch(() => []),
		]);

		if (props.channelId !== channelId) return;
		previewRecentNotes.value = recent;
		previewHotNotes.value = hot;
	} finally {
		if (props.channelId === channelId) previewLoading.value = false;
	}
}

function getChannelHotNotes(featured: Misskey.entities.Note[], recent: Misskey.entities.Note[], limit: number): Misskey.entities.Note[] {
	const seen = new Set<string>();
	const candidates = [...featured, ...recent]
		.filter(note => {
			if (seen.has(note.id)) return false;
			seen.add(note.id);
			return isGoodChannelNote(note);
		})
		.sort((a, b) => getChannelNoteScore(b) - getChannelNoteScore(a));
	return candidates.slice(0, limit);
}

function getChannelNoteScore(note: Misskey.entities.Note): number {
	const reactionCount = Object.values(note.reactions ?? {}).reduce((sum, count) => sum + count, 0);
	const textLength = (note.text ?? note.cw ?? '').trim().length;
	const createdAt = Date.parse(note.createdAt);
	const ageHours = Number.isFinite(createdAt) ? Math.max(1, (Date.now() - createdAt) / 1000 / 60 / 60) : 72;
	const interactionScore = (note.repliesCount * 4) + (note.renoteCount * 5) + (reactionCount * 3);
	const qualityScore = Math.min(20, textLength / 8) + ((note.fileIds?.length ?? 0) > 0 ? 4 : 0) + ((note.tags?.length ?? 0) * 2);
	return interactionScore + qualityScore - Math.min(18, ageHours / 8);
}

function isGoodChannelNote(note: Misskey.entities.Note): boolean {
	const text = (note.text ?? note.cw ?? '').trim();
	if (text.length === 0) return true;
	return isGoodSearchTrendTerm(text.length > 36 ? text.slice(0, 36) : text);
}

function searchLocalChannelNotes(query: string, notes: Misskey.entities.Note[]): Misskey.entities.Note[] {
	const normalized = normalizeSearchTrendKey(query);
	if (normalized.length === 0) return [];
	return notes.filter(note => {
		const text = `${note.cw ?? ''} ${note.text ?? ''} ${(note.tags ?? []).join(' ')}`;
		return normalizeSearchTrendKey(text).includes(normalized.replace(/^#/, ''));
	}).slice(0, 10);
}

function collectChannelTrends(): ChannelTrends {
	const recentTerms: string[] = [];
	const hashtags: string[] = [];
	const seen = new Set<string>();
	const hiddenTerms = new Set(((channel.value as (Misskey.entities.Channel & { hiddenSearchTrendTerms?: string[] }) | null)?.hiddenSearchTrendTerms ?? []).map(normalizeSearchTrendKey));
	const pushTerm = (term: string): void => {
		const normalized = normalizeSearchTrendKey(term);
		if (hiddenTerms.has(normalized)) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		recentTerms.push(term.trim());
	};
	const pushTag = (term: string): void => {
		const normalized = normalizeSearchTrendKey(term);
		if (hiddenTerms.has(normalized)) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		hashtags.push(term.trim().replace(/^#/, ''));
	};

	for (const note of [...previewHotNotes.value, ...previewRecentNotes.value]) {
		for (const tag of note.tags ?? []) pushTag(tag);
		for (const term of extractTermsFromNote(note)) pushTerm(term);
	}

	return {
		popularSearches: [],
		recentTerms: recentTerms.slice(0, 12),
		hashtags: hashtags.slice(0, 12),
	};
}

function extractTermsFromNote(note: Misskey.entities.Note): string[] {
	const source = `${note.cw ?? ''} ${note.text ?? ''}`
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/[@＠][\w._-]+(?:@[\w.-]+)?/g, ' ')
		.replace(/[#＃]([\p{L}\p{N}_-]{2,30})/gu, ' #$1 ')
		.replace(/\s+/g, ' ')
		.trim();
	if (source.length === 0) return [];

	const terms = new Set<string>();
	for (const raw of source.split(/[\s,，。.!！？?;；:：、|/\\()[\]{}<>《》"“”'‘’]+/u)) {
		const term = raw.trim().replace(/^#/, '');
		if (term.length < 2 || term.length > 24) continue;
		terms.add(term);
		if (terms.size >= 4) break;
	}
	return [...terms];
}

function summarizeNote(note: Misskey.entities.Note): string {
	return (note.text ?? note.cw ?? i18n.ts.notes).replace(/\s+/g, ' ').slice(0, 72);
}

function getRightRailPageScroller(): HTMLElement | null {
	return rightRailEl.value?.closest<HTMLElement>('._pageScrollable, ._pageScrollableReversed') ?? null;
}

function syncRightRailStickyBounds(): void {
	const rail = rightRailEl.value;
	const scroller = getRightRailPageScroller();
	if (!rail || !scroller) return;
	const nextMaxOffset = Math.max(0, rail.offsetHeight - scroller.clientHeight);
	if (!rightRailOffsetInitialized || rightRailOffset === rightRailMaxOffset) {
		rightRailOffset = nextMaxOffset;
		rightRailOffsetInitialized = true;
	} else {
		rightRailOffset = Math.min(rightRailOffset, nextMaxOffset);
	}
	rightRailMaxOffset = nextMaxOffset;
	applyRightRailStickyTop();
}

function applyRightRailStickyTop(): void {
	rightRailEl.value?.style.setProperty('--right-rail-sticky-top', `${-rightRailOffset}px`);
}

function installRightRailStickyObserver(): void {
	const rail = rightRailEl.value;
	const scroller = getRightRailPageScroller();
	if (!rail || !scroller) return;
	rightRailResizeObserver?.disconnect();
	rightRailResizeObserver = new ResizeObserver(syncRightRailStickyBounds);
	rightRailResizeObserver.observe(rail);
	rightRailResizeObserver.observe(scroller);
}

function normalizeWheelDeltaY(ev: WheelEvent, scroller: HTMLElement): number {
	if (ev.deltaMode === WheelEvent.DOM_DELTA_LINE) return ev.deltaY * 16;
	if (ev.deltaMode === WheelEvent.DOM_DELTA_PAGE) return ev.deltaY * scroller.clientHeight;
	return ev.deltaY;
}

function shiftRightRailOffset(deltaY: number): number {
	const previous = rightRailOffset;
	rightRailOffset = Math.min(rightRailMaxOffset, Math.max(0, rightRailOffset + deltaY));
	applyRightRailStickyTop();
	return rightRailOffset - previous;
}

function onRightRailWheel(ev: WheelEvent): void {
	if (ev.ctrlKey) return;
	const scroller = getRightRailPageScroller();
	if (!scroller) return;
	ev.preventDefault();
	const deltaY = normalizeWheelDeltaY(ev, scroller);
	const rightRailShift = shiftRightRailOffset(deltaY);
	scroller.scrollTop += rightRailShift === 0 ? deltaY : rightRailShift * 0.22;
}

function onMainWheel(ev: WheelEvent): void {
	if (ev.ctrlKey) return;
	const scroller = getRightRailPageScroller();
	if (!scroller) return;
	shiftRightRailOffset(normalizeWheelDeltaY(ev, scroller));
}

const headerActions = computed(() => {
	if (channel.value && channel.value.userId) {
		const headerItems: PageHeaderItem[] = [{
			icon: 'ph-dots-three ph-bold ph-lg',
			text: i18n.ts.options,
			handler: (ev) => {
				os.popupMenu([{
					type: 'switch',
					text: i18n.ts.showRenotes,
					ref: withRenotes,
				}, {
					type: 'switch',
					text: i18n.ts.fileAttachedOnly,
					ref: onlyFiles,
				}], ev.currentTarget ?? ev.target);
			},
		}];

		headerItems.push({
			icon: 'ti ti-link',
			text: i18n.ts.copyUrl,
			handler: async (): Promise<void> => {
				if (!channel.value) {
					console.warn('failed to copy channel URL. channel.value is null.');
					return;
				}
				copyToClipboard(`${url}/channels/${channel.value.id}`);
			},
		});

		if (isSupportShare()) {
			headerItems.push({
				icon: 'ti ti-share',
				text: i18n.ts.share,
				handler: async (): Promise<void> => {
					if (!channel.value) {
						console.warn('failed to share channel. channel.value is null.');
						return;
					}

					navigator.share({
						title: channel.value.name,
						text: channel.value.description ?? undefined,
						url: `${url}/channels/${channel.value.id}`,
					});
				},
			});
		}

		if (($i && $i.id === channel.value.userId) || iAmModerator) {
			headerItems.push({
				icon: 'ti ti-settings',
				text: i18n.ts.edit,
				handler: edit,
			});
		}

		return headerItems.length > 0 ? headerItems : null;
	} else {
		return null;
	}
});

definePage(() => ({
	title: channel.value ? channel.value.name : i18n.ts.channel,
	icon: 'ti ti-device-tv',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.shell {
	--x-blue: #1d9bf0;
	--timeline-main-width: var(--layout-main-column-width, 600px);
	--timeline-rail-width: var(--layout-side-rail-width, 350px);
	--timeline-column-gap: var(--layout-column-gap, 30px);
	--timeline-outer-gap: 0px;

	box-sizing: border-box;
	width: min(calc(100% - var(--timeline-outer-gap)), calc(var(--timeline-main-width) + var(--timeline-rail-width) + var(--timeline-column-gap)));
	margin-left: var(--timeline-outer-gap);
	margin-right: auto;
	display: grid;
	grid-template-columns: minmax(0, var(--timeline-main-width)) minmax(300px, var(--timeline-rail-width));
	column-gap: var(--timeline-column-gap);
	align-items: start;
	min-height: 100%;
}

.main {
	min-width: 0;
	background: var(--MI_THEME-bg);
	min-height: 100cqh;
}

.hero {
	position: relative;
	min-height: 280px;
	overflow: clip;
	border-radius: 0 0 var(--MI-radius, 12px) var(--MI-radius, 12px);
	background-position: center;
	background-size: cover;
	border: solid 1px var(--MI_THEME-divider);
}

.heroShade {
	position: absolute;
	inset: 0;
	background:
		linear-gradient(180deg, rgba(0, 0, 0, 0.1) 0%, rgba(0, 0, 0, 0.24) 35%, rgba(0, 0, 0, 0.76) 100%),
		radial-gradient(circle at 20% 20%, rgba(42, 171, 238, 0.3), transparent 34%);
}

.heroActions {
	position: absolute;
	z-index: 2;
	top: 16px;
	left: 16px;
	right: 16px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.followButton,
.heroIconButton {
	box-shadow: 0 10px 28px rgba(0, 0, 0, 0.34);
}

.heroContent {
	position: absolute;
	z-index: 1;
	left: 0;
	right: 0;
	bottom: 0;
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 72px 22px 22px;
	color: #fff;
}

.heroKicker {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	width: fit-content;
	padding: 5px 9px;
	border-radius: 999px;
	background: rgba(255, 255, 255, 0.16);
	font-size: 12px;
	font-weight: 700;
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
}

.heroTitle {
	margin: 0;
	font-size: clamp(28px, 4vw, 42px);
	line-height: 1.05;
	letter-spacing: 0;
	text-shadow: 0 2px 18px rgba(0, 0, 0, 0.45);
}

.heroMeta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	font-size: 13px;

	> span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 5px 9px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.34);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}
}

.sensitiveBadge {
	color: #ffd166;
}

.heroDescription {
	max-width: 58ch;
	color: rgba(255, 255, 255, 0.86);
	font-size: 0.95em;
	line-height: 1.5;
}

.tabs {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	min-height: 53px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 85%, transparent);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.tab {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	min-width: 0;
	padding: 0 8px;
	font-size: 14px;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: background .12s, color .12s;

	&::after {
		content: "";
		position: absolute;
		left: 50%;
		bottom: 0;
		width: 0;
		height: 4px;
		border-radius: 999px;
		background: var(--x-blue);
		transform: translateX(-50%);
		transition: width .18s ease;
		pointer-events: none;
	}

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}
}

.tabLabel {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.tabActive {
	font-weight: 700;
	color: var(--MI_THEME-fg);

	&::after {
		width: max(34px, 54%);
	}
}

.contentStack {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 16px 12px 28px;
}

.section {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, transparent);
	overflow: clip;
}

.sectionHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 16px;
	padding: 16px 18px 12px;

	h2 {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0;
		font-size: 20px;
		line-height: 1.2;
	}
}

.sectionEyebrow {
	margin-bottom: 4px;
	font-size: 12px;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sectionAction {
	flex: 0 0 auto;
	padding: 7px 12px;
	border-radius: 999px;
	font-size: 13px;
	font-weight: 700;
	color: var(--x-blue);
}

.sectionAction:hover {
	background: color-mix(in srgb, var(--x-blue) 12%, transparent);
}

.composer {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.timeline {
	background: var(--MI_THEME-bg);
}

.searchPanel {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 10px;
	padding: 0 18px 16px;
}

.shortcutPanel {
	display: flex;
	flex-direction: column;
	gap: 14px;
	padding: 0 18px 16px;
}

.shortcutGroup {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.shortcutTitle {
	font-size: 12px;
	font-weight: 800;
	color: var(--MI_THEME-fgTransparentWeak);
}

.chipGrid {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	min-width: 0;
}

.historyChip,
.termChip {
	display: inline-grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 7px;
	max-width: min(100%, 280px);
	padding: 7px 9px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);
	font-size: 13px;
	text-align: left;

	> span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.termChip {
	grid-template-columns: auto minmax(0, 1fr);
}

.termChip:has(.removeChip) {
	grid-template-columns: auto minmax(0, 1fr) auto;
}

.historyChip:hover,
.termChip:hover {
	background: var(--MI_THEME-buttonHoverBg);
}

.removeChip {
	display: grid;
	place-items: center;
	width: 20px;
	height: 20px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.removeChip:hover {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 12%, transparent);
}

.searchEmpty {
	display: grid;
	place-items: center;
	gap: 8px;
	min-height: 160px;
	padding: 32px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;

	> i {
		font-size: 28px;
		color: var(--x-blue);
	}

	> strong {
		max-width: 100%;
		color: var(--MI_THEME-fg);
		overflow-wrap: anywhere;
	}

	> span {
		max-width: 36ch;
		overflow-wrap: anywhere;
	}
}

.searchStatus {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-height: 120px;
	padding: 24px;
	color: var(--MI_THEME-fgTransparentWeak);

	> i {
		font-size: 22px;
	}
}

.searchError {
	color: var(--MI_THEME-error);
}

.searchResults {
	border-top: solid 1px var(--MI_THEME-divider);
}

.listLoading {
	display: grid;
	place-items: center;
	min-height: 120px;
	padding: 20px;
	border-top: solid 1px var(--MI_THEME-divider);
}

.previewNotes {
	border-top: solid 1px var(--MI_THEME-divider);
}

.rightRail {
	position: sticky;
	top: var(--right-rail-sticky-top, 0px);
	box-sizing: border-box;
	height: auto;
	display: flex;
	flex-direction: column;
	gap: 12px;
	overflow: visible;
	overscroll-behavior: auto;
	scrollbar-gutter: auto;
	padding: 8px 0 24px;
}

.rightRail > * {
	flex: 0 0 auto;
}

.searchBox {
	padding-bottom: 8px;
	background: var(--MI_THEME-bg);
}

.sideCard {
	border-radius: 16px;
	padding: 4px 0;
	background: color-mix(in srgb, var(--MI_THEME-panel) 70%, transparent);
	overflow: hidden;
}

.sideCardTitle {
	padding: 12px 16px 6px;
	font-size: 20px;
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.sideList {
	display: flex;
	flex-direction: column;
}

.trendRow,
.noteTeaser {
	transition: background .1s;
}

.trendRow:hover,
.noteTeaser:hover {
	background: var(--MI_THEME-panelHighlight);
}

.trendRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	width: 100%;
	gap: 8px;
	padding: 10px 16px;
	text-align: left;
}

.trendRowWithAction {
	grid-template-columns: minmax(0, 1fr) auto;
}

.trendBody {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.trendTitle {
	font-weight: 700;
	font-size: .98em;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.trendMeta {
	font-size: .8em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.trendHideButton {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.trendHideButton:hover {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 12%, transparent);
}

.statGrid {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 8px;
	padding: 10px 16px 16px;
}

.statItem {
	min-width: 0;
	padding: 12px;
	border-radius: 12px;
	background: var(--MI_THEME-bg);

	span {
		display: block;
		margin-bottom: 4px;
		font-size: 12px;
		color: var(--MI_THEME-fgTransparentWeak);
	}

	strong {
		display: block;
		font-size: 22px;
		line-height: 1;
	}
}

.noteTeaser {
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 10px 16px;
	color: inherit;
}

.noteTeaserText {
	font-weight: 600;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
}

.noteTeaserMeta {
	font-size: .82em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.footer {
	-webkit-backdrop-filter: var(--MI-blur, blur(15px));
	backdrop-filter: var(--MI-blur, blur(15px));
	background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);
	border-top: solid 0.5px var(--MI_THEME-divider);
}

@media (max-width: 1250px) {
	.shell {
		--timeline-rail-width: 300px;
		--timeline-column-gap: 20px;
		width: calc(100% - var(--timeline-outer-gap));
		grid-template-columns: minmax(0, var(--timeline-main-width)) minmax(280px, var(--timeline-rail-width));
	}
}

@media (max-width: 1100px) {
	.shell {
		display: block;
		width: min(100%, 600px);
		margin: 0 auto;
	}

	.rightRail {
		display: none;
	}
}

@media (max-width: 640px) {
	.hero {
		min-height: 250px;
		border-radius: 0;
	}

	.heroTitle {
		font-size: 28px;
	}

	.tabs {
		grid-template-columns: repeat(4, minmax(0, 1fr));
	}

	.tab {
		flex-direction: column;
		gap: 3px;
		font-size: 12px;
	}

	.searchPanel {
		grid-template-columns: 1fr;
	}
}
</style>

<style lang="scss" scoped>
.xFeed :deep([data-scroll-anchor]) {
	background: var(--MI_THEME-panel);
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px) !important;
	margin-bottom: 12px;
	overflow: clip;
	transition: background .1s, border-color .1s;
}

.xFeed :deep([data-scroll-anchor]):hover {
	background: var(--MI_THEME-panelHighlight);
	border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, var(--MI_THEME-fg));
}

.xFeed :deep(article) {
	padding: 16px 18px;
}

.xFeed :deep([data-note-color-bar]) {
	display: none;
}

.xFeed :deep([data-note-author-avatar]) {
	display: block !important;
	visibility: visible !important;
	opacity: 1 !important;
	background: color-mix(in srgb, var(--MI_THEME-fg) 7%, var(--MI_THEME-panel));
	box-shadow: 0 0 0 1px var(--MI_THEME-divider);
}

.xFeed :deep([data-note-author-name]) {
	color: var(--MI_THEME-fg) !important;
	-webkit-text-fill-color: var(--MI_THEME-fg) !important;
	opacity: 1 !important;
}

.xFeed :deep([data-note-author-acct]) {
	color: color-mix(in srgb, var(--MI_THEME-fg) 68%, transparent) !important;
	-webkit-text-fill-color: color-mix(in srgb, var(--MI_THEME-fg) 68%, transparent) !important;
	opacity: 1 !important;
}

.xFeed :deep([data-note-author-name] *),
.xFeed :deep([data-note-author-acct] *) {
	color: inherit !important;
	-webkit-text-fill-color: currentColor !important;
}

.xFeed :deep(footer._gaps) {
	--x-blue: #1d9bf0;
	margin-top: 6px;
	max-width: 480px;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0;
	overflow: visible;
}

.xFeed :deep(footer._gaps > button) {
	flex: 1 1 0;
	display: inline-flex;
	align-items: center;
	justify-content: flex-start;
	gap: 6px;
	padding: 6px 0;
	min-width: 0;
	opacity: 1;
	color: var(--MI_THEME-fgTransparentWeak);
	transition: color .12s;
}

.xFeed :deep(footer._gaps > button > :is(i, svg)) {
	font-size: 18px;
	border-radius: 50%;
	padding: 6px;
	margin: -6px;
	transition: background .12s, color .12s;
}

.xFeed :deep(footer._gaps > button:hover) { color: var(--x-blue); }
.xFeed :deep(footer._gaps > button:hover > :is(i, svg)) {
	background: color-mix(in srgb, var(--x-blue) 14%, transparent);
	color: var(--x-blue);
}
.xFeed :deep(footer._gaps > button:nth-child(2):hover) { color: #00ba7c; }
.xFeed :deep(footer._gaps > button:nth-child(2):hover > :is(i, svg)) {
	background: color-mix(in srgb, #00ba7c 14%, transparent);
	color: #00ba7c;
}
.xFeed :deep(footer._gaps > button:nth-child(4):hover),
.xFeed :deep(footer._gaps > button:nth-child(5):hover) { color: #f91880; }
.xFeed :deep(footer._gaps > button:nth-child(4):hover > :is(i, svg)),
.xFeed :deep(footer._gaps > button:nth-child(5):hover > :is(i, svg)) {
	background: color-mix(in srgb, #f91880 14%, transparent);
	color: #f91880;
}

.xFeed :deep(footer._gaps > button > p) {
	margin: 0;
	font-size: 13px;
	line-height: 1;
}

.xFeed :deep(footer._gaps > button:last-child) {
	flex: 0 0 auto;
}
</style>
