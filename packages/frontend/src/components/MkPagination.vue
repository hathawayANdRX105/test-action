<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<Transition
	:enterActiveClass="prefer.s.animation ? $style.transition_fade_enterActive : ''"
	:leaveActiveClass="prefer.s.animation ? $style.transition_fade_leaveActive : ''"
	:enterFromClass="prefer.s.animation ? $style.transition_fade_enterFrom : ''"
	:leaveToClass="prefer.s.animation ? $style.transition_fade_leaveTo : ''"
	mode="out-in"
>
	<MkLoading v-if="fetching"/>

	<MkError v-else-if="error" @retry="init()"/>

	<div v-else-if="empty" key="_empty_">
		<slot name="empty"><MkResult type="empty"/></slot>
	</div>

	<div v-else ref="rootEl" class="_gaps">
		<div v-show="pagination.reversed && more" key="_more_">
			<MkButton v-if="!moreFetching" v-appear="(enableInfiniteScroll && !props.disableAutoLoad) ? appearFetchMoreAhead : null" :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMoreAhead">
				{{ i18n.ts.loadMore }}
			</MkButton>
			<MkLoading v-else :mini="true"/>
		</div>
		<div v-if="pagination.reversed && exhausted" :class="$style.exhausted">{{ i18n.ts.noMoreHistory }}</div>
		<slot :items="Array.from(items.values())" :fetching="fetching || moreFetching"></slot>
		<div v-if="!pagination.reversed && exhausted" :class="$style.exhausted">{{ i18n.ts.noMoreHistory }}</div>
		<div v-show="!pagination.reversed && more" key="_more_">
			<MkButton v-if="!moreFetching" v-appear="(enableInfiniteScroll && !props.disableAutoLoad) ? appearFetchMore : null" :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">
				{{ i18n.ts.loadMore }}
			</MkButton>
			<MkLoading v-else :mini="true"/>
		</div>
	</div>
</Transition>
</template>

