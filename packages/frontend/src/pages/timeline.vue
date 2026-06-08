<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader ref="pageComponent" :actions="[]" :tabs="[]" :swipable="false" :hideTitle="true">
	<div class="xTimelineWideShell" :class="$style.shell">
		<main :class="$style.main" @wheel.passive="onMainWheel">
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
					<span :class="$style.tabLabel">{{ tab.title }}</span>
				</button>
			</header>

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
				:discoveryMode="homeTab === 'forYou'"
				recommendationSurface="home"
				recommendationCategory="forYou"
				:recommendationSort="homeTab === 'latestReplies' ? 'latestReply' : 'personalized'"
				:includeFollowedChannels="homeTab !== 'following'"
				:sound="homeTab === 'following'"
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
						<span :class="$style.trendMeta">{{ trend.label }}</span>
						<span :class="$style.trendTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
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
import { $i } from '@/i.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router';
import { misskeyApi } from '@/utility/misskey-api.js';
import { userPage } from '@/filters/user.js';

provide('shouldOmitHeaderTitle', true);

type HomeTab = 'forYou' | 'following' | 'latestReplies';
type DiscoverySections = Misskey.Endpoints['notes/discovery-sections']['res'];

const sidebarLimits = {
	trends: 4,
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

const homeTab = ref<HomeTab>('forYou');
const queue = ref(0);
const sidebarSearchQuery = ref('');

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
}, {
	key: 'following' as const,
	title: i18n.ts.homeTimelineFollowing,
}, {
	key: 'latestReplies' as const,
	title: i18n.ts.homeTimelineLatestReplies,
}]);

const timelineSrc = computed(() => homeTab.value === 'following' ? 'home' : 'recommended');
const withRenotes = computed(() => store.r.tl.value.filter.withRenotes);
const withReplies = computed(() => store.r.tl.value.filter.withReplies);
const withBots = computed(() => store.r.tl.value.filter.withBots);
const onlyFiles = computed(() => store.r.tl.value.filter.onlyFiles);
const withSensitive = computed(() => store.r.tl.value.filter.withSensitive);
const timelineKey = computed(() => [
	homeTab.value,
	withRenotes.value,
	withReplies.value,
	withBots.value,
	onlyFiles.value,
	withSensitive.value,
	homeTab.value === 'latestReplies' ? 'latestReply' : 'personalized',
	homeTab.value === 'following' ? 'strictFollowing' : 'withFollowedChannels',
].join(':'));

const trendRows = computed(() => {
	const rows: { type: 'search' | 'tag'; term: string; label: string }[] = [];
	const seen = new Set<string>();
	const push = (type: 'search' | 'tag', term: string, label: string) => {
		const key = `${type}:${term}`;
		if (seen.has(key)) return;
		seen.add(key);
		rows.push({ type, term, label });
	};
	for (const term of searchTrends.value.popularSearches) push('search', term, i18n.ts.popularSearches);
	for (const term of searchTrends.value.hashtags) push('tag', term, i18n.ts.popularTags);
	for (const term of searchTrends.value.recentTerms) push('search', term, i18n.ts.recentContentTerms);
	return rows.slice(0, sidebarLimits.trends);
});
const visibleChannels = computed(() => discoverySections.value.channels.slice(0, sidebarLimits.channels));
const visibleRecommendedUsers = computed(() => recommendedUsers.value.slice(0, sidebarLimits.users));
const visibleTutorialNotes = computed(() => discoverySections.value.tutorialNotes.slice(0, sidebarLimits.tutorialNotes));

watch(homeTab, () => {
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
		misskeyApi<DiscoverySections>('notes/discovery-sections', { limit: 4 }).catch(() => null),
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
}));
</script>

<style lang="scss" module>
.shell {
	// X brand blue — used only for this page's X-styled affordances so the
	// rest of the instance keeps its own theme accent.
	--x-blue: #1d9bf0;
	--x-blue-hover: #1a8cd8;
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

/* ---------- center column ----------
   The column itself is the page background; notes render as rounded cards
   (styled in the scoped .xFeed block) that float on top, giving layered depth. */
.main {
	min-width: 0;
	background: var(--MI_THEME-bg);
	min-height: 100cqh;
}

.tabs {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	z-index: 10;
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
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

.tabLabel {
	padding: 16px 0;
}

.tabActive {
	font-weight: 700;
	color: var(--MI_THEME-fg);

	&::after {
		width: max(36px, 56%);
	}
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
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	width: 100%;
	gap: 2px;
	padding: 10px 16px;
	text-align: left;
}

.trendTitle {
	font-weight: 700;
	font-size: .98em;
	color: var(--MI_THEME-fg);
}

.trendMeta {
	font-size: .8em;
	color: var(--MI_THEME-fgTransparentWeak);
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

	.main {
		border-left: 0;
		border-right: 0;
	}

	.rightRail {
		display: none;
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
