<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="[]" :tabs="[]" :swipable="false" :hideTitle="true">
	<div :class="$style.exploreShell">
		<main :class="$style.exploreMain" @wheel.passive="onMainWheel">
			<header :class="$style.exploreHeader">
				<form :class="$style.searchRow" @submit.prevent="submitSearch">
					<MkInput ref="searchInputEl" v-model="searchQuery" :class="$style.searchInput" type="search" :placeholder="i18n.ts.search">
						<template #prefix><i class="ti ti-search"></i></template>
					</MkInput>
					<button class="_button" :class="$style.settingsButton" type="button" :aria-label="i18n.ts.settings">
						<i class="ti ti-settings"></i>
					</button>
				</form>
				<nav :class="$style.exploreTabs" role="tablist" :aria-label="i18n.ts.explore">
					<button
						v-for="item in exploreTabs"
						:key="item.key"
						class="_button"
						:class="[$style.exploreTab, { [$style.exploreTabActive]: tab === item.key }]"
						role="tab"
						:aria-selected="tab === item.key"
						@click="selectTab(item.key)"
					>
						{{ item.title }}
					</button>
				</nav>

				<!-- 与首页同款的 scope + 视图切换 + 自动翻译;chip 风格统一 -->
				<nav :class="$style.scopeRow" role="tablist" aria-label="范围">
					<button
						v-for="s in exploreScopeTabs"
						:key="s.key"
						class="_button"
						:class="[$style.scopeChip, { [$style.scopeChipActive]: exploreScope === s.key }]"
						role="tab"
						:aria-selected="exploreScope === s.key"
						@click="exploreScope = s.key"
					>
						<i :class="['ti', s.icon, $style.scopeChipIcon]"></i>
						<span>{{ s.title }}</span>
					</button>
					<div :class="$style.scopeRowRight">
						<SkAutoTranslateSwitch/>
						<SkTimelineViewSwitch/>
					</div>
				</nav>
			</header>

			<section v-if="searchHistoryRows.length > 0" :class="$style.searchShortcutPanel">
				<div>
					<div :class="$style.shortcutHeader">
						<div>
							<div :class="$style.sectionEyebrow">搜索历史</div>
							<h2>最近搜索</h2>
						</div>
					</div>
					<div :class="$style.shortcutGrid">
						<div v-for="term in searchHistoryRows" :key="`history:${term}`" :class="$style.historyItem">
							<button class="_button" :class="$style.shortcutMain" @click="openSearchHistory(term)">
								<span :class="$style.shortcutIcon"><i class="ti ti-history"></i></span>
								<span :class="$style.shortcutText">{{ term }}</span>
							</button>
							<button class="_button" :class="$style.historyRemove" type="button" :aria-label="i18n.ts.delete" @click="removeSearchHistory(term)">
								<i class="ti ti-x"></i>
							</button>
						</div>
					</div>
				</div>
			</section>

			<section v-if="submittedQuery" :class="$style.searchPanel">
				<div :class="$style.searchPanelHeader">
					<div>
						<div :class="$style.searchPanelTitle">{{ i18n.ts.searchResult }}</div>
						<div :class="$style.searchPanelCaption">{{ submittedQuery }}</div>
					</div>
					<div :class="$style.searchPanelActions">
						<button class="_button" :class="$style.panelAction" @click="runSearch(submittedQuery)">
							<i class="ti ti-refresh"></i>
							<span>{{ i18n.ts.retry }}</span>
						</button>
						<button class="_button" :class="$style.panelAction" @click="clearSearch()">
							<i class="ti ti-x"></i>
							<span>{{ i18n.ts.clear }}</span>
						</button>
					</div>
				</div>
				<MkLoading v-if="searchLoading"/>
				<div v-else-if="searchEmpty" :class="$style.searchEmpty">
					<i class="ti ti-search-off"></i>
					<div :class="$style.searchEmptyTitle">{{ i18n.tsx.noSearchResultsFor({ query: submittedQuery }) }}</div>
					<div :class="$style.searchEmptyText">{{ i18n.ts.searchEmptySuggestion }}</div>
					<div :class="$style.searchEmptyActions">
						<button class="_buttonPrimary" :class="$style.searchEmptyButton" @click="focusSearchInput">{{ i18n.ts.changeSearchQuery }}</button>
						<button class="_button" :class="$style.searchEmptyButton" @click="clearSearch()">{{ i18n.ts.returnToRecommended }}</button>
					</div>
				</div>
				<div v-else :class="$style.searchResults">
					<section v-if="userResults.length > 0" :class="$style.resultSection">
						<div :class="$style.resultSectionTitle">{{ i18n.ts.users }}</div>
						<div v-for="user in userResults" :key="user.id" :class="$style.searchUser">
							<MkAvatar :user="user" :class="$style.searchUserAvatar"/>
							<MkA :to="userPage(user)" :class="$style.searchUserBody">
								<MkUserName :user="user" :nowrap="true"/>
								<MkAcct :user="user"/>
							</MkA>
							<MkFollowButton :user="user" :class="$style.followButton" mini/>
						</div>
					</section>
					<section v-if="tagResults.length > 0" :class="$style.resultSection">
						<div :class="$style.resultSectionTitle">{{ i18n.ts.popularTags }}</div>
						<div :class="$style.tags">
							<button v-for="tag in tagResults" :key="tag" class="_button" :class="$style.tagChip" @click="openTrend('tag', tag)">#{{ tag }}</button>
						</div>
					</section>
					<section v-if="noteResults.length > 0" :class="$style.resultSection">
						<div :class="$style.resultSectionTitle">{{ i18n.ts.notes }}</div>
						<div class="_gaps">
							<DynamicNote v-for="note in noteResults" :key="note.id" :note="note" :withHardMute="true"/>
						</div>
					</section>
				</div>
			</section>

			<template v-else-if="showExploreLoading">
				<section :class="[$style.featurePanel, $style.featurePanelLoading]" aria-busy="true">
					<div :class="$style.featureShade"></div>
					<div :class="$style.featureContent">
						<span :class="[$style.skeletonLine, $style.featureSkeletonKicker]"></span>
						<span :class="[$style.skeletonLine, $style.featureSkeletonTitle]"></span>
						<span :class="[$style.skeletonLine, $style.featureSkeletonMeta]"></span>
					</div>
				</section>

				<section :class="$style.skeletonPanel">
					<div :class="$style.skeletonHeader">
						<span :class="[$style.skeletonLine, $style.skeletonLineShort]"></span>
						<span :class="$style.skeletonLine"></span>
					</div>
					<div :class="$style.skeletonRows">
						<span v-for="index in 4" :key="index" :class="$style.skeletonRow"></span>
					</div>
				</section>
			</template>

			<template v-else>
				<section
					v-if="featureNote != null"
					:class="[$style.featurePanel, $style.featurePanelClickable]"
					:style="{ backgroundImage: `url(${featureImageUrl})` }"
					role="link"
					tabindex="0"
					@click="openFeatureNote"
					@keydown.enter="openFeatureNote"
				>
					<div :class="$style.featureShade"></div>
					<div :class="$style.featureContent">
						<div :class="$style.featureKicker">{{ featureKicker }}</div>
						<h1 :class="$style.featureTitle">{{ featureTitle }}</h1>
						<div :class="$style.featureMeta">
							<i class="ti ti-sparkles"></i>
							<span>{{ featureMeta }}</span>
						</div>
					</div>
				</section>

				<section v-if="filteredTrendRows.length > 0" :class="$style.newsList">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ activeSectionTitle }}</div>
							<h2>{{ i18n.ts.hotDiscussions }}</h2>
						</div>
					</div>
					<button
						v-for="trend in filteredTrendRows"
						:key="`${trend.type}:${trend.term}`"
						class="_button"
						:class="$style.newsRow"
						@click="openTrend(trend.type, trend.term)"
					>
						<span :class="$style.trendBody">
							<span :class="$style.newsTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
							<span :class="$style.newsMeta">{{ trend.label }}</span>
						</span>
						<button
							v-if="iAmAdmin"
							class="_button"
							:class="$style.trendHideButton"
							type="button"
							title="隐藏热词"
							@click.stop="hideTrend(trend.term)"
						>
							<i class="ti ti-x"></i>
						</button>
					</button>
				</section>

				<section v-if="categoryEmpty" :class="$style.categoryEmpty">
					<i class="ti ti-compass-off"></i>
					<div :class="$style.categoryEmptyTitle">{{ i18n.tsx.exploreCategoryEmpty({ category: activeSectionTitle }) }}</div>
					<div :class="$style.categoryEmptyText">{{ i18n.ts.exploreCategoryEmptyDescription }}</div>
					<div :class="$style.categoryEmptyActions">
						<button class="_buttonPrimary" :class="$style.categoryEmptyButton" @click="selectTab('forYou')">{{ i18n.ts.returnToRecommended }}</button>
						<button class="_button" :class="$style.categoryEmptyButton" @click="focusSearchInput">{{ i18n.ts.changeSearchQuery }}</button>
					</div>
				</section>

				<section v-else-if="exploreEmpty" :class="$style.categoryEmpty">
					<i class="ti ti-compass-off"></i>
					<div :class="$style.categoryEmptyTitle">暂时没有可展示内容</div>
					<div :class="$style.categoryEmptyText">当前没有足够可靠的趋势或推荐内容，可以刷新或返回推荐。</div>
					<div :class="$style.categoryEmptyActions">
						<button class="_buttonPrimary" :class="$style.categoryEmptyButton" @click="loadExploreData()">{{ i18n.ts.reload }}</button>
						<button class="_button" :class="$style.categoryEmptyButton" @click="selectTab('forYou')">{{ i18n.ts.returnToRecommended }}</button>
					</div>
				</section>

				<section v-if="activeNotes.length > 0" :class="$style.discoverySection">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ i18n.ts.todayNews }}</div>
							<h2>{{ activeSectionTitle }}</h2>
						</div>
					</div>
					<div class="_gaps" :class="$style.noteList">
						<DynamicNote v-for="note in activeNotes" :key="note.id" :note="note" :withHardMute="true"/>
					</div>
				</section>

				<section v-if="visibleChannels.length > 0" :class="$style.discoverySection">
					<div :class="$style.sectionHeader">
						<div>
							<div :class="$style.sectionEyebrow">{{ i18n.ts.explore }}</div>
							<h2>{{ i18n.ts.recommendedChannels }}</h2>
						</div>
					</div>
					<div :class="$style.channelGrid">
						<MkA v-for="channel in visibleChannels" :key="channel.id" :to="`/channels/${channel.id}`" :class="$style.channelCard">
							<span :class="$style.channelBanner" :style="{ background: channel.color }">
								<i class="ti ti-device-tv"></i>
							</span>
							<span :class="$style.channelName">{{ channel.name }}</span>
							<span :class="$style.channelMeta">{{ i18n.tsx.channelStats({ notes: channel.notesCount, users: channel.usersCount }) }}</span>
						</MkA>
					</div>
				</section>
			</template>
		</main>

		<aside ref="rightRailEl" :class="$style.rightRail" @wheel="onRightRailWheel">
			<template v-if="showExploreLoading">
				<section :class="$style.sideCard">
					<div :class="$style.sideCardTitle">{{ i18n.ts.loading }}</div>
					<div :class="$style.sideSkeletonList">
						<span v-for="index in 5" :key="index" :class="$style.sideSkeletonRow"></span>
					</div>
				</section>
			</template>

			<section v-if="!showExploreLoading && filteredTrendRows.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.whatsHappeningNow }}</div>
				<button
					v-for="trend in filteredTrendRows"
					:key="`side:${trend.type}:${trend.term}`"
					class="_button"
					:class="$style.trendRow"
					@click="openTrend(trend.type, trend.term)"
				>
					<span :class="$style.trendBody">
						<span :class="$style.trendTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
						<span :class="$style.trendMeta">{{ trend.label }}</span>
					</span>
					<button
						v-if="iAmAdmin"
						class="_button"
						:class="$style.trendHideButton"
						type="button"
						title="隐藏热词"
						@click.stop="hideTrend(trend.term)"
					>
						<i class="ti ti-x"></i>
					</button>
				</button>
			</section>

			<section v-if="!showExploreLoading && sideChannels.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.recommendedChannels }}</div>
				<MkA v-for="channel in sideChannels" :key="channel.id" :to="`/channels/${channel.id}`" :class="$style.sideChannel">
					<span :class="$style.sideChannelIcon" :style="{ background: channel.color }"><i class="ti ti-device-tv"></i></span>
					<span :class="$style.sideChannelBody">
						<span :class="$style.sideChannelName">{{ channel.name }}</span>
						<span :class="$style.sideChannelMeta">{{ i18n.tsx.channelStats({ notes: channel.notesCount, users: channel.usersCount }) }}</span>
					</span>
				</MkA>
			</section>

			<section v-if="!showExploreLoading && recommendedUsers.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.whoToFollow }}</div>
				<div v-for="user in recommendedUsers" :key="user.id" :class="$style.userRow">
					<MkAvatar :user="user" :class="$style.userAvatar"/>
					<MkA :to="userPage(user)" :class="$style.userBody">
						<MkUserName :user="user" :nowrap="true"/>
						<MkAcct :user="user"/>
					</MkA>
					<MkFollowButton :user="user" :class="$style.followButton" mini/>
				</div>
			</section>
		</aside>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, provide, ref, shallowRef, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import DynamicNote from '@/components/DynamicNote.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkInput from '@/components/MkInput.vue';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';
