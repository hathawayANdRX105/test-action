<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader ref="pageComponent" :actions="[]" :tabs="[]" :swipable="false" :hideTitle="true">
	<div :class="$style.homeShell">
		<main :class="$style.homeMain">
			<header :class="$style.homeTabs" role="tablist" :aria-label="i18n.ts.home">
				<button
					v-for="tab in homeTabs"
					:key="tab.key"
					class="_button"
					:class="[$style.homeTab, { [$style.homeTabActive]: homeTab === tab.key }]"
					role="tab"
					:aria-selected="homeTab === tab.key"
					@click="homeTab = tab.key"
				>
					{{ tab.title }}
				</button>
			</header>

			<section v-if="$i && !composerExpanded" :class="$style.composer">
				<MkAvatar :user="$i" :class="$style.composerAvatar"/>
				<button class="_button" :class="$style.composerInput" @click="openPostForm">
					{{ i18n.ts.whatsHappening }}
				</button>
				<div :class="$style.composerTools" aria-hidden="true">
					<i class="ti ti-photo"></i>
					<i class="ti ti-gif"></i>
					<i class="ti ti-mood-smile"></i>
					<i class="ti ti-calendar"></i>
					<i class="ti ti-map-pin"></i>
				</div>
				<button class="_buttonPrimary" :class="$style.composeButton" @click="openPostForm">
					{{ i18n.ts.note }}
				</button>
			</section>

			<MkPostForm
				v-if="$i && composerExpanded"
				:class="$style.composerForm"
				:autofocus="true"
				@posted="onComposerPosted"
				@esc="onComposerCancel"
				@cancel="onComposerCancel"
			/>

			<button v-if="queue > 0" class="_button" :class="$style.newPosts" @click="top">
				{{ i18n.tsx.showNPosts({ n: queue }) }}
			</button>

			<MkTimeline
				ref="tlComponent"
				:key="timelineKey"
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
				:sound="homeTab === 'following'"
				@queue="queueUpdated"
			/>
		</main>

		<aside :class="$style.rightRail">
			<form :class="$style.searchBox" @submit.prevent="submitSidebarSearch">
				<MkInput v-model="sidebarSearchQuery" type="search" :placeholder="i18n.ts.search">
					<template #prefix><i class="ti ti-search"></i></template>
				</MkInput>
			</form>

			<section v-if="discoverySections.channels.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.recommendedChannels }}</div>
				<div :class="[$style.sideScrollList, $style.channelList]">
					<MkA v-for="channel in discoverySections.channels.slice(0, 12)" :key="channel.id" :to="`/channels/${channel.id}`" :class="$style.channelRow">
						<span :class="$style.channelIcon" :style="{ background: channel.color }"><i class="ti ti-device-tv"></i></span>
						<span :class="$style.channelBody">
							<span :class="$style.channelName">{{ channel.name }}</span>
							<span :class="$style.channelMeta">{{ i18n.tsx.channelStats({ notes: channel.notesCount, users: channel.usersCount }) }}</span>
						</span>
					</MkA>
				</div>
			</section>

			<section v-if="trendRows.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.hotDiscussions }}</div>
				<div :class="[$style.sideScrollList, $style.trendList]">
					<button
						v-for="trend in trendRows"
						:key="`${trend.type}:${trend.term}`"
						class="_button"
						:class="$style.trendRow"
						@click="openTrend(trend.type, trend.term)"
					>
						<span :class="$style.trendTitle">{{ trend.type === 'tag' ? `#${trend.term}` : trend.term }}</span>
						<span :class="$style.trendMeta">{{ trend.label }}</span>
					</button>
				</div>
			</section>

			<section v-if="discoverySections.tutorialNotes.length > 0" :class="$style.sideCard">
				<div :class="$style.sideCardTitle">{{ i18n.ts.tutorialsAndResources }}</div>
				<MkA v-for="note in discoverySections.tutorialNotes.slice(0, 3)" :key="note.id" :to="`/notes/${note.id}`" :class="$style.noteTeaser">
					<span :class="$style.noteTeaserText">{{ summarizeNote(note) }}</span>
					<span :class="$style.noteTeaserMeta">{{ i18n.tsx.noteStats({ replies: note.repliesCount, renotes: note.renoteCount }) }}</span>
				</MkA>
			</section>

			<section v-if="recommendedUsers.length > 0" :class="$style.sideCard">
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
import { computed, onActivated, onMounted, provide, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkTimeline from '@/components/MkTimeline.vue';
import MkInput from '@/components/MkInput.vue';
import MkFollowButton from '@/components/MkFollowButton.vue';
import MkPostForm from '@/components/MkPostForm.vue';
import * as os from '@/os.js';
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

const router = useRouter();
const tlComponent = useTemplateRef('tlComponent');
const pageComponent = useTemplateRef('pageComponent');

const homeTab = ref<HomeTab>('forYou');
const queue = ref(0);
const composerExpanded = ref(false);
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
].join(':'));

