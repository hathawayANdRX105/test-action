<!--
SPDX-FileCopyrightText: Universe Federation contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.toolbar">
		<div :class="$style.switch">
			<button :class="[$style.switchBtn, view === 'sections' && $style.switchActive]" @click="setView('sections')"><i class="ti ti-layout-list"></i> {{ i18n.ts._channel.browseSections }}</button>
			<button :class="[$style.switchBtn, view === 'split' && $style.switchActive]" @click="setView('split')"><i class="ti ti-layout-columns"></i> {{ i18n.ts._channel.browseSplit }}</button>
		</div>
	</div>

	<MkLoading v-if="fetchingCats"/>
	<MkResult v-else-if="buckets.length === 0" type="empty"/>

	<!-- 版块纵向(App Store 风) -->
	<div v-else-if="view === 'sections'" :class="$style.sections">
		<section v-for="cat in buckets" :key="cat.key" :class="$style.section">
			<header :class="$style.sectionHead">
				<div :class="$style.sectionTitle">{{ cat.label }} <span :class="$style.count">{{ cat.channelsCount }}</span></div>
				<button :class="$style.viewAll" @click="openCategory(cat.key)">{{ i18n.ts._channel.viewAll }} <i class="ti ti-chevron-right"></i></button>
			</header>
			<MkLoading v-if="sectionData[cat.key] == null"/>
			<div v-else :class="$style.row">
				<div v-for="ch in sectionData[cat.key]" :key="ch.id" :class="$style.rowItem">
					<MkChannelPreview :channel="ch"/>
				</div>
			</div>
		</section>
	</div>

	<!-- 左大类 / 右网格 -->
	<div v-else :class="$style.split">
		<div :class="$style.catNav">
			<button v-for="cat in navBuckets" :key="cat.key" :class="[$style.catBtn, selectedKey === cat.key && $style.catActive]" @click="selectCategory(cat.key)">
				<span :class="$style.catLabel">{{ cat.label }}</span><span :class="$style.count">{{ cat.channelsCount }}</span>
			</button>
		</div>
		<div :class="$style.gridPane">
			<MkLoading v-if="gridLoading"/>
			<MkResult v-else-if="gridChannels.length === 0" type="empty"/>
			<template v-else>
				<div :class="$style.grid">
					<MkChannelPreview v-for="ch in gridChannels" :key="ch.id" :channel="ch"/>
				</div>
				<MkButton v-if="gridCanLoadMore" :class="$style.loadMore" rounded :wait="gridMoreLoading" @click="loadMoreGrid"><i class="ti ti-chevron-down"></i> {{ i18n.ts.loadMore }}</MkButton>
			</template>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkChannelPreview from '@/components/MkChannelPreview.vue';
import MkButton from '@/components/MkButton.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkResult from '@/components/global/MkResult.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { miLocalStorage } from '@/local-storage.js';

const UNCAT_KEY = '__uncat__';
const ALL_KEY = '__all__';
const SECTION_LIMIT = 10;
const GRID_LIMIT = 12;
// 版块视图按分类逐个取数据：节流派发(每 SECTION_PACE_MS 发一个)，
// 约 12.5 req/s，稳稳低于后端 30 req/s 限额，避免一次性并发触发 429。
const SECTION_PACE_MS = 80;

type Bucket = { key: string; label: string; channelsCount: number; category: string | null };

const view = ref<'sections' | 'split'>((miLocalStorage.getItem('channelResourceView') as 'sections' | 'split' | null) ?? 'sections');
const fetchingCats = ref(true);
const categories = ref<Misskey.entities.ChannelsCategoriesResponse>([]);

const buckets = computed<Bucket[]>(() => categories.value.map(c => ({
	key: c.category ?? UNCAT_KEY,
	label: c.category ?? i18n.ts._channel.uncategorized,
	channelsCount: c.channelsCount,
	category: c.category,
})));

const navBuckets = computed<Bucket[]>(() => [
	{ key: ALL_KEY, label: i18n.ts._channel.allCategories, channelsCount: buckets.value.reduce((a, b) => a + b.channelsCount, 0), category: null },
	...buckets.value,
]);

// 版块: 各大类の先頭チャンネル
const sectionData = ref<Record<string, Misskey.entities.Channel[]>>({});
// 進行中のキー(重複リクエスト防止)
const loadingSectionKeys = new Set<string>();

// 分栏
const selectedKey = ref<string>(ALL_KEY);
const gridChannels = ref<Misskey.entities.Channel[]>([]);
const gridLoading = ref(false);
const gridMoreLoading = ref(false);
const gridCanLoadMore = ref(false);
let gridOffset = 0;

function paramsForKey(key: string) {
	if (key === ALL_KEY) return {};
	if (key === UNCAT_KEY) return { uncategorized: true };
	return { category: key };
}

function delay(ms: number) {
	return new Promise<void>(resolve => window.setTimeout(resolve, ms));
}