<script lang="ts">
import { computed, isRef, nextTick, onActivated, onBeforeMount, onBeforeUnmount, onDeactivated, ref, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { useDocumentVisibility } from '@@/js/use-document-visibility.js';
import { onScrollTop, isHeadVisible, getScrollContainer, onScrollBottom, scrollToBottom, isTailVisible } from '@@/js/scroll.js';
import type { ComputedRef, Ref } from 'vue';
import type { MisskeyEntity } from '@/types/date-separated-list.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

// 第二屏起每页拉的条数:30 太少导致"滑一下又到头"——尤其是 Discourse/masonry 这种压缩视图,
// 一屏能放 20+ 条,30 条几乎刚滑两下就用完。给 50 做基线,体感更连续。
const SECOND_FETCH_LIMIT = 50;
const TOLERANCE = 16;
const APPEAR_MINIMUM_INTERVAL = 600;

export type Paging<E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints> = {
	endpoint: E;
	limit: number;
	params?: Misskey.Endpoints[E]['req'] | ComputedRef<Misskey.Endpoints[E]['req']>;

	/**
	 * 検索APIのような、ページング不可なエンドポイントを利用する場合
	 * (そのようなAPIをこの関数で使うのは若干矛盾してるけど)
	 */
	noPaging?: boolean;

	/**
	 * items 配列の中身を逆順にする(新しい方が最後)
	 */
	reversed?: boolean;

	offsetMode?: boolean | ComputedRef<boolean>;
};

type MisskeyEntityMap = Map<string, MisskeyEntity>;
type ItemRetentionSide = 'head' | 'tail';
type ScrollAnchorSnapshot = {
	id: string;
	top: number;
};

function arrayToEntries(entities: MisskeyEntity[]): [string, MisskeyEntity][] {
	return entities.map(en => [en.id, en]);
}

</script>
<script lang="ts" setup>
import MkButton from '@/components/MkButton.vue';

const props = withDefaults(defineProps<{
	pagination: Paging;
	disableAutoLoad?: boolean;
	displayLimit?: number;
}>(), {
	displayLimit: 20,
});

const emit = defineEmits<{
	(ev: 'queue', count: number): void;
	(ev: 'status', error: boolean): void;
	(ev: 'init'): void;
}>();

const rootEl = useTemplateRef('rootEl');

// 遡り中かどうか
const backed = ref(false);

const scrollRemove = ref<(() => void) | null>(null);

/**
 * 表示するアイテムのソース
 * 最新が0番目
 */
const items = ref<MisskeyEntityMap>(new Map());

/**
 * タブが非アクティブなどの場合に更新を貯めておく
 * 最新が0番目
 */
const queue = ref<MisskeyEntityMap>(new Map());

/**
 * 初期化中かどうか（trueならMkLoadingで全て隠す）
 */
const fetching = ref(true);

const moreFetching = ref(false);
const more = ref(false);
const exhausted = ref(false);
const fetchedItemCount = ref(0);
const preventAppearFetchMore = ref(false);
const preventAppearFetchMoreTimer = ref<number | null>(null);
const isBackTop = ref(false);
const empty = computed(() => items.value.size === 0);
const error = ref(false);
const {
	enableInfiniteScroll,
} = prefer.r;

const scrollableElement = computed(() => rootEl.value ? getScrollContainer(rootEl.value) : null);

const visibility = useDocumentVisibility();

let isPausingUpdate = false;
let timerForSetPause: number | null = null;
let toBottomTimer: number | null = null;
let moreFetchingTimer: number | null = null;
let lastKnownHeadState = false;
let removeHeadStateScrollListener: (() => void) | null = null;
const BACKGROUND_PAUSE_WAIT_SEC = 10;

// 先頭が表示されているかどうかを検出
// https://qiita.com/mkataigi/items/0154aefd2223ce23398e
const scrollObserver = ref<IntersectionObserver>();

watch([() => props.pagination.reversed, scrollableElement], () => {
	if (scrollObserver.value) scrollObserver.value.disconnect();

	scrollObserver.value = new IntersectionObserver(entries => {
		backed.value = entries[0].isIntersecting;
	}, {
		root: scrollableElement.value,
		rootMargin: props.pagination.reversed ? '-100% 0px 100% 0px' : '100% 0px -100% 0px',
		threshold: 0.01,
	});
}, { immediate: true });

watch(rootEl, () => {
	scrollObserver.value?.disconnect();
	nextTick(() => {
		if (rootEl.value) scrollObserver.value?.observe(rootEl.value);
	});
});

watch([rootEl, scrollableElement], () => {
	removeHeadStateScrollListener?.();
	removeHeadStateScrollListener = null;
	nextTick(setupHeadStateScrollListener);
}, { immediate: true });

watch([backed, rootEl], () => {
	scrollRemove.value?.();
	scrollRemove.value = null;

	if (!backed.value) {
		if (!rootEl.value) return;

		scrollRemove.value = props.pagination.reversed
			? onScrollBottom(rootEl.value, executeQueue, TOLERANCE)
			: onScrollTop(rootEl.value, (topVisible) => { if (topVisible) executeQueue(); }, TOLERANCE);
	}
});

// パラメータに何らかの変更があった際、再読込したい（チャンネル等のIDが変わったなど）
watch(() => [props.pagination.endpoint, props.pagination.params], init, { deep: true });

watch(queue, (a, b) => {
	if (a.size === 0 && b.size === 0) return;
	emit('queue', queue.value.size);
}, { deep: true });

watch(error, (n, o) => {
	if (n === o) return;
	emit('status', n);
});

function getActualValue<T>(input: T | Ref<T> | undefined, defaultValue: T) : T {
	if (!input) return defaultValue;
	if (isRef(input)) return input.value;
	return input;
}

function retainedItemsLimit(): number {
	return Math.max(1, props.displayLimit, props.pagination.limit ?? 0, SECOND_FETCH_LIMIT);
}

function limitItemEntries(entries: [string, MisskeyEntity][], side: ItemRetentionSide): MisskeyEntityMap {
	const uniqueEntries = Array.from(new Map(entries));
	const limit = retainedItemsLimit();
	if (uniqueEntries.length <= limit) return new Map(uniqueEntries);

	return new Map(side === 'head'
		? uniqueEntries.slice(0, limit)
		: uniqueEntries.slice(uniqueEntries.length - limit));
}

function replaceItems(newItems: MisskeyEntity[]): void {
	items.value = limitItemEntries(arrayToEntries(newItems), 'head');
}

function findScrollAnchorById(id: string): HTMLElement | null {
	if (rootEl.value == null) return null;

	for (const el of rootEl.value.querySelectorAll<HTMLElement>('[data-scroll-anchor]')) {
		if (el.getAttribute('data-scroll-anchor') === id) return el;
	}

	return null;
}

function captureVisibleScrollAnchor(): ScrollAnchorSnapshot | null {
	if (rootEl.value == null) return null;

	const scrollTarget = scrollableElement.value;
	const containerTop = scrollTarget?.getBoundingClientRect().top ?? 0;
	const containerHeight = scrollTarget?.getBoundingClientRect().height ?? window.innerHeight;
	if (containerHeight <= 0) return null;
	const containerBottom = containerTop + containerHeight;

	const viewPosition = containerTop + (containerHeight / 2);
	let fallback: ScrollAnchorSnapshot | null = null;

	for (const el of rootEl.value.querySelectorAll<HTMLElement>('[data-scroll-anchor]')) {
		const id = el.getAttribute('data-scroll-anchor');
		if (id == null) continue;

		const rect = el.getBoundingClientRect();
		if (rect.bottom < containerTop || rect.top > containerBottom) continue;

		const snapshot = { id, top: rect.top };
		if (rect.top <= viewPosition && rect.bottom >= viewPosition) return snapshot;
		fallback ??= snapshot;
	}

	return fallback;
}

function restoreVisibleScrollAnchor(snapshot: ScrollAnchorSnapshot | null): void {
	if (snapshot == null) return;

	const anchorEl = findScrollAnchorById(snapshot.id);
	if (anchorEl == null) return;

	const delta = anchorEl.getBoundingClientRect().top - snapshot.top;
	if (Math.abs(delta) < 0.5) return;

	const scrollTarget = scrollableElement.value;
	if (scrollTarget != null) {
		scrollTarget.scroll({
			top: scrollTarget.scrollTop + delta,
			behavior: 'instant',
		});
		return;
	}

	window.scroll({
		top: window.scrollY + delta,
		behavior: 'instant',
	});
}

async function appendItemsWithLimit(newItems: MisskeyEntity[], retentionSide: ItemRetentionSide): Promise<void> {
	const anchor = captureVisibleScrollAnchor();
	items.value = limitItemEntries([...Array.from(items.value), ...arrayToEntries(newItems)], retentionSide);
	await nextTick();
	restoreVisibleScrollAnchor(anchor);
}

async function init(): Promise<void> {
	items.value = new Map();
	queue.value = new Map();
	exhausted.value = false;
	fetchedItemCount.value = 0;
	fetching.value = true;
	const params = getActualValue<Paging['params']>(props.pagination.params, {});
	await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
		...params,
		limit: props.pagination.limit ?? 10,
		allowPartial: true,
	}).then(res => {
		fetchedItemCount.value = res.length;
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 3) item._shouldInsertAd_ = true;
		}

		if (res.length === 0 || props.pagination.noPaging) {
			replaceItems(res);
			more.value = false;
			exhausted.value = false;
		} else {
			if (props.pagination.reversed) moreFetching.value = true;
			replaceItems(res);
			more.value = res.length >= (props.pagination.limit ?? 10);
			exhausted.value = !more.value && items.value.size > 0;
		}

		error.value = false;
		fetching.value = false;

		emit('init');
	}, err => {
		error.value = true;
		fetching.value = false;
	});
}