const trendRows = computed(() => {
	const rows: { type: 'search' | 'tag'; term: string; label: string }[] = [];
	for (const term of searchTrends.value.popularSearches.slice(0, 5)) {
		rows.push({ type: 'search', term, label: i18n.ts.popularSearches });
	}
	for (const term of searchTrends.value.recentTerms.slice(0, Math.max(0, 10 - rows.length))) {
		rows.push({ type: 'search', term, label: i18n.ts.recentContentTerms });
	}
	for (const term of searchTrends.value.hashtags.slice(0, Math.max(0, 14 - rows.length))) {
		rows.push({ type: 'tag', term, label: i18n.ts.popularTags });
	}
	return rows;
});

watch(homeTab, () => {
	queue.value = 0;
});

onMounted(() => {
	loadSidebarData();
});

onActivated(() => {
	loadSidebarData();
});

function queueUpdated(q: number): void {
	queue.value = q;
}

function top(): void {
	queue.value = 0;
	tlComponent.value?.reloadTimeline();
	pageComponent.value?.scrollToTop();
}

function openPostForm(): void {
	composerExpanded.value = true;
}

function onComposerPosted(): void {
	composerExpanded.value = false;
	tlComponent.value?.reloadTimeline();
}

function onComposerCancel(): void {
	composerExpanded.value = false;
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

async function loadSidebarData(): Promise<void> {
	const [sections, users] = await Promise.all([
		misskeyApi<DiscoverySections>('notes/discovery-sections', { limit: 6 }).catch(() => null),
		misskeyApi<Misskey.entities.UserDetailed[]>('users', {
			limit: 3,
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
.homeShell {
	width: min(100%, 990px);
	margin: 0 auto;
	display: grid;
	grid-template-columns: minmax(0, 600px) 360px;
	column-gap: 30px;
	align-items: start;
	min-height: 100%;
}

.homeMain {
	min-width: 0;
	border-left: solid 1px var(--MI_THEME-divider);
	border-right: solid 1px var(--MI_THEME-divider);
	background: var(--MI_THEME-bg);
	min-height: 100cqh;
}

.homeTabs {
	position: sticky;
	top: 0;
	z-index: 10;
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	min-height: 53px;
	background: color-mix(in srgb, var(--MI_THEME-bg) 88%, transparent);
	backdrop-filter: blur(16px);
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.homeTab {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	min-width: 0;
	padding: 0 8px;
	font-weight: 700;
	font-size: 15px;
	color: var(--MI_THEME-fg);
}

.homeTab:hover {
	background: var(--MI_THEME-panelHighlight);
}

.homeTabActive::after {
	content: "";
	position: absolute;
	left: 50%;
	bottom: 0;
	width: 58px;
	height: 4px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	transform: translateX(-50%);
}

.composer {
	display: grid;
	grid-template-columns: 48px minmax(0, 1fr) auto;
	gap: 10px 12px;
	padding: 16px 16px 14px;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.composerAvatar {
	width: 40px;
	height: 40px;
	grid-row: 1 / span 2;
}

.composerInput {
	min-height: 44px;
	text-align: left;
	font-size: 20px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.composerTools {
	display: flex;
	align-items: center;
	gap: 16px;
	color: var(--MI_THEME-accent);
}

.composeButton {
	align-self: center;
	border-radius: 999px;
	min-height: 36px;
	padding: 0 18px;
	font-weight: 700;
}

.composerForm {
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.newPosts {
	width: 100%;
	padding: 13px;
	color: var(--MI_THEME-accent);
	border-bottom: solid 1px var(--MI_THEME-divider);
	text-align: center;
}

.timeline {
	background: var(--MI_THEME-bg);
}

// Twitter-like feed rhythm: subtle hover highlight on each post row.
.timeline :deep([data-scroll-anchor]) {
	transition: background .1s;
}

.timeline :deep([data-scroll-anchor]):hover {
	background: var(--MI_THEME-panelHighlight);
}

.rightRail {
	position: sticky;
	top: var(--MI-stickyTop, 0px);
	display: flex;
	flex-direction: column;
	gap: 16px;
	min-height: 0;
	max-height: calc(100dvh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px) - var(--MI-visualViewportBottom, 0px));
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
	padding: 10px 0 24px;
}

.searchBox :global(.root) {
	border-radius: 999px;
}

.sideCard {
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 16px;
	padding: 16px;
	background: var(--MI_THEME-panel);
	overflow: hidden;
}

.trendRow,
.channelRow,
.noteTeaser {
	transition: background .1s;
}

.trendRow:hover,
.channelRow:hover,
.noteTeaser:hover {
	background: var(--MI_THEME-panelHighlight);
}

.sideCardTitle {
	margin-bottom: 12px;
	font-size: 20px;
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.sideScrollList {
	min-height: 0;
	overflow-y: auto;
	overscroll-behavior: contain;
	padding-right: 4px;
	margin-right: -4px;
	scrollbar-gutter: stable;
}

.channelList {
	max-height: 300px;
}

.trendList {
	max-height: 360px;
}

.followButton {
	border-radius: 999px;
	font-weight: 700;
}

.channelRow {
	display: grid;
	grid-template-columns: 38px minmax(0, 1fr);
	gap: 10px;
	align-items: center;
	padding: 10px 0;
	color: inherit;
}

.channelRow + .channelRow,
.noteTeaser + .noteTeaser {
	border-top: solid 1px var(--MI_THEME-divider);
}

.channelIcon {
	display: grid;
	place-items: center;
	width: 36px;
	height: 36px;
	border-radius: 10px;
	color: #fff;
}

.channelBody,
.noteTeaser {
	min-width: 0;
	display: flex;
	flex-direction: column;
	gap: 3px;
	color: inherit;
}

.channelName,
.noteTeaserText {
	font-weight: 800;
	color: var(--MI_THEME-fg);
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.channelMeta,
.noteTeaserMeta {
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.noteTeaser {
	padding: 10px 0;
}

.trendRow {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	width: 100%;
	gap: 3px;
	padding: 10px 0;
	text-align: left;
}

.trendRow + .trendRow {
	border-top: solid 1px var(--MI_THEME-divider);
}

.trendTitle {
	font-weight: 800;
	color: var(--MI_THEME-fg);
}

.trendMeta {
	font-size: .85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.userRow {
	display: grid;
	grid-template-columns: 42px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	padding: 10px 0;
}

.userRow + .userRow {
	border-top: solid 1px var(--MI_THEME-divider);
}

.userAvatar {
	width: 40px;
	height: 40px;
}

.userBody {
	min-width: 0;
	color: inherit;
}

@media (max-width: 1200px) {
	.homeShell {
		grid-template-columns: minmax(0, 600px) 320px;
		width: min(100%, 950px);
	}
}

@media (max-width: 1000px) {
	.homeShell {
		display: block;
		width: min(100%, 600px);
	}

	.homeMain {
		border-left: 0;
		border-right: 0;
	}

	.rightRail {
		display: none;
	}
}

@media (max-width: 500px) {
	.composer {
		grid-template-columns: 42px minmax(0, 1fr);
	}

	.composeButton {
		grid-column: 2;
		justify-self: end;
	}
}
</style>