import { useRouter } from '@/router';
import { miLocalStorage } from '@/local-storage.js';
import { iAmAdmin } from '@/i.js';
import * as os from '@/os.js';
import { buildSearchTrendRows } from '@/utility/search-trends.js';
import SkAutoTranslateSwitch from '@/components/SkAutoTranslateSwitch.vue';
import SkTimelineViewSwitch from '@/components/SkTimelineViewSwitch.vue';

provide('shouldOmitHeaderTitle', true);

const props = withDefaults(defineProps<{
	query?: string;
	initialTab?: string;
}>(), {
	query: '',
	initialTab: 'forYou',
});

type ExploreTab = 'forYou' | 'trending' | 'messages' | 'sports' | 'entertainment' | 'games';
type DiscoverySections = Misskey.Endpoints['notes/discovery-sections']['res'];

const router = useRouter();
const searchInputEl = useTemplateRef('searchInputEl');
const rightRailEl = useTemplateRef('rightRailEl');
const searchHistoryStorageKey = 'exploreSearchHistory';
const discoverySectionLimit = 10;
const categoryNoteLimit = 14;
const sideChannelLimit = 4;
let rightRailResizeObserver: ResizeObserver | undefined;
let rightRailOffset = 0;
let rightRailMaxOffset = 0;
let rightRailOffsetInitialized = false;

