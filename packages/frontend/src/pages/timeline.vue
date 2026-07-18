<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader ref="pageComponent" :actions="[]" :tabs="[]" :swipable="false" :hideTitle="true" :scrollKey="timelineScrollKey">
	<div class="xTimelineWideShell" :class="$style.shell">
		<main :class="$style.main" @wheel.passive="onMainWheel">
			<!-- 移动端搜索框:桌面右栏自带搜索,所以这里只在窄屏显示 -->
			<form :class="$style.mobileSearch" @submit.prevent="submitMobileSearch">
				<i class="ph-magnifying-glass ph-bold ph-lg" :class="$style.mobileSearchIcon"></i>
				<input
					v-model="mobileSearchQuery"
					type="search"
					:placeholder="i18n.ts.search"
					:class="$style.mobileSearchInput"
					autocapitalize="off"
					autocorrect="off"
					spellcheck="false"
				/>
				<button v-if="mobileSearchQuery.length > 0" type="button" :class="$style.mobileSearchClear" @click="mobileSearchQuery = ''">
					<i class="ph-x ph-bold ph-lg"></i>
				</button>
			</form>

			<header :class="$style.tabs" role="tablist" :aria-label="i18n.ts.home">
				<button
					v-for="tab in homeTabs"
					:key="tab.key"
					class="_button"
					:class="[$style.tab, { [$style.tabActive]: homeTab === tab.key }]"
					role="tab"
					:aria-selected="homeTab === tab.key"
					@click="homeTab = tab.key"
				>
					<i :class="['ti', tab.icon, $style.tabIcon]"></i>
					<span :class="$style.tabLabel">{{ tab.title }}</span>
				</button>
			</header>

			<!-- scope 切换:本地+联邦 / 本地服务器 / 联邦服务器 —— 所有 tab 都展示 -->
			<nav :class="$style.subTabs" role="tablist" :aria-label="i18n.ts._categories?.scopeLabel ?? '范围'">
				<button
					v-for="s in scopeTabs"
					:key="s.key"
					class="_button"
					:class="[$style.subTab, { [$style.subTabActive]: scope === s.key }]"
					role="tab"
					:aria-selected="scope === s.key"
					@click="scope = s.key"
				>
					<i :class="['ti', s.icon, $style.subTabIcon]"></i>
					<span>{{ s.title }}</span>
				</button>
				<div :class="$style.subTabsRight">
					<SkAutoTranslateSwitch/>
					<SkTimelineViewSwitch/>
				</div>
			</nav>

			<!-- 热门 # 标签行 —— 所有 tab 都展示 -->
			<nav :class="$style.tagChips" :aria-label="i18n.ts._categories?.hotTags ?? '热门标签'">
				<button
					class="_button"
					:class="[$style.tagChip, { [$style.tagChipActive]: categoryHashtag === null }]"
					@click="categoryHashtag = null"
				>
					<i class="ph-list ph-bold ph-lg"></i>
					<span>{{ i18n.ts._categories?.all ?? '全部' }}</span>
				</button>

				<!-- 置顶标签(用户钉的) -->
				<button
					v-for="tag in pinnedTags"
						:key="'pin-' + tag"
						class="_button"
						:class="[$style.tagChip, $style.tagChipPinned, { [$style.tagChipActive]: categoryHashtag === tag }]"
						:title="i18n.ts._categories?.unpinHint ?? '右键取消置顶'"
						@click="categoryHashtag = tag"
						@contextmenu.prevent="togglePinTag(tag)"
					>
					<i class="ph-push-pin-simple ph-bold ph-lg"></i>
					<span>#{{ tag }}</span>
				</button>

				<!-- 热门标签 -->
				<button
					v-for="t in displayedHotTags"
						:key="t.tag"
						class="_button"
						:class="[$style.tagChip, { [$style.tagChipActive]: categoryHashtag === t.tag, [$style.tagChipHot]: t.isHot }]"
						:title="(t.isHot ? '🔥 ' : '') + (t.count > 0 ? `${t.count}` : '') + ' · ' + (i18n.ts._categories?.pinHint ?? '右键置顶')"
						@click="categoryHashtag = t.tag"
						@contextmenu.prevent="togglePinTag(t.tag)"
					>
					<i v-if="t.isHot" class="ph-flame ph-bold ph-lg" :class="$style.hotIcon"></i>
					<span>#{{ t.tag }}</span>
				</button>

				<!-- 展开/收起更多 -->
				<button
					v-if="hotTags.length > 8"
					class="_button"
					:class="$style.tagChipMore"
					@click="expandHotTags = !expandHotTags"
				>
					<i :class="expandHotTags ? 'ph-caret-up ph-bold ph-lg' : 'ph-caret-down ph-bold ph-lg'"></i>
					<span>{{ expandHotTags ? (i18n.ts._categories?.collapse ?? '收起') : (i18n.ts._categories?.expand ?? '更多') }}</span>
				</button>

				<!-- 手动刷新 -->
					<button
						class="_button"
						:class="$style.tagChipMore"
						:disabled="hotTagsLoading"
						:title="i18n.ts.reload"
						@click="fetchHotTags()"
					>
					<i :class="['ph-arrows-clockwise ph-bold ph-lg', { [$style.spin]: hotTagsLoading }]"></i>
				</button>

				<span v-if="hotTagsLoading && hotTags.length === 0" :class="$style.tagLoading">{{ i18n.ts.loading }}…</span>
				<span v-else-if="!hotTagsLoading && hotTags.length === 0 && pinnedTags.length === 0" :class="$style.tagLoading">{{ i18n.ts._categories?.empty ?? '暂无热门标签' }}</span>
				</nav>

				<section v-if="$i" :class="$style.composer">
				<MkPostForm
					:class="$style.composerForm"
					fixed
					homeStyle
					:autofocus="false"
					:placeholder="i18n.ts.whatsHappening"
					@posted="onComposerPosted"
				/>
			</section>

			<button v-if="queue > 0" class="_button" :class="$style.newPosts" @click="top">
				<i class="ti ti-arrow-up"></i>
				<span>{{ i18n.tsx.showNPosts({ n: queue }) }}</span>
			</button>

			<MkTimeline
				ref="tlComponent"
				:key="timelineKey"
				class="xFeed"
				:class="$style.timeline"
				:src="timelineSrc"
				:withRenotes="withRenotes"
				:withReplies="withReplies"
				:withSensitive="withSensitive"
				:onlyFiles="onlyFiles"
				:withBots="withBots"
				:discoveryMode="discoveryMode"
					recommendationSurface="home"
					recommendationCategory="forYou"
					:recommendationSort="homeTab === 'latestReplies' ? 'latestReply' : 'personalized'"
					:includeFollowedChannels="homeTab !== 'following'"
					:sound="homeTab === 'following'"
					:tag="categoryHashtag ?? undefined"
					:tagScope="categoryHashtag ? (scope === 'local' ? 'local' : scope === 'global' ? 'remote' : undefined) : undefined"
				@queue="queueUpdated"
			/>
		</main>

		<aside ref="rightRailEl" :class="$style.rightRail" @wheel="onRightRailWheel">
			<form :class="$style.searchBox" @submit.prevent="submitSidebarSearch">
				<MkInput v-model="sidebarSearchQuery" type="search" :placeholder="i18n.ts.search">
					<template #prefix><i class="ti ti-search"></i></template>
				</MkInput>
			</form>

			<section v-if="trendRows.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.hotDiscussions }}</div>
				<div :class="$style.sideList">
					<button
						v-for="trend in trendRows"
						:key="`${trend.type}:${trend.term}`"
						class="_button"
						:class="$style.trendRow"
						@click="openTrend(trend.type, trend.term)"
					>
						<span :class="$style.trendBody">
							<span :class="$style.trendMeta">{{ trend.label }}</span>
							<span :class="$style.trendTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
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
				</div>
			</section>

			<section v-if="visibleChannels.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.recommendedChannels }}</div>
				<div :class="$style.sideList">
					<MkA v-for="channel in visibleChannels" :key="channel.id" :to="`/channels/${channel.id}`" :class="$style.channelRow">
						<span :class="$style.channelIcon" :style="{ background: channel.color }"><i class="ti ti-device-tv"></i></span>
						<span :class="$style.channelBody">
							<span :class="$style.channelName">{{ channel.name }}</span>
							<span :class="$style.channelMeta">{{ i18n.tsx.channelStats({ notes: channel.notesCount, users: channel.usersCount }) }}</span>
						</span>
					</MkA>
				</div>
			</section>

			<section v-if="visibleRecommendedUsers.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.whoToFollow }}</div>
				<div :class="$style.sideList">
					<div v-for="user in visibleRecommendedUsers" :key="user.id" :class="$style.userRow">
						<MkAvatar :user="user" :class="$style.userAvatar" link preview/>
						<MkA :to="userPage(user)" :class="$style.userBody">
							<MkUserName :user="user" :nowrap="true" :class="$style.userName"/>
							<MkAcct :user="user" :class="$style.userAcct"/>
						</MkA>
						<MkFollowButton :user="user" :class="$style.followButton" mini/>
					</div>
				</div>
			</section>

			<section v-if="visibleTutorialNotes.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.tutorialsAndResources }}</div>
				<div :class="$style.sideList">
					<MkA v-for="note in visibleTutorialNotes" :key="note.id" :to="`/notes/${note.id}`" :class="$style.noteTeaser">
						<span :class="$style.noteTeaserText">{{ summarizeNote(note) }}</span>
						<span :class="$style.noteTeaserMeta">{{ i18n.tsx.noteStats({ replies: note.repliesCount, renotes: note.renoteCount }) }}</span>
					</MkA>
				</div>
			</section>
		</aside>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onActivated, onMounted, onUnmounted, provide, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkTimeline from '@/components/MkTimeline.vue';
