<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { '_forceShrinkSpacer': deviceKind === 'smartphone' }]">
	<XTitlebar v-if="prefer.r.showTitlebar.value" style="flex-shrink: 0;"/>

	<div :class="[$style.nonTitlebarArea, pageMetadata?.needWideArea && pageMetadata?.keepWidgets ? $style.wideWithWidgets : null, pageMetadata?.needWideArea && (pageMetadata?.bustLayoutCap || !pageMetadata?.keepWidgets) ? $style.bustCap : null]">
		<XSidebar v-if="!isMobile" :class="$style.sidebar" :showWidgetButton="!isDesktop" @widgetButtonClick="widgetsShowing = true"/>

		<div :class="[
			$style.contents,
			!isMobile && prefer.r.showTitlebar.value ? $style.withSidebarAndTitlebar : null,
			isDesktop && !pageMetadata?.needWideArea ? $style.standardContents : null,
		]" @contextmenu.stop="onContextmenu">
			<div>
				<XPreferenceRestore v-if="shouldSuggestRestoreBackup"/>
				<XAnnouncements v-if="$i"/>
				<XStatusBars :class="$style.statusbars"/>
			</div>
			<StackingRouterView v-if="prefer.s['experimental.stackingRouterView']" :class="$style.content"/>
			<RouterView v-else :class="$style.content"/>
			<XMobileFooterMenu v-if="isMobile" ref="navFooter" v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
		</div>

		<div v-if="isDesktop && (!pageMetadata?.needWideArea || pageMetadata?.keepWidgets)" :class="$style.widgets">
			<XWidgets/>
		</div>
	</div>

	<XCommon v-model:drawerMenuShowing="drawerMenuShowing" v-model:widgetsShowing="widgetsShowing"/>
</div>
</template>