const tab = ref<ExploreTab>(normalizeTab(props.initialTab));

// 与首页一致的范围筛选;localStorage 共享同一 key 避免在两页之间反复切换。
type Scope = 'all' | 'local' | 'global';
const EXPLORE_SCOPE_KEY = 'home:scope';
const exploreScope = ref<Scope>(((): Scope => {
	const v = miLocalStorage.getItem(EXPLORE_SCOPE_KEY) as Scope | null;
	if (v === 'all' || v === 'local' || v === 'global') return v;
	return 'local';
})());
watch(exploreScope, v => miLocalStorage.setItem(EXPLORE_SCOPE_KEY, v));
const exploreScopeTabs = [
	{ key: 'all' as const, title: '全部', icon: 'ti-circle-dot' },
	{ key: 'local' as const, title: '本地服务器', icon: 'ti-home' },
	{ key: 'global' as const, title: '联邦服务器', icon: 'ti-world' },
];
const searchQuery = ref(props.query ?? '');
const submittedQuery = ref('');
const searchLoading = ref(false);
const searchHistory = ref(readSearchHistory());
const noteResults = shallowRef<Misskey.entities.Note[]>([]);
const userResults = ref<Misskey.entities.UserDetailed[]>([]);
const tagResults = ref<string[]>([]);
const categoryNotes = shallowRef<Misskey.entities.Note[]>([]);
const exploreLoading = ref(false);
const recommendedUsers = ref<Misskey.entities.UserDetailed[]>([]);
const discoverySections = ref<DiscoverySections>({
	trends: {
		popularSearches: [],
		recentTerms: [],
		hashtags: [],
	},
	coverNotes: [],
	hotNotes: [],
	tutorialNotes: [],
	channels: [],
	users: [],
});
const searchTrends = ref<{
	popularSearches: string[];
	recentTerms: string[];
	hashtags: string[];
}>({
	popularSearches: [],
	recentTerms: [],
	hashtags: [],
});
let exploreRequestId = 0;
let searchRequestId = 0;