const reload = (): Promise<void> => {
	return init();
};

const fetchMore = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) return;
	moreFetching.value = true;
	try {
		const params = getActualValue<Paging['params']>(props.pagination.params, {});
		const offsetMode = getActualValue(props.pagination.offsetMode, false);
		const res = await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
			...params,
			limit: SECOND_FETCH_LIMIT,
			...(offsetMode ? {
				offset: fetchedItemCount.value,
			} : {
				untilId: Array.from(items.value.keys()).at(-1),
			}),
		});
		fetchedItemCount.value += res.length;
		for (let i = 0; i < res.length; i++) {
			const item = res[i];
			if (i === 10) item._shouldInsertAd_ = true;
		}

		if (res.length === 0) {
			if (props.pagination.reversed) {
				await appendItemsWithLimit(res, 'tail');
				more.value = false;
			} else {
				await appendItemsWithLimit(res, 'tail');
				more.value = false;
			}
			exhausted.value = items.value.size > 0;
		} else {
			if (props.pagination.reversed) {
				await appendItemsWithLimit(res, 'tail');
			} else {
				await appendItemsWithLimit(res, 'tail');
			}
			more.value = res.length >= SECOND_FETCH_LIMIT;
			exhausted.value = !more.value && items.value.size > 0;
		}
	} finally {
		moreFetching.value = false;
	}
};