import MkInput from '@/components/MkInput.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { $i, iAmAdmin } from '@/i.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router';
import { misskeyApi } from '@/utility/misskey-api.js';
import SkTimelineViewSwitch from '@/components/SkTimelineViewSwitch.vue';
import SkAutoTranslateSwitch from '@/components/SkAutoTranslateSwitch.vue';
import { userPage } from '@/filters/user.js';
import * as os from '@/os.js';
import { buildSearchTrendRows } from '@/utility/search-trends.js';
import { miLocalStorage } from '@/local-storage.js';

provide('shouldOmitHeaderTitle', true);

type HomeTab = 'forYou' | 'following' | 'latestReplies';
// 全部=不区分,本地=只本站原创,联合=只远程联合
type Scope = 'all' | 'local' | 'global';
type DiscoverySections = Misskey.Endpoints['notes/discovery-sections']['res'];

const sidebarLimits = {
	trends: 10,
	channels: 3,
	users: 3,
	tutorialNotes: 2,
} as const;

const router = useRouter();
const tlComponent = useTemplateRef('tlComponent');
const pageComponent = useTemplateRef('pageComponent');
const rightRailEl = useTemplateRef('rightRailEl');
let rightRailResizeObserver: ResizeObserver | undefined;
let rightRailOffset = 0;
let rightRailMaxOffset = 0;
let rightRailOffsetInitialized = false;