async function loadSections() {
	// 未取得かつ進行中でない大类だけを対象に。
	const pending = buckets.value.filter(b => sectionData.value[b.key] == null && !loadingSectionKeys.has(b.key));
	if (pending.length === 0) return;
	for (const b of pending) loadingSectionKeys.add(b.key);

	// 一定間隔でリクエストを送出(レート上限以下に抑える)。完了は待たずに次へ進めて、各版块は届いた順に表示される。
	const tasks: Promise<void>[] = [];
	for (let i = 0; i < pending.length; i++) {
		const b = pending[i];
		tasks.push((async () => {
			try {
				sectionData.value[b.key] = await misskeyApi('channels/by-category', { ...paramsForKey(b.key), limit: SECTION_LIMIT });
			} catch {
				sectionData.value[b.key] = [];
			} finally {
				loadingSectionKeys.delete(b.key);
			}
		})());
		if (i < pending.length - 1) await delay(SECTION_PACE_MS);
	}

	await Promise.all(tasks);
}

async function loadGrid() {
	gridLoading.value = true;
	gridOffset = 0;
	try {
		const res = await misskeyApi('channels/by-category', { ...paramsForKey(selectedKey.value), limit: GRID_LIMIT, offset: 0 });
		gridChannels.value = res;
		gridCanLoadMore.value = res.length >= GRID_LIMIT;
	} catch {
		gridChannels.value = [];
		gridCanLoadMore.value = false;
	} finally {
		gridLoading.value = false;
	}
}

async function loadMoreGrid() {
	gridMoreLoading.value = true;
	gridOffset += GRID_LIMIT;
	try {
		const res = await misskeyApi('channels/by-category', { ...paramsForKey(selectedKey.value), limit: GRID_LIMIT, offset: gridOffset });
		gridChannels.value = [...gridChannels.value, ...res];
		gridCanLoadMore.value = res.length >= GRID_LIMIT;
	} finally {
		gridMoreLoading.value = false;
	}
}

function selectCategory(key: string) {
	if (selectedKey.value === key && gridChannels.value.length > 0) return;
	selectedKey.value = key;
	loadGrid();
}

function setView(v: 'sections' | 'split') {
	view.value = v;
	miLocalStorage.setItem('channelResourceView', v);
	if (v === 'sections') loadSections();
	else if (gridChannels.value.length === 0) loadGrid();
}

function openCategory(key: string) {
	view.value = 'split';
	miLocalStorage.setItem('channelResourceView', 'split');
	selectCategory(key);
}

async function init() {
	fetchingCats.value = true;
	try {
		categories.value = await misskeyApi('channels/categories', {});
	} catch {
		categories.value = [];
	} finally {
		fetchingCats.value = false;
	}
	if (view.value === 'sections') await loadSections();
	else await loadGrid();
}

init();
</script>

<style lang="scss" module>
.root {
	container-type: inline-size;
}

.toolbar {
	display: flex;
	justify-content: flex-end;
	margin-bottom: 16px;
}

.switch {
	display: inline-flex;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius-full);
	overflow: hidden;
	background: var(--MI_THEME-panel);
}

.switchBtn {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 7px 16px;
	border: none;
	background: transparent;
	color: var(--MI_THEME-fg);
	font-size: 0.9em;
	cursor: pointer;
}

.switchActive {
	background: var(--MI_THEME-accent);
	color: #fff;
}

/* ---------- sections ---------- */
.sections {
	display: flex;
	flex-direction: column;
	gap: 28px;
}

.sectionHead {
	display: flex;
	align-items: center;
	justify-content: space-between;
	margin-bottom: 12px;
}

.sectionTitle {
	font-size: 1.15em;
	font-weight: 700;
	display: flex;
	align-items: center;
	gap: 8px;
}

.count {
	font-size: 0.72em;
	font-weight: 600;
	color: var(--MI_THEME-fgTransparentWeak);
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-full);
	padding: 1px 9px;
}

.viewAll {
	border: none;
	background: transparent;
	color: var(--MI_THEME-accent);
	font-size: 0.9em;
	cursor: pointer;
	display: inline-flex;
	align-items: center;
	gap: 2px;
	flex-shrink: 0;
}

.row {
	display: flex;
	gap: 14px;
	overflow-x: auto;
	scroll-snap-type: x proximity;
	padding: 4px 2px 12px;
	scrollbar-width: thin;
}

.rowItem {
	flex: 0 0 280px;
	max-width: 280px;
	scroll-snap-align: start;
}

/* ---------- split ---------- */
.split {
	display: grid;
	grid-template-columns: 220px minmax(0, 1fr);
	gap: 20px;
	align-items: start;
}

.catNav {
	display: flex;
	flex-direction: column;
	gap: 4px;
	position: sticky;
	top: 0;
}

.catBtn {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	width: 100%;
	padding: 10px 14px;
	border: none;
	border-radius: var(--MI-radius);
	background: transparent;
	color: var(--MI_THEME-fg);
	font-size: 0.95em;
	cursor: pointer;
	text-align: left;
	white-space: nowrap;

	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}

.catLabel {
	overflow: hidden;
	text-overflow: ellipsis;
}

.catActive {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	font-weight: 700;
}

.gridPane {
	min-width: 0;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
	gap: 16px;
}

.loadMore {
	margin: 20px auto 0;
}

@container (max-width: 700px) {
	.split {
		grid-template-columns: 1fr;
		gap: 14px;
	}
	.catNav {
		flex-direction: row;
		overflow-x: auto;
		position: static;
		padding-bottom: 6px;
		scrollbar-width: thin;
	}
	.catBtn {
		width: auto;
		flex: 0 0 auto;
		border: 1px solid var(--MI_THEME-divider);
		border-radius: var(--MI-radius-full);
		padding: 7px 14px;
	}
}
</style>