const fetchMoreAhead = async (): Promise<void> => {
	if (!more.value || fetching.value || moreFetching.value || items.value.size === 0) return;
	moreFetching.value = true;
	try {
		const params = getActualValue<Paging['params']>(props.pagination.params, {});
		const offsetMode = getActualValue(props.pagination.offsetMode, false);
		const res = await misskeyApi<MisskeyEntity[]>(props.pagination.endpoint, {
			...params,
			limit: SECOND_FETCH_LIMIT,
			...(offsetMode ? {
				offset: fetchedItemCount.value,
			} : {
				sinceId: Array.from(items.value.keys()).at(-1),
			}),
		});
		fetchedItemCount.value += res.length;
		if (res.length === 0) {
			await appendItemsWithLimit(res, 'tail');
			more.value = false;
			exhausted.value = items.value.size > 0;
		} else {
			await appendItemsWithLimit(res, 'tail');
			more.value = res.length >= SECOND_FETCH_LIMIT;
			exhausted.value = !more.value && items.value.size > 0;
		}
	} finally {
		moreFetching.value = false;
	}
};

/**
 * Appear（IntersectionObserver）によってfetchMoreが呼ばれる場合、
 * APPEAR_MINIMUM_INTERVALミリ秒以内に2回fetchMoreが呼ばれるのを防ぐ
 */
const fetchMoreApperTimeoutFn = (): void => {
	preventAppearFetchMore.value = false;
	preventAppearFetchMoreTimer.value = null;
};
const fetchMoreAppearTimeout = (): void => {
	preventAppearFetchMore.value = true;
	preventAppearFetchMoreTimer.value = window.setTimeout(fetchMoreApperTimeoutFn, APPEAR_MINIMUM_INTERVAL);
};

const appearFetchMore = async (): Promise<void> => {
	if (preventAppearFetchMore.value) return;
	await fetchMore();
	fetchMoreAppearTimeout();
};

const appearFetchMoreAhead = async (): Promise<void> => {
	if (preventAppearFetchMore.value) return;
	await fetchMoreAhead();
	fetchMoreAppearTimeout();
};

function isCurrentScrollAtHead(): boolean {
	if (rootEl.value == null) return false;
	return (props.pagination.reversed ? isTailVisible : isHeadVisible)(rootEl.value, TOLERANCE);
}

function rememberCurrentHeadState(): void {
	lastKnownHeadState = isCurrentScrollAtHead();
}

function setupHeadStateScrollListener(): void {
	removeHeadStateScrollListener?.();
	removeHeadStateScrollListener = null;

	if (rootEl.value == null) {
		lastKnownHeadState = false;
		return;
	}

	rememberCurrentHeadState();
	const scrollTarget = scrollableElement.value ?? window;
	const onScroll = () => rememberCurrentHeadState();
	scrollTarget.addEventListener('scroll', onScroll, { passive: true });
	removeHeadStateScrollListener = () => {
		scrollTarget.removeEventListener('scroll', onScroll);
	};
}

const isHead = (): boolean => isBackTop.value || isCurrentScrollAtHead();

watch(visibility, () => {
	if (visibility.value === 'hidden') {
		timerForSetPause = window.setTimeout(() => {
			isPausingUpdate = true;
			timerForSetPause = null;
		},
		BACKGROUND_PAUSE_WAIT_SEC * 1000);
	} else { // 'visible'
		if (timerForSetPause) {
			window.clearTimeout(timerForSetPause);
			timerForSetPause = null;
		} else {
			isPausingUpdate = false;
			if (isHead()) {
				executeQueue();
			}
		}
	}
});