const exploreTabs = computed(() => [{
	key: 'forYou' as const,
	title: i18n.ts.homeTimelineForYou,
}, {
	key: 'trending' as const,
	title: i18n.ts.exploreTrending,
}, {
	key: 'messages' as const,
	title: i18n.ts.exploreMessages,
}, {
	key: 'sports' as const,
	title: i18n.ts.exploreSports,
}, {
	key: 'entertainment' as const,
	title: i18n.ts.exploreEntertainment,
}, {
	key: 'games' as const,
	title: i18n.ts.exploreGames,
}]);

const searchEmpty = computed(() => !searchLoading.value && submittedQuery.value.length > 0 && noteResults.value.length === 0 && userResults.value.length === 0 && tagResults.value.length === 0);
const searchHistoryRows = computed(() => searchHistory.value.filter(term => term !== submittedQuery.value).slice(0, 4));
const filteredTrendRows = computed(() => buildSearchTrendRows(searchTrends.value, 10));
const featureNote = computed(() => {
	const candidates = uniqueNotes([
		...categoryNotes.value,
		...discoverySections.value.coverNotes,
		...discoverySections.value.hotNotes,
		...discoverySections.value.tutorialNotes,
	]).filter(isGoodFeatureNote);
	return candidates.find(note => getNoteFeatureImage(note) != null) ?? candidates[0] ?? null;
});
const featureImageUrl = computed(() => featureNote.value == null ? '/client-assets/fedi.jpg' : getNoteFeatureImage(featureNote.value) ?? '/client-assets/fedi.jpg');
const featureTitle = computed(() => featureNote.value == null ? '' : getFeatureNoteTitle(featureNote.value));
const featureKicker = computed(() => i18n.ts.whatsHappeningNow);
const featureMeta = computed(() => {
	if (featureNote.value == null) return '';
	return featureNote.value.user.name ?? featureNote.value.user.username;
});
const activeSectionTitle = computed(() => tab.value === 'trending' ? i18n.ts.exploreTrending : tab.value === 'messages' ? i18n.ts.exploreMessages : tab.value === 'sports' ? i18n.ts.exploreSports : tab.value === 'entertainment' ? i18n.ts.exploreEntertainment : tab.value === 'games' ? i18n.ts.exploreGames : i18n.ts.todayNews);
const activeNotes = computed(() => {
	if (categoryNotes.value.length > 0) return categoryNotes.value;
	if (tab.value === 'trending') return discoverySections.value.hotNotes;
	if (tab.value === 'forYou') return discoverySections.value.tutorialNotes.length > 0 ? discoverySections.value.tutorialNotes : discoverySections.value.hotNotes;
	return discoverySections.value.tutorialNotes.length > 0 ? discoverySections.value.tutorialNotes : discoverySections.value.hotNotes;
});
const categoryEmpty = computed(() => !exploreLoading.value && submittedQuery.value.length === 0 && tab.value !== 'forYou' && categoryNotes.value.length === 0);
const visibleChannels = computed(() => discoverySections.value.channels.slice(0, discoverySectionLimit));
const sideChannels = computed(() => visibleChannels.value.slice(0, sideChannelLimit));
const hasExploreContent = computed(() => filteredTrendRows.value.length > 0 || activeNotes.value.length > 0 || visibleChannels.value.length > 0 || recommendedUsers.value.length > 0);
const showExploreLoading = computed(() => exploreLoading.value && !hasExploreContent.value);
const exploreEmpty = computed(() => !exploreLoading.value && submittedQuery.value.length === 0 && !categoryEmpty.value && !hasExploreContent.value);

watch(() => props.initialTab, (value) => {
	const nextTab = normalizeTab(value);
	if (tab.value !== nextTab) tab.value = nextTab;
}, { immediate: true });

watch(() => props.query, (query) => {
	searchQuery.value = query ?? '';
	if (searchQuery.value.trim().length > 0) {
		runSearch(searchQuery.value);
	} else {
		clearSearch(false);
	}
}, { immediate: true });