<script lang="ts" setup>
import { defineAsyncComponent, provide, onUnmounted, computed, ref } from 'vue';
import { instanceName } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import XCommon from './_common_/common.vue';
import type { PageMetadata } from '@/page.js';
import XMobileFooterMenu from '@/ui/_common_/mobile-footer-menu.vue';
import XPreferenceRestore from '@/ui/_common_/PreferenceRestore.vue';
import XTitlebar from '@/ui/_common_/titlebar.vue';
import XSidebar from '@/ui/_common_/navbar.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { provideMetadataReceiver, provideReactiveMetadata } from '@/page.js';
import { deviceKind } from '@/utility/device-kind.js';
import { miLocalStorage } from '@/local-storage.js';
import { mainRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import { shouldSuggestRestoreBackup } from '@/preferences/utility.js';
import { DI } from '@/di.js';

const XWidgets = defineAsyncComponent(() => import('./_common_/widgets.vue'));
const XStatusBars = defineAsyncComponent(() => import('@/ui/_common_/statusbars.vue'));
const XAnnouncements = defineAsyncComponent(() => import('@/ui/_common_/announcements.vue'));

const isRoot = computed(() => mainRouter.currentRoute.value.name === 'index');

const DESKTOP_THRESHOLD = 1100;
const MOBILE_THRESHOLD = 700;

const isDesktop = ref(window.innerWidth >= DESKTOP_THRESHOLD);
const isMobile = ref(window.innerWidth <= MOBILE_THRESHOLD);

function updateLayoutMode() {
	isDesktop.value = window.innerWidth >= DESKTOP_THRESHOLD;
	isMobile.value = window.innerWidth <= MOBILE_THRESHOLD;
}

window.addEventListener('resize', updateLayoutMode, { passive: true });
onUnmounted(() => {
	window.removeEventListener('resize', updateLayoutMode);
});

const pageMetadata = ref<null | PageMetadata>(null);
const widgetsShowing = ref(false);

provide(DI.router, mainRouter);
provideMetadataReceiver((metadataGetter) => {
	const info = metadataGetter();
	pageMetadata.value = info;
	if (pageMetadata.value) {
		if (isRoot.value && pageMetadata.value.title === instanceName) {
			window.document.title = pageMetadata.value.title;
		} else {
			window.document.title = `${pageMetadata.value.title} | ${instanceName}`;
		}
	}
});
provideReactiveMetadata(pageMetadata);

const drawerMenuShowing = ref(false);

mainRouter.on('change', () => {
	drawerMenuShowing.value = false;
});

if (window.innerWidth > 1024) {
	const tempUI = miLocalStorage.getItem('ui_temp');
	if (tempUI) {
		miLocalStorage.setItem('ui', tempUI);
		miLocalStorage.removeItem('ui_temp');
		window.location.reload();
	}
}

const onContextmenu = (ev) => {
	if (isLink(ev.target)) return;
	if (['INPUT', 'TEXTAREA', 'IMG', 'VIDEO', 'CANVAS'].includes(ev.target.tagName) || ev.target.attributes['contenteditable']) return;
	if (window.getSelection()?.toString() !== '') return;
	const path = mainRouter.getCurrentFullPath();
	os.contextMenu([{
		type: 'label',
		text: path,
	}, {
		icon: 'ti ti-window-maximize',
		text: i18n.ts.openInWindow,
		action: () => {
			os.pageWindow(path);
		},
	}], ev);
};
</script>

<style lang="scss" module>
$ui-font-size: 1em; // TODO: どこかに集約したい
$widgets-hide-threshold: 1600px;

.root {
	height: 100dvh;
	overflow: clip;
	contain: strict;
	display: flex;
	flex-direction: column;
	background: var(--MI_THEME-navBg);
}

.nonTitlebarArea {
	--layout-main-column-width: 600px;
	--layout-side-rail-width: 350px;
	--layout-column-gap: 30px;
	--layout-page-max-width: calc(var(--nav-width, 260px) + var(--layout-main-column-width) + var(--layout-side-rail-width) + var(--layout-column-gap));

	display: flex;
	flex: 1;
	min-height: 0;
	width: 82vw;
	max-width: 82vw;
	margin-inline: auto;
	align-self: center;

	// 移动端:撑满整屏,不留左右 9vw 留白(设置/个人资料/控制面板等没声明 needWideArea 的页都受影响)
	@media (max-width: 700px) {
		width: 100%;
		max-width: 100%;
		margin-inline: 0;
	}
}

// timeline.vue 等、ページ自身で2カラムを描画するページ用。
// 通常ページと同じ 82vw 外枠(左右に 9vw の余白)を明示し、
// .wideWithWidgets と違って widgets カラムは生やさない(timeline は自前の右レール持ち)。
.bustCap {
	width: 82vw;
	max-width: 82vw;
	margin-inline: auto;

	// 移动端:必须撑满,不留任何缝隙
	@media (max-width: 700px) {
		width: 100%;
		max-width: 100%;
		margin-inline: 0;
	}
}

// ウィジェット併用のワイドページ用。
// 通常ページと同じ 82vw 外枠を維持し、メニュー遷移時の横幅差をなくす。
.wideWithWidgets {
	width: 82vw;
	max-width: 82vw;
	margin-inline: auto;

	// 会話サイドバー + 本文の幅を優先し、超ワイド画面でのみウィジェットを表示する
	.widgets {
		@media (max-width: 1600px) {
			display: none;
		}
	}
}

.sidebar {
	border-right: solid 0.5px var(--MI_THEME-divider);
}

.contents {
	display: flex;
	flex-direction: column;
	flex: 1;
	height: 100%;
	min-width: 0;

	&.withSidebarAndTitlebar {
		background: var(--MI_THEME-navBg);
		border-radius: 12px 0 0 0;
		overflow: clip;
	}
}

.standardContents {
	flex: 0 1 var(--layout-main-column-width);
	width: var(--layout-main-column-width);
	max-width: min(100%, var(--layout-main-column-width));
	min-width: 0;
}

.content {
	flex: 1;
	min-height: 0;
}

.statusbars {
	position: sticky;
	top: 0;
	left: 0;
}

.widgets {
	flex: 0 0 var(--layout-side-rail-width);
	width: var(--layout-side-rail-width);
	height: 100%;
	box-sizing: border-box;
	overflow: auto;
	margin-left: var(--layout-column-gap);
	padding: var(--MI-margin) var(--MI-margin) calc(var(--MI-margin) + env(safe-area-inset-bottom, 0px));
	border-left: solid 0.5px var(--MI_THEME-divider);
	background: var(--MI_THEME-bg);

	@media (max-width: $widgets-hide-threshold) {
		display: none;
	}
}
</style>