const HOME_TAB_KEY = 'home:tab';
const HOME_SCOPE_KEY = 'home:scope';
const initialTab = (() => {
	const v = miLocalStorage.getItem(HOME_TAB_KEY) as HomeTab | 'category' | null;
	if (v === 'category') {
		miLocalStorage.setItem(HOME_TAB_KEY, 'forYou');
		return 'forYou';
	}
	return (v && ['forYou', 'following', 'latestReplies'].includes(v)) ? v : 'forYou';
})();
const initialScope = (() => {
	const v = miLocalStorage.getItem(HOME_SCOPE_KEY) as Scope | null;
	if (v === 'all' || v === 'local' || v === 'global') return v;
	return 'local'; // 默认本地服务器(用户偏好:首屏推荐先看本服)
})();
const homeTab = ref<HomeTab>(initialTab);
const scope = ref<Scope>(initialScope);
watch(homeTab, v => miLocalStorage.setItem(HOME_TAB_KEY, v));
watch(scope, v => miLocalStorage.setItem(HOME_SCOPE_KEY, v));

// === 热门 # 标签筛选 ===
const categoryHashtag = ref<string | null>(null); // null = "全部"
const hotTags = ref<Array<{ tag: string; count: number; isHot?: boolean }>>([]);
const hotTagsLoading = ref(false);
// 用户置顶的标签(全局共享 local/global),localStorage 持久化
const PINNED_TAGS_KEY = 'home:pinnedTags';
const pinnedTags = ref<string[]>((() => {
	try { return JSON.parse(miLocalStorage.getItem(PINNED_TAGS_KEY) ?? '[]'); } catch { return []; }
})());
watch(pinnedTags, v => miLocalStorage.setItem(PINNED_TAGS_KEY, JSON.stringify(v.slice(0, 32))), { deep: true });

function togglePinTag(tag: string) {
	const i = pinnedTags.value.indexOf(tag);
	if (i >= 0) pinnedTags.value = pinnedTags.value.filter(x => x !== tag);
	else pinnedTags.value = [tag, ...pinnedTags.value].slice(0, 32);
}

// 客户端算法兜底:拉最近 N 条帖子,统计 hashtag 频次
async function aggregateTagsFromNotes(scope: 'local' | 'remote'): Promise<Array<{ tag: string; count: number }>> {
	try {
		const ep = scope === 'local' ? 'notes/local-timeline' : 'notes/global-timeline';
		const notes = await misskeyApi(ep, { limit: 100 }) as Array<{ tags?: string[] }>;
		const counts = new Map<string, number>();
		for (const n of (notes ?? [])) {
			for (const t of (n.tags ?? [])) {
				if (!t) continue;
				const k = t.toLowerCase();
				counts.set(k, (counts.get(k) ?? 0) + 1);
			}
		}
		return [...counts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 16)
			.map(([tag, count]) => ({ tag, count }));
	} catch {
		return [];
	}
}