watch(tab, () => {
	loadExploreData();
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

function normalizeTab(value?: string): ExploreTab {
	if (value === 'trending' || value === 'messages' || value === 'sports' || value === 'entertainment' || value === 'games') return value;
	return 'forYou';
}

function submitSearch(): void {
	const query = searchQuery.value.trim();
	if (query.length === 0) return;
	router.push(buildExplorePath(tab.value, query));
	runSearch(query);
}

async function runSearch(rawQuery: string): Promise<void> {
	const query = rawQuery.trim();
	if (query.length === 0) {
		clearSearch(false);
		return;
	}
	submittedQuery.value = query;
	searchQuery.value = query;
	saveSearchHistory(query);
	searchLoading.value = true;
	const requestId = ++searchRequestId;
	noteResults.value = [];
	userResults.value = [];
	tagResults.value = [];

	const userQuery = query.startsWith('@') ? query.slice(1) : query;
	const tagQuery = query.startsWith('#') ? query.slice(1) : query;
	try {
		const [notes, users, tags] = await Promise.all([
			misskeyApi<Misskey.entities.Note[]>('notes/search', {
				query,
				limit: 12,
				order: 'desc',
			}).catch(() => []),
			misskeyApi<Misskey.entities.UserDetailed[]>('users/search', {
				query: userQuery,
				origin: 'combined',
				limit: 6,
				detail: true,
			}).catch(() => []),
			misskeyApi<string[]>('hashtags/search', {
				query: tagQuery,
				limit: 12,
			}).catch(() => []),
		]);

		if (requestId !== searchRequestId) return;
		noteResults.value = notes;
		userResults.value = users;
		tagResults.value = mergeSearchTags(tags, notes, tagQuery);
	} finally {
		if (requestId === searchRequestId) searchLoading.value = false;
	}
}

function mergeSearchTags(tags: string[], notes: Misskey.entities.Note[], query: string): string[] {
	const normalizedQuery = query.trim().replace(/^#/, '').toLowerCase();
	const merged = new Set(tags);
	for (const note of notes) {
		for (const tag of note.tags ?? []) {
			if (normalizedQuery.length === 0 || tag.toLowerCase().includes(normalizedQuery)) {
				merged.add(tag);
			}
		}
	}
	return [...merged].slice(0, 12);
}

function clearSearch(updateRoute = true): void {
	searchRequestId++;
	searchLoading.value = false;
	submittedQuery.value = '';
	searchQuery.value = '';
	noteResults.value = [];
	userResults.value = [];
	tagResults.value = [];
	if (updateRoute) router.push(buildExplorePath(tab.value));
}

function focusSearchInput(): void {
	searchInputEl.value?.focus();
}

function openFeatureNote(): void {
	if (featureNote.value == null) return;
	router.push(`/notes/${featureNote.value.id}`);
}

function openTrend(type: 'search' | 'tag', term: string): void {
	if (type === 'tag') {
		router.push(`/tags/${encodeURIComponent(term)}`);
	} else {
		searchQuery.value = term;
		router.push(buildExplorePath(tab.value, term));
		runSearch(term);
	}
}

async function hideTrend(term: string): Promise<void> {
	if (!iAmAdmin) return;
	const { canceled } = await os.confirm({
		type: 'warning',
		title: '隐藏热词',
		text: `只会从热门讨论、首页搜索推荐和探索页展示中隐藏“${term}”，不会删除帖子，也不影响手动搜索。`,
		okText: i18n.ts.hide,
	});
	if (canceled) return;

	removeLocalTrend(term);
	await os.apiWithDialog<{ hiddenSearchTrendTerms: string[] }, 'admin/search-trends/hide'>('admin/search-trends/hide', { term });
	await loadExploreData();
}

function removeLocalTrend(term: string): void {
	const remove = (items: string[]) => items.filter(item => item !== term);
	searchTrends.value = {
		popularSearches: remove(searchTrends.value.popularSearches),
		recentTerms: remove(searchTrends.value.recentTerms),
		hashtags: remove(searchTrends.value.hashtags),
	};
}

function openSearchHistory(term: string): void {
	searchQuery.value = term;
	router.push(buildExplorePath(tab.value, term));
	runSearch(term);
}

function removeSearchHistory(term: string): void {
	searchHistory.value = searchHistory.value.filter(item => item !== term);
	miLocalStorage.setItem(searchHistoryStorageKey, JSON.stringify(searchHistory.value));
}

function readSearchHistory(): string[] {
	try {
		const value = miLocalStorage.getItemAsJson<string[]>(searchHistoryStorageKey);
		if (!Array.isArray(value)) return [];
		return value.filter(item => typeof item === 'string' && item.trim().length > 0).slice(0, 8);
	} catch {
		miLocalStorage.removeItem(searchHistoryStorageKey);
		return [];
	}
}

function saveSearchHistory(query: string): void {
	const normalized = query.trim();
	if (normalized.length === 0) return;
	searchHistory.value = [normalized, ...searchHistory.value.filter(item => item !== normalized)].slice(0, 8);
	miLocalStorage.setItem(searchHistoryStorageKey, JSON.stringify(searchHistory.value));
}

function selectTab(nextTab: ExploreTab): void {
	tab.value = nextTab;
	router.push(buildExplorePath(nextTab, submittedQuery.value || undefined));
}

function buildExplorePath(nextTab: ExploreTab, query?: string): string {
	const params = new URLSearchParams();
	if (nextTab !== 'forYou') params.set('tab', nextTab);
	if (query && query.trim().length > 0) params.set('query', query.trim());
	const queryString = params.toString();
	return queryString.length > 0 ? `/explore?${queryString}` : '/explore';
}

async function loadExploreData(): Promise<void> {
	const currentTab = tab.value;
	const requestId = ++exploreRequestId;
	exploreLoading.value = true;
	try {
		const [sections, notes] = await Promise.all([
			misskeyApi<DiscoverySections>('notes/discovery-sections', { limit: discoverySectionLimit }).catch(() => null),
			misskeyApi<Misskey.entities.Note[]>('notes/recommended-timeline', {
				scope: 'mixed',
				surface: 'explore',
				category: currentTab,
				limit: categoryNoteLimit,
				withRenotes: false,
				offset: Math.floor(Date.now() / (1000 * 60 * 5)) % 5,
			}).catch(() => []),
		]);
		if (requestId !== exploreRequestId || tab.value !== currentTab) return;
		categoryNotes.value = notes;
		if (sections) {
			discoverySections.value = sections;
			searchTrends.value = filterTrendsForTab(sections.trends, currentTab);
			recommendedUsers.value = sections.users;
		} else {
			searchTrends.value = collectTrendsFromNotes(notes, currentTab);
		}
	} finally {
		if (requestId === exploreRequestId && tab.value === currentTab) exploreLoading.value = false;
		await nextTick();
		syncRightRailStickyBounds();
	}
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

function filterTrendsForTab(trends: DiscoverySections['trends'], currentTab: ExploreTab): DiscoverySections['trends'] {
	if (currentTab === 'forYou' || currentTab === 'trending') return trends;
	const matches = (term: string) => matchesCategory(term, currentTab);
	return {
		popularSearches: trends.popularSearches.filter(matches),
		recentTerms: trends.recentTerms.filter(matches),
		hashtags: trends.hashtags.filter(matches),
	};
}

function collectTrendsFromNotes(notes: Misskey.entities.Note[], currentTab: ExploreTab): DiscoverySections['trends'] {
	const terms = new Set<string>();
	const hashtags = new Set<string>();
	for (const note of notes) {
		for (const tag of note.tags ?? []) {
			if (currentTab === 'forYou' || currentTab === 'trending' || matchesCategory(tag, currentTab)) hashtags.add(tag);
		}
		const text = note.text?.replace(/\s+/g, ' ').trim();
		if (text && (currentTab === 'forYou' || currentTab === 'trending' || matchesCategory(text, currentTab))) terms.add(text.slice(0, 28));
	}
	return {
		popularSearches: [],
		recentTerms: [...terms].slice(0, 8),
		hashtags: [...hashtags].slice(0, 8),
	};
}

function uniqueNotes(notes: Misskey.entities.Note[]): Misskey.entities.Note[] {
	const seen = new Set<string>();
	const result: Misskey.entities.Note[] = [];
	for (const note of notes) {
		if (seen.has(note.id)) continue;
		seen.add(note.id);
		result.push(note);
	}
	return result;
}

function getNoteFeatureImage(note: Misskey.entities.Note): string | null {
	const image = note.files?.find(file => file.type.startsWith('image/') && !file.isSensitive);
	return image?.thumbnailUrl ?? image?.url ?? null;
}

function getFeatureNoteTitle(note: Misskey.entities.Note): string {
	const text = (note.cw ?? note.text ?? '').replace(/\s+/g, ' ').trim();
	if (text.length === 0) return note.user.name ?? note.user.username;
	return text.length > 84 ? `${text.slice(0, 84)}...` : text;
}

function isGoodFeatureNote(note: Misskey.entities.Note): boolean {
	const text = (note.cw ?? note.text ?? '').replace(/\s+/g, ' ').trim();
	if (text.length === 0) return false;
	if (note.user.isBot) return false;
	if (/codex\s*verify|verify\s*channel/i.test(text)) return false;
	if (/^\s*#?\d+[\d\s._\-·・,，。:：/\\|()[\]{}]*$/i.test(text)) return false;
	if (/^[a-z0-9\s._\-·・,，。:：/\\|()[\]{}]{18,}$/i.test(text) && !/[一-龥ぁ-んァ-ヶ]/.test(text)) return false;
	const plain = text.replace(/https?:\/\/\S+/g, '').trim();
	const hasImage = getNoteFeatureImage(note) != null;
	const engagement = note.repliesCount + note.renoteCount + note.reactionCount;
	return hasImage || engagement > 0 || plain.length >= 12;
}

function matchesCategory(value: string, currentTab: ExploreTab): boolean {
	const normalized = value.toLowerCase();
	if (currentTab === 'sports') return /运动|体育|赛事|比赛|球队|足球|篮球|网球|跑步|健身|训练|sports?|football|basketball|tennis|fitness|workout|match|team/.test(normalized);
	if (currentTab === 'entertainment') return /娱乐|电影|音乐|动漫|动画|漫画|综艺|追剧|明星|剧集|影院|演唱会|movie|film|music|anime|comic|show|entertainment|concert/.test(normalized);
	if (currentTab === 'games') return /游戏|我的世界|麦块|方块|服务器|电竞|开黑|手游|主机|单机|网游|minecraft|mine.?craft|mc服务器|apex|apex\s*legends|league\s*of\s*legends|\blol\b|riot\s*games|valorant|gta\s*5?|gtav|gta\s*online|rockstar|steam|pc\s*gaming|playstation|xbox|nintendo|switch|fortnite|roblox|counter\s*strike|\bcs2\b|dota\s*2|overwatch|game\s*dev|gamedev|indie\s*games?|gaming|videogames?|esports?/.test(normalized);
	if (currentTab === 'messages') return /公告|讨论|问题|bug|更新|社区|通知|反馈|announcement|discussion|issue|update|community|notice|feedback/.test(normalized);
	return true;
}

definePage(() => ({
	title: i18n.ts.explore,
	icon: 'ti ti-search',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.exploreShell {
	--explore-rail-width: clamp(240px, 18%, 340px);
	--explore-column-gap: clamp(14px, 1vw, 24px);

	box-sizing: border-box;
	width: 100%;
	margin-inline: auto;
	display: grid;
	grid-template-columns: minmax(0, 1fr) var(--explore-rail-width);
	column-gap: var(--explore-column-gap);
	align-items: start;
	min-height: 100%;
}

.exploreMain {
	min-width: 0;
	background: var(--MI_THEME-bg);
	min-height: 100cqh;
}

.exploreHeader {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	background: color-mix(in srgb, var(--MI_THEME-bg) 85%, transparent);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.searchRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 38px;
	gap: 10px;
	align-items: center;
	padding: 10px 12px;
}

.searchInput {
	min-width: 0;
}

.settingsButton {
	width: 38px;
	height: 38px;
	border-radius: 999px;
	color: var(--MI_THEME-fg);
}

.settingsButton:hover {
	background: var(--MI_THEME-panelHighlight);
}

.exploreTabs {
	display: grid;
	grid-template-columns: repeat(5, minmax(max-content, 1fr));
	min-height: 50px;
	overflow-x: auto;
}

/* 与 timeline.vue 同款 scope 行;复用首页观感 */
.scopeRow {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 8px 16px;
	flex-wrap: wrap;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.scopeChip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	border-radius: 999px;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.88em;
	white-space: nowrap;
	cursor: pointer;

	&:hover { background: var(--MI_THEME-panelHighlight); }
}

.scopeChipIcon {
	font-size: 1em;
}

.scopeChipActive {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);

	&:hover { background: var(--MI_THEME-accent); }
}

.scopeRowRight {
	margin-left: auto;
	display: inline-flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

@media (max-width: 600px) {
	.scopeRow { padding: 8px 10px; gap: 6px; }
	.scopeChip { padding: 5px 10px; font-size: 0.85em; }
	.scopeRowRight { width: 100%; margin-left: 0; }
}

.exploreTab {
	position: relative;
	padding: 0 16px;
	font-weight: 700;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.exploreTab:hover {
	background: var(--MI_THEME-panelHighlight);
}

.exploreTabActive {
	color: var(--MI_THEME-fg);
}

.exploreTabActive::after {
	content: "";
	position: absolute;
	left: 50%;
	bottom: 0;
	width: 56px;
	height: 4px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	transform: translateX(-50%);
}

.searchShortcutPanel {
	display: flex;
	flex-direction: column;
	margin: 12px 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.shortcutHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px 4px;
}

.shortcutHeader h2 {
	margin: 4px 0 0;
	font-size: 1.05em;
	line-height: 1.25;
}

.shortcutGrid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	padding: 8px 12px 12px;
}

.historyItem {
	min-width: 0;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 10px;
	background: var(--MI_THEME-bg);
	transition: background .1s, border-color .1s;
}

.historyItem {
	display: grid;
	grid-template-columns: minmax(0, 1fr) 34px;
	align-items: stretch;
}

.shortcutMain {
	display: grid;
	grid-template-columns: 30px minmax(0, 1fr);
	align-items: center;
	gap: 10px;
	min-width: 0;
	min-height: 58px;
	padding: 10px 0 10px 12px;
	text-align: left;
	color: inherit;
}

.historyItem:hover {
	background: var(--MI_THEME-panelHighlight);
	border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, var(--MI_THEME-fg));
}

.shortcutIcon {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
}

.shortcutText {
	min-width: 0;
	color: var(--MI_THEME-fg);
	font-weight: 800;
	line-height: 1.25;
	overflow: hidden;
	overflow-wrap: anywhere;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
}

.historyRemove {
	display: grid;
	place-items: center;
	align-self: center;
	justify-self: center;
	width: 28px;
	height: 28px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.historyRemove:hover {
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-panelHighlight);
}

.featurePanel {
	position: relative;
	display: flex;
	align-items: flex-end;
	min-height: 300px;
	aspect-ratio: 16 / 9;
	margin: 12px 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background-color: var(--MI_THEME-panel);
	background-position: center;
	background-size: cover;
	overflow: clip;
	color: #fff;
}

.featurePanelClickable {
	cursor: pointer;
}

.featurePanelClickable:hover .featureTitle {
	text-decoration: underline;
	text-decoration-thickness: 2px;
	text-underline-offset: 3px;
}

.featurePanelLoading {
	background: linear-gradient(135deg, color-mix(in srgb, var(--MI_THEME-accent) 50%, #1d1d1d), color-mix(in srgb, var(--MI_THEME-panel) 72%, #111));
}

.featureShade {
	position: absolute;
	inset: 0;
	background: linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, .08) 34%, rgba(0, 0, 0, .72) 82%, rgba(0, 0, 0, .86) 100%);
}

.featureContent {
	position: relative;
	z-index: 1;
	display: grid;
	gap: 8px;
	width: 100%;
	padding: 22px;
	text-shadow: 0 1px 18px rgba(0, 0, 0, .35);
}

.featureKicker {
	font-size: .82em;
	font-weight: 800;
	text-transform: uppercase;
	opacity: .92;
}

.featureTitle {
	display: -webkit-box;
	margin: 0;
	max-width: 92%;
	overflow: hidden;
	overflow-wrap: anywhere;
	-webkit-line-clamp: 3;
	line-clamp: 3;
	-webkit-box-orient: vertical;
	font-size: clamp(1.45rem, 3.2vw, 2.35rem);
	font-weight: 900;
	line-height: 1.1;
}

.featureMeta {
	display: inline-flex;
	align-items: center;
	gap: 7px;
	max-width: 100%;
	min-width: 0;
	font-weight: 700;
	opacity: .9;
}

.featureMeta > span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.featureSkeletonKicker {
	width: 28%;
	background: rgba(255, 255, 255, .28);
}

.featureSkeletonTitle {
	width: 74%;
	height: 28px;
	background: rgba(255, 255, 255, .34);
}

.featureSkeletonMeta {
	width: 42%;
	background: rgba(255, 255, 255, .24);
}

.sectionEyebrow {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .78em;
	font-weight: 800;
	text-transform: uppercase;
}

.skeletonPanel {
	margin: 0 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
	padding: 16px;
}

.skeletonHeader {
	display: grid;
	gap: 10px;
	margin-bottom: 16px;
}

.skeletonLine,
.skeletonRow,
.sideSkeletonRow {
	display: block;
	border-radius: 999px;
	background: linear-gradient(90deg, var(--MI_THEME-bg), var(--MI_THEME-panelHighlight), var(--MI_THEME-bg));
	background-size: 240% 100%;
	animation: exploreSkeleton 1.25s ease-in-out infinite;
}

.skeletonLine {
	width: 58%;
	height: 14px;
}

.skeletonLineShort {
	width: 32%;
}

.skeletonRows,
.sideSkeletonList {
	display: grid;
	gap: 12px;
}

.skeletonRow {
	height: 48px;
	border-radius: 12px;
}

.sideSkeletonList {
	padding: 10px 16px 14px;
}

.sideSkeletonRow {
	height: 38px;
	border-radius: 10px;
}

@keyframes exploreSkeleton {
	0% {
		background-position: 100% 0;
	}

	100% {
		background-position: -100% 0;
	}
}

.newsList {
	margin: 0 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.newsList h2 {
	margin: 4px 0 0;
	font-size: 1.15em;
	line-height: 1.25;
}

.sectionHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px 16px 10px;
}

.newsRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	width: 100%;
	gap: 8px;
	padding: 12px 16px;
	text-align: left;
	transition: background .1s;
}

.newsRow:hover {
	background: var(--MI_THEME-panelHighlight);
}

.newsRow + .newsRow {
	border-top: solid 1px var(--MI_THEME-divider);
}

.newsTitle {
	font-weight: 850;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.newsMeta {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .9em;
}

.discoverySection {
	margin: 0 12px 14px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.discoverySection h2 {
	margin: 4px 0 0;
	font-size: 1.15em;
	line-height: 1.25;
}

.noteList {
	padding: 0 12px 12px;
}

.channelGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr));
	align-items: stretch;
	gap: 12px;
	padding: 0 16px 16px;
}

.channelCard {
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	align-items: start;
	min-width: 0;
	min-height: 142px;
	grid-template-rows: 56px minmax(0, auto) auto;
	padding: 0;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 12px;
	color: inherit;
	background: var(--MI_THEME-bg);
	overflow: clip;
	transition: background .1s, border-color .1s, transform .1s;
}

.channelCard:hover {
	background: var(--MI_THEME-panelHighlight);
	border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, var(--MI_THEME-fg));
	transform: translateY(-1px);
}

.channelBanner {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	box-sizing: border-box;
	width: calc(100% + 2px);
	height: 56px;
	margin: -1px -1px 0;
	padding: 0 16px;
	border-radius: 12px 12px 0 0;
	color: #fff;
}

.channelBanner > i {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 10px;
	background: rgba(0, 0, 0, .14);
}

.channelName {
	min-width: 0;
	padding: 14px 14px 0;
	font-weight: 800;
	overflow: hidden;
	overflow-wrap: anywhere;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
}

.channelMeta {
	min-width: 0;
	padding: 4px 14px 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: .86em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.searchPanel {
	margin: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	padding: 16px;
	background: var(--MI_THEME-panel);
}

.searchPanelHeader {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 16px;
}

.searchPanelTitle {
	font-size: 1.2em;
	font-weight: 800;
}

.searchPanelCaption {
	margin-top: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.searchPanelActions,
.searchEmptyActions,
.categoryEmptyActions,
.tags {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.panelAction,
.searchEmptyButton,
.categoryEmptyButton,
.tagChip {
	border-radius: 999px;
	padding: 8px 12px;
	background: var(--MI_THEME-panel);
}

.searchEmpty,
.categoryEmpty {
	display: grid;
	justify-items: center;
	gap: 12px;
	padding: 48px 16px;
	text-align: center;
	color: var(--MI_THEME-fg);
}

.searchEmpty > i,
.categoryEmpty > i {
	font-size: 2.2em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.searchEmptyTitle,
.categoryEmptyTitle {
	font-size: 1.25em;
	font-weight: 800;
}

.searchEmptyText,
.categoryEmptyText {
	color: var(--MI_THEME-fgTransparentWeak);
}

.searchResults,
.resultSection {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.resultSection + .resultSection {
	margin-top: 18px;
	padding-top: 18px;
	border-top: solid 1px var(--MI_THEME-divider);
}

.resultSectionTitle {
	font-weight: 800;
}

.searchUser,
.userRow {
	display: grid;
	grid-template-columns: 42px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
}

.searchUserAvatar,
.userAvatar {
	width: 40px;
	height: 40px;
}

.searchUserBody,
.userBody {
	min-width: 0;
	color: inherit;
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

.trendRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	width: 100%;
	gap: 8px;
	padding: 10px 16px;
	text-align: left;
	transition: background .1s;
}

.trendBody {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.trendRow:hover,
.userRow:hover,
.sideChannel:hover {
	background: var(--MI_THEME-panelHighlight);
}

.trendTitle {
	font-weight: 800;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.trendMeta {
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.trendHideButton {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.trendHideButton:hover {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
}

.userRow {
	padding: 10px 16px;
	transition: background .1s;
}

.sideChannel {
	display: grid;
	grid-template-columns: 38px minmax(0, 1fr);
	gap: 10px;
	align-items: center;
	padding: 10px 16px;
	color: inherit;
	transition: background .1s;
}

.sideChannelIcon {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 10px;
	color: #fff;
}

.sideChannelBody {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
}

.sideChannelName {
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.sideChannelMeta {
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.followButton {
	border-radius: 999px;
	font-weight: 700;
}

@media (max-width: 1450px) {
	.exploreShell {
		display: block;
		width: 100%;
	}

	.exploreMain {
		border-left: 0;
		border-right: 0;
	}

	.rightRail {
		display: none;
	}
}

@media (max-width: 500px) {
	.searchRow {
		padding: 8px 12px;
	}

	.exploreTab {
		padding: 0 14px;
	}

	.featurePanel,
	.newsList,
	.discoverySection,
	.searchShortcutPanel,
	.searchPanel {
		margin-left: 8px;
		margin-right: 8px;
	}

	.featurePanel {
		min-height: 230px;
	}

	.channelGrid {
		grid-template-columns: 1fr;
	}

	.shortcutGrid {
		grid-template-columns: 1fr;
	}
}
</style>