/**
 * 最新のものとして1つだけアイテムを追加する
 * ストリーミングから降ってきたアイテムはこれで追加する
 * @param item アイテム
 */
function prepend(item: MisskeyEntity): void {
	if (items.value.size === 0) {
		items.value.set(item.id, item);
		fetching.value = false;
		return;
	}

	if (_DEV_) console.debug(isHead(), isPausingUpdate);

	if (isHead() && !isPausingUpdate) unshiftItems([item]);
	else prependQueue(item);
}

/**
 * 新着アイテムをitemsの先頭に追加し、displayLimitを適用する
 * @param newItems 新しいアイテムの配列
 */
function unshiftItems(newItems: MisskeyEntity[]) {
	const nextEntries = [...arrayToEntries(newItems), ...Array.from(items.value)];
	const nextLength = new Map(nextEntries).size;
	items.value = limitItemEntries(nextEntries, 'head');
	// if we truncated, mark that there are more values to fetch
	if (items.value.size < nextLength) more.value = true;
}

function executeQueue() {
	unshiftItems(Array.from(queue.value.values()));
	queue.value = new Map();
}

function prependQueue(newItem: MisskeyEntity) {
	queue.value = limitItemEntries([[newItem.id, newItem], ...queue.value], 'head');
}

/*
 * アイテムを末尾に追加する（使うの？）
 */
const appendItem = (item: MisskeyEntity): void => {
	items.value = limitItemEntries([...Array.from(items.value), [item.id, item]], 'tail');
};

const removeItem = (id: string) => {
	items.value.delete(id);
	queue.value.delete(id);
};

const updateItem = (id: MisskeyEntity['id'], replacer: (old: MisskeyEntity) => MisskeyEntity): void => {
	const item = items.value.get(id);
	if (item) items.value.set(id, replacer(item));

	const queueItem = queue.value.get(id);
	if (queueItem) queue.value.set(id, replacer(queueItem));
};

onActivated(() => {
	isBackTop.value = false;
});

onDeactivated(() => {
	isBackTop.value = lastKnownHeadState;
});

function toBottom() {
	scrollToBottom(rootEl.value!);
}

onBeforeMount(() => {
	init().then(() => {
		if (props.pagination.reversed) {
			nextTick(() => {
				toBottomTimer = window.setTimeout(() => {
					toBottomTimer = null;
					toBottom();
				}, 800);

				// scrollToBottomでmoreFetchingボタンが画面外まで出るまで
				// more = trueを遅らせる
				moreFetchingTimer = window.setTimeout(() => {
					moreFetchingTimer = null;
					moreFetching.value = false;
				}, 2000);
			});
		}
	});
});

onBeforeUnmount(() => {
	if (timerForSetPause) {
		window.clearTimeout(timerForSetPause);
		timerForSetPause = null;
	}
	if (preventAppearFetchMoreTimer.value) {
		window.clearTimeout(preventAppearFetchMoreTimer.value);
		preventAppearFetchMoreTimer.value = null;
	}
	if (toBottomTimer) {
		window.clearTimeout(toBottomTimer);
		toBottomTimer = null;
	}
	if (moreFetchingTimer) {
		window.clearTimeout(moreFetchingTimer);
		moreFetchingTimer = null;
	}
	scrollRemove.value?.();
	scrollRemove.value = null;
	removeHeadStateScrollListener?.();
	removeHeadStateScrollListener = null;
	scrollObserver.value?.disconnect();
});

defineExpose({
	items,
	queue,
	backed: backed.value,
	more,
	reload,
	prepend,
	append: appendItem,
	removeItem,
	updateItem,
});
</script>

<style lang="scss" module>
.transition_fade_enterActive,
.transition_fade_leaveActive {
	transition: opacity 0.125s ease;
}
.transition_fade_enterFrom,
.transition_fade_leaveTo {
	opacity: 0;
}

.more {
	margin-left: auto;
	margin-right: auto;
}

.exhausted {
	padding: 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
}
</style>