async function fetchHotTags() {
	hotTagsLoading.value = true;
	try {
		const s = scope.value;
		const isLocal = s === 'local';
		const isGlobal = s === 'global';

		// 同时拉两源,把"用户关注度高的长期标签"(hashtags/list)和"最近 100 帖里频次高的实时标签"(aggregate)合并打分。
		// 单独 hashtags/list 几乎不变 → 用户感觉"万年不变";加入 fresh 维度后,新热门话题能在 90~120s 内浮出来。
		const algoScope: 'local' | 'remote' = isGlobal ? 'remote' : 'local';
		const [longTerm, fresh] = await Promise.all([
			misskeyApi('hashtags/list', {
				sort: isLocal ? '+attachedLocalUsers' : '+attachedRemoteUsers',
				attachedToLocalUserOnly: isLocal,
				attachedToRemoteUserOnly: isGlobal,
				limit: 24,
			}).catch(() => []) as Promise<Array<{ tag: string; attachedLocalUsersCount?: number; attachedRemoteUsersCount?: number; attachedUsersCount?: number }>>,
			aggregateTagsFromNotes(algoScope),
		]);

		const scores = new Map<string, { tag: string; count: number; freshHits: number }>();
		// 长期维度:每个长期热门 tag 给一个基础分(以 attachedUsers 计)
		for (const x of (longTerm ?? [])) {
			if (!x.tag) continue;
			const c = isLocal ? (x.attachedLocalUsersCount ?? 0)
				: isGlobal ? (x.attachedRemoteUsersCount ?? 0)
				: (x.attachedUsersCount ?? 0);
			const k = x.tag.toLowerCase();
			scores.set(k, { tag: x.tag, count: c, freshHits: 0 });
		}
		// fresh 维度:最近 100 帖的频次直接加进 freshHits(权重 4 倍于长期 count,让"新热"超过"老热")
		for (const x of fresh) {
			const k = x.tag.toLowerCase();
			const cur = scores.get(k) ?? { tag: x.tag, count: 0, freshHits: 0 };
			cur.freshHits = x.count;
			scores.set(k, cur);
		}

		const merged = [...scores.values()]
			.map(x => ({ tag: x.tag, count: x.count + x.freshHits * 4, freshHits: x.freshHits }))
			.sort((a, b) => b.count - a.count)
			.slice(0, 24);

		// 标记前 3 为"热";另外 freshHits > 0 的也加 hot 红边(给新冒头的话题一个视觉提示)
		hotTags.value = merged.map((x, i) => ({ tag: x.tag, count: x.count, isHot: i < 3 || x.freshHits > 0 }));
	} catch {
		hotTags.value = [];
	} finally {
		hotTagsLoading.value = false;
	}
}

// 每 90s 自动刷新一次热门标签,避免"万年不变"。页面隐藏(切 tab 走开)时不刷,省流量。
let hotTagsRefreshTimer: number | null = null;

function startHotTagsAutoRefresh() {
	if (hotTagsRefreshTimer != null) return;
	hotTagsRefreshTimer = window.setInterval(() => {
		if (window.document.hidden) return;
		fetchHotTags();
	}, 90_000);
}

function stopHotTagsAutoRefresh() {
	if (hotTagsRefreshTimer != null) {
		window.clearInterval(hotTagsRefreshTimer);
		hotTagsRefreshTimer = null;
	}
}

// scope 变了 → 重新拉(因为不同 scope 对应不同标签数据集)
watch(scope, () => {
	categoryHashtag.value = null;
	fetchHotTags();
});
// 首次主动拉一次 + 启 90s 自动刷新
fetchHotTags();
startHotTagsAutoRefresh();

// 展开更多 + 计算展示哪些(置顶过滤掉,避免重复)
const expandHotTags = ref(false);
const displayedHotTags = computed(() => {
	const pinSet = new Set(pinnedTags.value.map(t => t.toLowerCase()));
	const list = hotTags.value.filter(t => !pinSet.has(t.tag.toLowerCase()));
	return expandHotTags.value ? list : list.slice(0, 8);
});

const queue = ref(0);
const sidebarSearchQuery = ref('');
const mobileSearchQuery = ref('');

function submitMobileSearch() {
	const q = mobileSearchQuery.value.trim();
	if (!q) return;
	// hashtag 直接进 tag 页
	if (q.startsWith('#')) {
		const tag = q.slice(1);
		if (tag) router.push(`/tags/${encodeURIComponent(tag)}`);
		return;
	}
	// 文本搜索走 /explore?tab=messages&query=...,跟探索页的搜索同一条路径(/search 的帖子检索默认关闭)
	router.push(`/explore?tab=messages&query=${encodeURIComponent(q)}`);
}

const searchTrends = ref<{
	popularSearches: string[];
	recentTerms: string[];
	hashtags: string[];
}>({
	popularSearches: [],
	recentTerms: [],
	hashtags: [],
});
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

const homeTabs = computed(() => [{
	key: 'forYou' as const,
	title: i18n.ts.homeTimelineForYou,
	icon: 'ti-sparkles',
}, {
	key: 'following' as const,
	title: i18n.ts.homeTimelineFollowing,
	icon: 'ti-user-check',
	}, {
		key: 'latestReplies' as const,
		title: i18n.ts.homeTimelineLatestReplies,
		icon: 'ti-message-circle-2',
	}]);

// 新统一 scope tabs (本地+联邦 / 本地服务器 / 联邦服务器),默认混合流
const scopeTabs = computed(() => [{
	key: 'all' as const,
	title: '全部',
	icon: 'ti-circle-dot',
}, {
	key: 'local' as const,
	title: '本地服务器',
	icon: 'ti-home',
}, {
	key: 'global' as const,
	title: '联邦服务器',
	icon: 'ti-world',
}]);

// timelineSrc 路由表:
// tag 选了走 search-by-tag(MkTimeline 内部自动接管),src 这里随便给一个不影响。
// 否则按 (tab × scope) 决定:
//   - following 永远 'home'(关注流不能强行换 scope,scope 选项仅作筛选 UI 占位)
//   - forYou / latestReplies + all → 'recommended';+local/global → discoveryMode 下的 local/global pool
const timelineSrc = computed(() => {
	if (homeTab.value === 'following') return 'home';
	// forYou / latestReplies
	if (scope.value === 'local') return 'local';
	if (scope.value === 'global') return 'global';
	return 'recommended';
});

// discoveryMode 控制是不是走 recommended-timeline 算法(local/global src + true = scope-filtered recommendation)
const discoveryMode = computed(() => {
	if (homeTab.value === 'following') return false;
	// forYou / latestReplies 永远走推荐算法
	return true;
});
const withRenotes = computed(() => store.r.tl.value.filter.withRenotes);
const withReplies = computed(() => store.r.tl.value.filter.withReplies);
const withBots = computed(() => store.r.tl.value.filter.withBots);
const onlyFiles = computed(() => store.r.tl.value.filter.onlyFiles);
const withSensitive = computed(() => store.r.tl.value.filter.withSensitive);
const timelineKey = computed(() => [
	homeTab.value,
	scope.value,
	categoryHashtag.value ?? '__all__',
	withRenotes.value,
	withReplies.value,
	withBots.value,
	onlyFiles.value,
		withSensitive.value,
		homeTab.value === 'latestReplies' ? 'latestReply' : 'personalized',
		homeTab.value === 'following' ? 'strictFollowing' : 'withFollowedChannels',
	].join(':'));
const timelineScrollKey = computed(() => `timeline:${router.getCurrentFullPath()}:${timelineKey.value}`);

const trendRows = computed(() => buildSearchTrendRows(searchTrends.value, sidebarLimits.trends));
const visibleChannels = computed(() => discoverySections.value.channels.slice(0, sidebarLimits.channels));
const visibleRecommendedUsers = computed(() => recommendedUsers.value.slice(0, sidebarLimits.users));
const visibleTutorialNotes = computed(() => discoverySections.value.tutorialNotes.slice(0, sidebarLimits.tutorialNotes));

watch(homeTab, () => {
	queue.value = 0;
});
watch(scope, () => {
	queue.value = 0;
});

onMounted(() => {
	loadSidebarData();
	nextTick(() => {
		installRightRailStickyObserver();
		syncRightRailStickyBounds();
	});
	window.addEventListener('resize', syncRightRailStickyBounds);
	window.visualViewport?.addEventListener('resize', syncRightRailStickyBounds);
});

onActivated(() => {
	loadSidebarData();
	nextTick(syncRightRailStickyBounds);
});

onUnmounted(() => {
	rightRailResizeObserver?.disconnect();
	window.removeEventListener('resize', syncRightRailStickyBounds);
	window.visualViewport?.removeEventListener('resize', syncRightRailStickyBounds);
	stopHotTagsAutoRefresh();
});

function queueUpdated(q: number): void {
	queue.value = q;
}

function top(): void {
	queue.value = 0;
	tlComponent.value?.reloadTimeline();
	pageComponent.value?.scrollToTop();
}

function onComposerPosted(): void {
	tlComponent.value?.reloadTimeline();
}

function submitSidebarSearch(): void {
	const query = sidebarSearchQuery.value.trim();
	if (query.length === 0) return;
	router.push(`/explore?query=${encodeURIComponent(query)}`);
}

function openTrend(type: 'search' | 'tag', term: string): void {
	if (type === 'tag') {
		router.push(`/tags/${encodeURIComponent(term)}`);
	} else {
		router.push(`/explore?query=${encodeURIComponent(term)}`);
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
	await loadSidebarData();
}

function removeLocalTrend(term: string): void {
	const remove = (items: string[]) => items.filter(item => item !== term);
	searchTrends.value = {
		popularSearches: remove(searchTrends.value.popularSearches),
		recentTerms: remove(searchTrends.value.recentTerms),
		hashtags: remove(searchTrends.value.hashtags),
	};
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

async function loadSidebarData(): Promise<void> {
	const [sections, users] = await Promise.all([
		misskeyApi<DiscoverySections>('notes/discovery-sections', { limit: 10 }).catch(() => null),
		misskeyApi<Misskey.entities.UserDetailed[]>('users', {
			limit: sidebarLimits.users,
			origin: 'local',
			sort: '+follower',
			state: 'alive',
			detail: true,
		}).catch(() => []),
	]);
	if (sections) {
		discoverySections.value = sections;
		searchTrends.value = sections.trends;
		recommendedUsers.value = sections.users.length > 0 ? sections.users : users;
	} else {
		recommendedUsers.value = users;
	}
	await nextTick();
	syncRightRailStickyBounds();
}

function summarizeNote(note: Misskey.entities.Note): string {
	return (note.text ?? note.cw ?? i18n.ts.notes).replace(/\s+/g, ' ').slice(0, 72);
}

definePage(() => ({
	title: i18n.ts.home,
	icon: 'ti ti-home',
	needWideArea: true,
	bustLayoutCap: true,
}));
</script>

<style lang="scss" module>
.shell {
	// X brand blue — used only for this page's X-styled affordances so the
	// rest of the instance keeps its own theme accent.
	--x-blue: #1d9bf0;
	--x-blue-hover: #1a8cd8;
	// 右栏保持保守宽度,中间正文用 1fr 自动吃掉剩余空间。
	// 外层 bustLayoutCap 已限制整体 82vw(左右各 9vw 留白),这里吃满外层容器即可。
	--timeline-rail-width: clamp(280px, 22%, 420px);
	--timeline-column-gap: clamp(16px, 1.25vw, 32px);

	box-sizing: border-box;
	width: 100%;
	margin-inline: auto;
	display: grid;
	grid-template-columns: minmax(0, 1fr) var(--timeline-rail-width);
	column-gap: var(--timeline-column-gap);
	align-items: start;
	min-height: 100%;
}

/* ---------- center column ----------
   The column itself is the page background; notes render as rounded cards
   (styled in the scoped .xFeed block) that float on top, giving layered depth. */
.main {
	min-width: 0;
	background: var(--MI_THEME-bg);
	min-height: 100cqh;
}

/* 移动端首页搜索框 —— 桌面右栏自带搜索,不重复显示 */
.mobileSearch {
	display: none;

	@media (max-width: 700px) {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 10px 12px 6px;
		padding: 8px 12px;
		background: var(--MI_THEME-panel);
		border: solid 1px var(--MI_THEME-divider);
		border-radius: 999px;
		box-sizing: border-box;
	}
}

.mobileSearchIcon {
	flex-shrink: 0;
	font-size: 1em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.mobileSearchInput {
	flex: 1;
	min-width: 0;
	border: none;
	outline: none;
	background: transparent;
	color: var(--MI_THEME-fg);
	font-size: 0.95em;
	padding: 0;

	&::placeholder {
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.mobileSearchClear {
	flex-shrink: 0;
	background: none;
	border: none;
	padding: 2px 6px;
	color: var(--MI_THEME-fgTransparentWeak);
	cursor: pointer;
	font-size: 1em;

	&:hover { color: var(--MI_THEME-fg); }
}

.tabs {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	display: grid;
	grid-template-columns: repeat(4, minmax(0, 1fr));
	min-height: 56px;
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
	gap: 7px;
	min-width: 0;
	padding: 0 8px;
	font-size: 15px;
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

.tabIcon {
	font-size: 1.05em;
	opacity: 0.85;
}

.tabLabel {
	padding: 16px 0;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.tabActive {
	font-weight: 700;
	color: var(--MI_THEME-fg);

	.tabIcon {
		color: var(--x-blue);
		opacity: 1;
	}

	&::after {
		width: max(40px, 60%);
	}
}

// 二级标签:本地 / 联合 —— 仅在「时间线」一级激活时显示
.subTabs {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 56px);
	z-index: 9;
	display: flex;
	gap: 8px;
	padding: 10px 14px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 90%, transparent);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.subTab {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 6px 14px;
	border-radius: 999px;
	font-size: 0.92em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	border: solid 1px var(--MI_THEME-divider);
	background: transparent;
	transition: background .12s, color .12s, border-color .12s;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fg);
	}
}

.subTabIcon {
	font-size: 1em;
	opacity: 0.85;
}

/* moved & merged below to add gap */

.tagChips {
	position: sticky;
	top: calc(var(--MI-stickyTop, 0px) + 110px);
	z-index: 8;
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	padding: 10px 14px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 92%, transparent);
	backdrop-filter: blur(10px);
	-webkit-backdrop-filter: blur(10px);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.tagChip {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 5px 12px;
	border-radius: 999px;
	font-size: 0.86em;
	color: var(--MI_THEME-fgTransparentWeak);
	border: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-panel);
	transition: all .12s;
	cursor: pointer;

	&:hover {
		background: var(--MI_THEME-panelHighlight);
		color: var(--MI_THEME-fg);
	}

	i { font-size: 0.85em; }
}

.tagChipActive {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent, #fff);
	border-color: var(--MI_THEME-accent);

	&:hover {
		background: var(--MI_THEME-accentDarken, var(--MI_THEME-accent));
		color: var(--MI_THEME-fgOnAccent, #fff);
	}
}

.tagChipPinned {
	border-color: var(--MI_THEME-accent);
	color: var(--MI_THEME-accent);

	i {
		color: var(--MI_THEME-accent);
	}

	&.tagChipActive i {
		color: var(--MI_THEME-fgOnAccent, #fff);
	}
}

.tagChipHot {
	border-color: #ff6b35;

	.hotIcon {
		color: #ff6b35;
	}

	&.tagChipActive .hotIcon {
		color: #fff;
	}
}

.tagChipMore {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	padding: 5px 12px;
	border-radius: 999px;
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
	background: transparent;
	border: solid 1px transparent;
	cursor: pointer;

	&:hover {
		color: var(--MI_THEME-fg);
		background: var(--MI_THEME-panelHighlight);
	}

	&:disabled {
		opacity: 0.5;
		cursor: wait;
	}

	i { font-size: 0.95em; }
}

@keyframes spin {
	to { transform: rotate(360deg); }
}
.spin {
	animation: spin 0.9s linear infinite;
}

.tagLoading {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
	padding: 5px 8px;
}

.viewSwitchBar {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	gap: 8px;
	padding: 8px 14px 0;
}

.subTabsRight {
	margin-left: auto;
	display: flex;
	align-items: center;
	gap: 8px;
}

.subTabActive {
	color: #fff;
	background: var(--x-blue);
	border-color: var(--x-blue);

	.subTabIcon {
		opacity: 1;
	}

	&:hover {
		background: var(--x-blue-hover);
		border-color: var(--x-blue-hover);
		color: #fff;
	}
}

// 窄屏(隐藏组件栏的临界点附近)标签变小,留更多空间
@media (max-width: 900px) {
	.tab {
		font-size: 14px;
		gap: 4px;
	}
	.tabLabel { padding: 14px 0; }
}

.composer {
	margin: 12px 12px 16px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius, 12px);
	background: var(--MI_THEME-panel);
	overflow: clip;
}

.newPosts {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: 100%;
	padding: 13px;
	font-weight: 600;
	color: var(--x-blue);
	border-bottom: solid 1px var(--MI_THEME-divider);

	&:hover {
		background: var(--MI_THEME-panelHighlight);
	}
}

.timeline {
	background: var(--MI_THEME-bg);
	padding: 0 12px;
}

/* ---------- right rail ---------- */
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

	:global(.root) {
		border-radius: var(--MI-radius-ellipse);
	}
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
.channelRow,
.noteTeaser,
.userRow {
	transition: background .1s;
}

.trendRow:hover,
.channelRow:hover,
.noteTeaser:hover,
.userRow:hover {
	background: var(--MI_THEME-panelHighlight);
}

/* trends */
.trendRow {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	width: 100%;
	gap: 8px;
	padding: 10px 16px;
	text-align: left;
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
	width: 30px;
	height: 30px;
	border-radius: 999px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.trendHideButton:hover {
	color: var(--MI_THEME-error);
	background: color-mix(in srgb, var(--MI_THEME-error) 10%, transparent);
}

/* channels */
.channelRow {
	display: grid;
	grid-template-columns: 40px minmax(0, 1fr);
	gap: 12px;
	align-items: center;
	padding: 10px 16px;
	color: inherit;
}

.channelIcon {
	display: grid;
	place-items: center;
	width: 40px;
	height: 40px;
	border-radius: 50%;
	color: #fff;
	font-size: 18px;
}

.channelBody {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 2px;
}

.channelName {
	font-weight: 700;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.channelMeta {
	font-size: .82em;
	color: var(--MI_THEME-fgTransparentWeak);
}

/* who to follow */
.userRow {
	display: grid;
	grid-template-columns: 44px minmax(0, 1fr) auto;
	align-items: center;
	gap: 12px;
	padding: 10px 16px;
}

.userAvatar {
	width: 44px;
	height: 44px;
}

.userBody {
	min-width: 0;
	display: flex;
	flex-direction: column;
	color: inherit;
}

.userName {
	font-weight: 700;
	color: var(--MI_THEME-fg);
}

.userAcct {
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.followButton {
	border-radius: var(--MI-radius-ellipse);
	font-weight: 700;
}

/* tutorials */
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

/* ---------- composer ----------
   The X chrome for the composer (blue pill submit, round footer icons, clean
   header) is styled INSIDE MkPostForm.vue under its `homeStyle` class, because
   this page's CSS-module styles cannot reach MkPostForm's hashed module classes. */
.composerForm {
	background: var(--MI_THEME-bg);
}

/* ---------- responsive ---------- */
@media (max-width: 1250px) {
	.shell {
		--timeline-rail-width: 280px;
		--timeline-column-gap: 16px;
		width: 100%;
		grid-template-columns: minmax(0, 1fr) var(--timeline-rail-width);
	}
}

@media (max-width: 1100px) {
	.shell {
		display: block;
		width: 100%;
		margin: 0 auto;
	}

	.main {
		border-left: 0;
		border-right: 0;
	}

	.rightRail {
		display: none;
	}
}

// 移动端:全屏铺满 + 紧凑间距
@media (max-width: 700px) {
	.shell {
		width: 100%;
		max-width: 100%;
	}

	// 一级 tabs 缩小 padding
	.tabs {
		padding: 0 6px;
	}

	.subTabs {
		padding: 8px 8px;
		gap: 6px;
		flex-wrap: wrap;
	}

	.subTabsRight {
		width: 100%;
		justify-content: flex-end;
		margin-left: 0;
	}

	// 标签 chip 行:移动端自动换行,避免横向滚动时看不到后面的分类。
	.tagChips {
		padding: 8px 8px;
		gap: 5px;
		flex-wrap: wrap;
		align-content: flex-start;
		max-height: 116px;
		overflow-x: hidden;
		overflow-y: auto;
		scrollbar-width: thin;
	}

	.tagChip, .tagChipMore {
		flex: 0 1 auto;
		max-width: calc(50vw - 16px);
		font-size: 0.8em;
		padding: 4px 10px;

		span {
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	// composer 边到边,无 margin
	.composer {
		margin: 0;
		border-left: 0;
		border-right: 0;
		border-radius: 0;
	}

	// timeline 内容也铺到边
	.timeline {
		padding: 0;
	}

	// xFeed 卡片:边到边、无圆角、紧凑外间距
	.xFeed :deep([data-scroll-anchor]) {
		border-radius: 0 !important;
		border-left: 0;
		border-right: 0;
		margin-bottom: 0;
		border-bottom: solid 0.5px var(--MI_THEME-divider);
		border-top: 0;
	}

	.viewSwitchBar {
		padding: 6px 8px 0;
	}

	.newPosts {
		border-radius: 0;
	}
}
</style>

<!--
  X-style flat tweet rows. This MUST be a `scoped` (not `module`) block:
  Vue only transforms `:deep()` in scoped styles. Inside :deep() we hook only
  STABLE selectors — real HTML element names (article, footer) and the global
  `_gaps` utility class — because SkNote/MkAvatar use hashed module classes we
  cannot reference. `.xFeed` is a plain class on the MkTimeline element.
-->
<style lang="scss" scoped>
// Card-style list: each note is a rounded panel a step lighter than the page
// background, with spacing between cards — this gives the dark feed layered
// depth (panel floats over bg) instead of one flat sheet.
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

// Comfortable card padding (the post body is an <article>).
.xFeed :deep(article) {
	padding: 16px 18px;
}

// X has no per-note colour stripe. Hide only the explicit note colour bar;
// broad inline-background selectors can hide avatars or author chrome.
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

// Spread the action bar like X: a single full-width row whose buttons are
// evenly distributed (reply · retweet · like · quote/react · share/more),
// each a round target with a soft blue hover halo. The footer carries the
// global `_gaps` class; its direct children are the action buttons.
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

// Each action button: flat, muted by default, round hover halo like X.
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

// Icon sizing to match X's ~18px glyphs.
.xFeed :deep(footer._gaps > button > :is(i, svg)) {
	font-size: 18px;
	border-radius: 50%;
	padding: 6px;
	margin: -6px;
	transition: background .12s, color .12s;
}

// Reply (1st) hovers blue, retweet (2nd) green, like/react hovers pink/red —
// the classic X colour cues. Children index is stable across SkNote's footer.
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

// Count text sits inline next to the glyph, smaller, inherits hover colour.
.xFeed :deep(footer._gaps > button > p) {
	margin: 0;
	font-size: 13px;
	line-height: 1;
}

// The last button (… menu) shouldn't stretch full-flex; keep it compact-right.
.xFeed :deep(footer._gaps > button:last-child) {
	flex: 0 0 auto;
}
</style>
