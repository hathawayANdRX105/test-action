<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.iconOnly]: iconOnly }]">
	<div :class="$style.body">
		<div :class="$style.top">
			<div :class="$style.banner" :style="{ backgroundImage: `url(${ instance.bannerUrl })` }"></div>
			<button v-tooltip.right="iconOnly ? instance.name ?? i18n.ts.instance : null" class="_button" :class="$style.instance" @click="openInstanceMenu">
				<img :src="instance.sidebarLogoUrl && !iconOnly ? instance.sidebarLogoUrl : instance.iconUrl || '/favicon.ico'" alt="" :class="instance.sidebarLogoUrl && !iconOnly ? $style.wideInstanceIcon : $style.instanceIcon" style="viewTransitionName: navbar-serverIcon;"/>
			</button>
		</div>
		<div :class="$style.middle">
			<MkA v-tooltip.right="iconOnly ? i18n.ts.home : null" :class="$style.item" :activeClass="$style.active" to="/" exact>
				<i :class="$style.itemIcon" class="ti ti-home ti-fw" style="viewTransitionName: navbar-homeIcon;"></i><span :class="$style.itemText">{{ i18n.ts.home }}</span>
			</MkA>
			<template v-for="(item, index) in filteredMenu" :key="`${item}-${index}`">
				<div v-if="item === '-'" :class="$style.divider"></div>
				<component
					:is="navbarItemDef[item].to ? 'MkA' : 'button'"
					v-else-if="navbarItemDef[item] && (navbarItemDef[item].show !== false)"
					v-tooltip.right="iconOnly ? navbarItemDef[item].title : null"
					class="_button"
					:class="[$style.item, { [$style.active]: navbarItemDef[item].active }]"
					:activeClass="$style.active"
					:to="navbarItemDef[item].to"
					v-on="navbarItemDef[item].action ? { click: navbarItemDef[item].action } : {}"
				>
					<i class="ti-fw" :class="[$style.itemIcon, navbarItemDef[item].icon]" :style="{ viewTransitionName: 'navbar-item-' + item }"></i><span :class="$style.itemText">{{ navbarItemDef[item].title }}</span>
					<span v-if="navbarItemDef[item].indicated" :class="$style.itemIndicator" class="_blink">
						<span v-if="navbarItemDef[item].indicateValue" class="_indicateCounter" :class="$style.itemIndicateValueIcon">{{ navbarItemDef[item].indicateValue }}</span>
						<i v-else class="_indicatorCircle"></i>
					</span>
				</component>
			</template>
			<div :class="$style.divider"></div>
			<MkA v-if="$i != null && ($i.isAdmin || $i.isModerator)" v-tooltip.right="iconOnly ? i18n.ts.controlPanel : null" :class="$style.item" :activeClass="$style.active" to="/admin">
				<i :class="$style.itemIcon" class="ti ti-dashboard ti-fw" style="viewTransitionName: navbar-controlPanel;"></i><span :class="$style.itemText">{{ i18n.ts.controlPanel }}</span>
			</MkA>
			<button class="_button" :class="$style.item" @click="more">
				<i :class="$style.itemIcon" class="ti ti-grid-dots ti-fw" style="viewTransitionName: navbar-more;"></i><span :class="$style.itemText">{{ i18n.ts.more }}</span>
				<span v-if="otherMenuItemIndicated" :class="$style.itemIndicator" class="_blink"><i class="_indicatorCircle"></i></span>
			</button>
			<MkA v-tooltip.right="iconOnly ? i18n.ts.settings : null" :class="$style.item" :activeClass="$style.active" to="/settings">
				<i :class="$style.itemIcon" class="ti ti-settings ti-fw" style="viewTransitionName: navbar-settings;"></i><span :class="$style.itemText">{{ i18n.ts.settings }}</span>
			</MkA>
		</div>
		<div :class="$style.bottom">
			<button v-if="showWidgetButton" class="_button" :class="[$style.widget]" @click="() => emit('widgetButtonClick')">
				<i class="ti ti-apps ti-fw"></i>
			</button>
			<button v-tooltip.right="iconOnly ? i18n.ts.note : null" class="_button" :class="[$style.post]" data-cy-open-post-form @click="() => { os.post(); }">
				<i class="ti ti-pencil ti-fw" :class="$style.postIcon"></i><span :class="$style.postText">{{ i18n.ts.note }}</span>
			</button>
			<button v-if="$i != null" v-tooltip.right="iconOnly ? `${i18n.ts.account}: @${$i.username}` : null" class="_button" :class="[$style.account]" @click="openAccountMenu">
				<MkAvatar :user="$i" :class="$style.avatar" style="viewTransitionName: navbar-avatar;"/><MkAcct class="_nowrap" :class="$style.acct" :user="$i"/>
			</button>
		</div>
	</div>

	<!--
	<svg viewBox="0 0 16 48" :class="$style.subButtonShape">
		<g transform="matrix(0.333333,0,0,0.222222,0.000895785,13.3333)">
			<path d="M23.935,-24C37.223,-24 47.995,-7.842 47.995,12.09C47.995,34.077 47.995,62.07 47.995,84.034C47.995,93.573 45.469,102.721 40.972,109.466C36.475,116.211 30.377,120 24.018,120L23.997,120C10.743,120 -0.003,136.118 -0.003,156C-0.003,156 -0.003,156 -0.003,156L-0.003,-60L-0.003,-59.901C-0.003,-50.379 2.519,-41.248 7.007,-34.515C11.496,-27.782 17.584,-24 23.931,-24C23.932,-24 23.934,-24 23.935,-24Z" style="fill:var(--MI_THEME-navBg);"/>
		</g>
	</svg>
	-->

	<div v-if="!forceIconOnly && prefer.r.showNavbarSubButtons.value" :class="$style.subButtons">
		<div :class="[$style.subButton, $style.menuEditButton]">
			<svg viewBox="0 0 16 64" :class="$style.subButtonShape">
				<g transform="matrix(0.333333,0,0,0.222222,0.000895785,21.3333)">
					<path d="M47.488,7.995C47.79,10.11 47.943,12.266 47.943,14.429C47.997,26.989 47.997,84 47.997,84C47.997,84 44.018,118.246 23.997,133.5C-0.374,152.07 -0.003,192 -0.003,192L-0.003,-96C-0.003,-96 0.151,-56.216 23.997,-37.5C40.861,-24.265 46.043,-1.243 47.488,7.995Z" style="fill:var(--MI_THEME-navBg);"/>
				</g>
			</svg>
			<button class="_button" :class="$style.subButtonClickable" @click="menuEdit"><i :class="$style.subButtonIcon" class="ti ti-settings-2"></i></button>
		</div>
		<div :class="$style.subButtonGapFill"></div>
		<div :class="$style.subButtonGapFillDivider"></div>
		<div :class="[$style.subButton, $style.toggleButton]">
			<svg viewBox="0 0 16 64" :class="$style.subButtonShape">
				<g transform="matrix(0.333333,0,0,0.222222,0.000895785,21.3333)">
					<path d="M47.488,7.995C47.79,10.11 47.943,12.266 47.943,14.429C47.997,26.989 47.997,84 47.997,84C47.997,84 44.018,118.246 23.997,133.5C-0.374,152.07 -0.003,192 -0.003,192L-0.003,-96C-0.003,-96 0.151,-56.216 23.997,-37.5C40.861,-24.265 46.043,-1.243 47.488,7.995Z" style="fill:var(--MI_THEME-navBg);"/>
				</g>
			</svg>
			<button class="_button" :class="$style.subButtonClickable" @click="toggleIconOnly"><i v-if="iconOnly" class="ti ti-chevron-right" :class="$style.subButtonIcon"></i><i v-else class="ti ti-chevron-left" :class="$style.subButtonIcon"></i></button>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, onBeforeUnmount, ref, watch } from 'vue';
import { openInstanceMenu } from './common.js';
import * as os from '@/os.js';
import { navbarItemDef } from '@/navbar.js';
import { store } from '@/store.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import { useRouter } from '@/router.js';
import { prefer } from '@/preferences.js';
import { openAccountMenu as openAccountMenu_ } from '@/accounts.js';
import { $i } from '@/i.js';

const currentMenu = Array.isArray(prefer.s.menu) ? prefer.s.menu : [];
if ($i != null) {
	let nextMenu = currentMenu.filter(item => item !== 'search');
	if (!nextMenu.includes('explore')) {
		nextMenu = ['explore', ...nextMenu];
	}
	if (!nextMenu.includes('chat') && navbarItemDef.chat.show !== false) {
		nextMenu = [...nextMenu, 'chat'];
	}
	if (!nextMenu.includes('ai') && navbarItemDef.ai.show !== false) {
		nextMenu = [...nextMenu, 'ai'];
	}
	if (nextMenu.length !== currentMenu.length || nextMenu.some((item, index) => item !== currentMenu[index])) {
		prefer.commit('menu', nextMenu);
	}
}
const filteredMenu = computed(() => prefer.r.menu.value.filter(item => item !== 'search'));

const router = useRouter();

const props = defineProps<{
	showWidgetButton?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'widgetButtonClick'): void;
}>();

const forceIconOnly = ref(window.innerWidth <= 1279);
const iconOnly = computed(() => {
	return forceIconOnly.value || (store.r.menuDisplay.value === 'sideIcon');
});

const otherMenuItemIndicated = computed(() => {
	for (const def in navbarItemDef) {
		if (filteredMenu.value.includes(def)) continue;
		if (navbarItemDef[def].indicated) return true;
	}
	return false;
});

function calcViewState() {
	forceIconOnly.value = window.innerWidth <= 1279;
}

window.addEventListener('resize', calcViewState, { passive: true });

onBeforeUnmount(() => {
	window.removeEventListener('resize', calcViewState);
});

watch(store.r.menuDisplay, () => {
	calcViewState();
});

function toggleIconOnly() {
	if (window.document.startViewTransition && prefer.s.animation) {
		window.document.startViewTransition(() => {
			store.set('menuDisplay', iconOnly.value ? 'sideFull' : 'sideIcon');
		});
	} else {
		store.set('menuDisplay', iconOnly.value ? 'sideFull' : 'sideIcon');
	}
}

function openAccountMenu(ev: MouseEvent) {
	openAccountMenu_({
		withExtraOperation: true,
	}, ev);
}

function more(ev: MouseEvent) {
	const target = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!target) return;
	const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkLaunchPad.vue')), {
		src: target,
	}, {
		closed: () => dispose(),
	});
}

function menuEdit() {
	router.push('/settings/navbar');
}
</script>

<style lang="scss" module>
.root {
	--nav-width: clamp(280px, 18vw, 320px);
	--nav-icon-only-width: 80px;
	--nav-bg-transparent: color(from var(--MI_THEME-navBg) srgb r g b / 0.5);

	--subButtonWidth: 20px;

	flex: 0 0 var(--nav-width);
	width: var(--nav-width);
	min-width: var(--nav-width);
	max-width: var(--nav-width);
	box-sizing: border-box;
}

:global(html[data-color-scheme=dark]) {
	.root {
		--navbar-readable-fg: #fff;
		--navbar-readable-fg-muted: color-mix(in srgb, #fff 82%, transparent);
	}

	.middle .item,
	.middle .item:hover,
	.middle .item.active,
	.middle .item:focus {
		color: #fff !important;
		-webkit-text-fill-color: #fff !important;
	}

	.middle .itemIcon,
	.middle .itemIcon::before,
	.middle .itemIcon::after,
	.middle .itemIcon * {
		color: #fff !important;
		-webkit-text-fill-color: #fff !important;
		opacity: 1 !important;
		text-shadow: 0 0 0 #fff;
	}
}

:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-item-"]),
:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-itemIcon-"]),
:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-itemText-"]),
:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-active-"][class*="navbar-item-"]) {
	color: #fff !important;
	-webkit-text-fill-color: #fff !important;
	opacity: 1 !important;
}

:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-itemIcon-"]::before),
:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-itemIcon-"]::after),
:global(html[data-color-scheme=dark] [class*="navbar-middle-"] [class*="navbar-itemIcon-"] *) {
	color: #fff !important;
	-webkit-text-fill-color: #fff !important;
	opacity: 1 !important;
	text-shadow: 0 0 0 #fff;
}

:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-item-"][class*="navbar-item-"]),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-item-"][class*="navbar-active-"]),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-item-"][class*="navbar-item-"] *) {
	color: #fff !important;
	-webkit-text-fill-color: #fff !important;
	opacity: 1 !important;
}

:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-itemIcon-"][class*="navbar-itemIcon-"]),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-itemIcon-"][class*="navbar-itemIcon-"]::before),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] [class*="navbar-itemIcon-"][class*="navbar-itemIcon-"]::after),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] i[class*="ph-"]::before),
:global(html[data-color-scheme=dark] [class*="navbar-root-"][class*="navbar-root-"] [class*="navbar-middle-"][class*="navbar-middle-"] i[class*="ti-"]::before) {
	color: #fff !important;
	-webkit-text-fill-color: #fff !important;
	fill: #fff !important;
	stroke: #fff !important;
	opacity: 1 !important;
	text-shadow: 0 0 0 #fff;
}

.body {
	position: sticky;
	top: 0;
	width: var(--nav-icon-only-width);
	height: 100dvh;
	min-height: 0;
	box-sizing: border-box;
	overflow: hidden;
	overflow-x: clip;
	overscroll-behavior: contain;
	background: var(--MI_THEME-navBg);
	contain: strict;
	display: flex;
	flex-direction: column;
	direction: rtl; // スクロールバーを左に表示したいため
}

.top {
	direction: ltr;
}

.middle {
	direction: ltr;
	flex: 1 1 auto;
	min-height: 0;
	overflow-x: hidden;
	overflow-y: auto;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scroll-padding-bottom: 16px;
}

.bottom {
	direction: ltr;
	position: relative;
	z-index: 10;
	flex: 0 0 auto;
	max-height: min(220px, 42dvh);
	box-sizing: border-box;
	overflow: hidden;
	background: var(--MI_THEME-navBg);
	box-shadow: 0 -12px 20px var(--MI_THEME-navBg);
}

.subButtons {
	position: fixed;
	left: var(--nav-width);
	bottom: 80px;
	z-index: 1001;
	box-sizing: border-box;
}

.subButton {
	display: block;
	position: relative;
	z-index: 1002;
	width: var(--subButtonWidth);
	height: 50px;
	box-sizing: border-box;
	align-content: center;
}

.subButtonShape {
	position: absolute;
	z-index: -1;
	top: 0;
	bottom: 0;
	left: 0;
	margin: auto;
	width: var(--subButtonWidth);
	height: calc(var(--subButtonWidth) * 4);
}

.subButtonClickable {
	position: absolute;
	display: block;
	max-width: unset;
	width: 24px;
	height: 42px;
	top: 0;
	bottom: 0;
	left: -4px;
	margin: auto;
	font-size: 10px;

	&:hover {
		color: var(--MI_THEME-fgHighlighted);

		.subButtonIcon {
			opacity: 1;
		}
	}
}

.subButtonIcon {
	margin-left: -4px;
	opacity: 0.7;
}

.subButtonGapFill {
	position: relative;
	z-index: 1001;
	width: var(--subButtonWidth);
	height: 64px;
	margin-top: -32px;
	margin-bottom: -32px;
	pointer-events: none;
	background: var(--MI_THEME-navBg);
}

.subButtonGapFillDivider {
	position: relative;
	z-index: 1010;
	margin-left: -2px;
	width: 14px;
	height: 1px;
	background: var(--MI_THEME-divider);
	pointer-events: none;
}

.root:not(.iconOnly) {
	.body {
		width: var(--nav-width);
		min-width: var(--nav-width);
		max-width: var(--nav-width);
	}

	.top {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 20px 0;
		background: var(--nav-bg-transparent);
		-webkit-backdrop-filter: var(--MI-blur, blur(8px));
		backdrop-filter: var(--MI-blur, blur(8px));
	}

	.banner {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background-size: cover;
		background-position: center center;
		-webkit-mask-image: linear-gradient(0deg, rgba(0,0,0,0) 15%, rgba(0,0,0,0.75) 100%);
		mask-image: linear-gradient(0deg, rgba(0,0,0,0) 15%, rgba(0,0,0,0.75) 100%);
	}

	.instance {
		position: relative;
		display: block;
		text-align: center;
		width: 100%;

		&:focus-visible {
			outline: none;

			> .instanceIcon {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: 2px;
			}
		}
	}

	.instanceIcon {
		display: inline-block;
		width: 38px;
		aspect-ratio: 1;
		border-radius: 8px;
	}

	.wideInstanceIcon {
		display: inline-block;
		min-width: 38px;
		max-width: 100%;
		max-height: 80px;
		border-radius: 8px;
		object-fit: contain;
	}

	.bottom {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px 14px 20px;
		background: var(--MI_THEME-navBg);
		-webkit-backdrop-filter: var(--MI-blur, blur(8px));
		backdrop-filter: var(--MI-blur, blur(8px));
	}

	.post {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		height: 44px;
		padding: 0 16px;
		color: var(--MI_THEME-fgOnAccent);
		font-weight: bold;
		text-align: left;
		box-sizing: border-box;
		border-radius: var(--MI-radius-ellipse);
		background: #1d9bf0;
		color: #fff;
		overflow: clip;

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 2px var(--MI_THEME-fgOnAccent) inset;
		}

		&:hover, &.active {
			background: #1a8cd8;
		}
	}

	.postIcon {
		position: relative;
		width: 32px;
		margin-right: 8px;
		text-align: center;
		flex-shrink: 0;
		z-index: 1;
	}

	.postText {
		position: relative;
		z-index: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account {
		position: relative;
		display: flex;
		align-items: center;
		width: 100%;
		flex: 0 0 auto;
		min-height: 44px;
		padding: 6px 16px;
		text-align: left;
		box-sizing: border-box;
		border-radius: var(--MI-radius-ellipse);
		background: var(--MI_THEME-navBg);
		overflow: clip;
		z-index: 1;

		&:hover, &:focus {
			background: var(--MI_THEME-accentedBg);
		}

		&:focus-visible {
			outline: none;
			background: var(--MI_THEME-accentedBg);

			> .avatar {
				box-shadow: 0 0 0 4px var(--MI_THEME-focus);
			}
		}
	}

	.avatar {
		display: block;
		flex-shrink: 0;
		position: relative;
		width: 32px;
		aspect-ratio: 1;
		margin-right: 8px;
	}

	.acct {
		display: block;
		flex-shrink: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.middle {
		padding: 4px 0 12px;
	}

	.divider {
		margin: 10px 14px;
		border-top: solid 0.5px var(--MI_THEME-divider);
	}

	.item {
		position: relative;
		display: grid;
		grid-template-columns: 32px minmax(0, 1fr);
		column-gap: 8px;
		align-items: center;
		height: 44px;
		margin: 2px 14px;
		padding: 0 18px;
		text-overflow: ellipsis;
		overflow: hidden;
		white-space: nowrap;
		width: calc(100% - 28px);
		text-align: left;
		box-sizing: border-box;
		border-radius: var(--MI-radius-ellipse);
		color: var(--navbar-readable-fg, var(--MI_THEME-navFg));

		&:hover {
			text-decoration: none;
			color: var(--navbar-readable-fg, light-dark(hsl(from var(--MI_THEME-navFg) h s calc(l - 17)), hsl(from var(--MI_THEME-navFg) h s calc(l + 17))));
		}

		&.active {
			color: var(--navbar-readable-fg, var(--MI_THEME-navActive));
		}

		&:focus-visible {
			outline: none;
			box-shadow: 0 0 0 2px var(--MI_THEME-focus) inset;
		}

		&:hover, &.active, &:focus {
			color: var(--navbar-readable-fg, var(--MI_THEME-navActive));
			background: var(--MI_THEME-accentedBg);
		}
	}

	.itemIcon {
		position: relative;
		display: inline-flex;
		justify-content: center;
		width: 32px;
		flex-shrink: 0;
		color: var(--navbar-readable-fg, inherit) !important;
		-webkit-text-fill-color: var(--navbar-readable-fg, currentColor) !important;
		opacity: 1;

		&::before,
		&::after {
			color: inherit !important;
			-webkit-text-fill-color: currentColor !important;
			opacity: 1;
		}
	}

	.itemIndicator {
		position: absolute;
		top: 6px;
		left: 36px;
		color: var(--MI_THEME-navIndicator);
		font-size: 8px;

		&:has(.itemIndicateValueIcon) {
			animation: none;
			left: auto;
			right: 16px;
			font-size: 10px;
		}
	}

	.itemText {
		position: relative;
		display: block;
		width: 100%;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-size: 0.9em;
	}

	.subButtons {
		left: var(--nav-width);
	}
}

.root.iconOnly {
	flex: 0 0 var(--nav-icon-only-width);
	width: var(--nav-icon-only-width);
	min-width: var(--nav-icon-only-width);
	max-width: var(--nav-icon-only-width);

	.body {
		width: var(--nav-icon-only-width);
		min-width: var(--nav-icon-only-width);
		max-width: var(--nav-icon-only-width);
	}

	.top {
		position: sticky;
		top: 0;
		z-index: 1;
		padding: 20px 0;
		background: var(--nav-bg-transparent);
		-webkit-backdrop-filter: var(--MI-blur, blur(8px));
		backdrop-filter: var(--MI-blur, blur(8px));
	}

	.instance {
		display: block;
		text-align: center;
		width: 100%;

		&:focus-visible {
			outline: none;

			> .instanceIcon {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: 2px;
			}
		}
	}

	.instanceIcon {
		display: inline-block;
		width: 30px;
		aspect-ratio: 1;
		border-radius: 8px;
	}

	.bottom {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 14px 0 calc(16px + env(safe-area-inset-bottom, 0px));
		background: var(--MI_THEME-navBg);
		-webkit-backdrop-filter: var(--MI-blur, blur(8px));
		backdrop-filter: var(--MI-blur, blur(8px));
	}

	.widget {
		display: block;
		position: relative;
		width: 100%;
		height: 52px;
		text-align: center;
	}

	.post {
		display: block;
		position: relative;
		width: 100%;
		height: 52px;
		text-align: center;

		&::before {
			content: "";
			display: block;
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			margin: auto;
			width: 52px;
			aspect-ratio: 1/1;
			border-radius: var(--MI-radius-full);
			background: #1d9bf0;
		}

		&:focus-visible {
			outline: none;

			&::before {
				outline: 2px solid var(--MI_THEME-fgOnAccent);
				outline-offset: -4px;
			}
		}

		&:hover, &.active {
			&::before {
				background: #1a8cd8;
			}
		}
	}

	.postIcon {
		position: relative;
		color: var(--MI_THEME-fgOnAccent);
	}

	.postText {
		display: none;
	}

	.account {
		display: block;
		text-align: center;
		padding: 20px 0;
		width: 100%;
		overflow: clip;

		&:focus-visible {
			outline: none;

			> .avatar {
				box-shadow: 0 0 0 4px var(--MI_THEME-focus);
			}
		}
	}

	.avatar {
		display: inline-block;
		width: 38px;
		aspect-ratio: 1;
	}

	.acct {
		display: none;
	}

	.middle {
		padding-bottom: 12px;
	}

	.divider {
		margin: 8px auto;
		width: calc(100% - 32px);
		border-top: solid 0.5px var(--MI_THEME-divider);
	}

	.item {
		display: block;
		position: relative;
		padding: 18px 0;
		width: 100%;
		text-align: center;
		color: var(--navbar-readable-fg, var(--MI_THEME-navFg));

		&:focus-visible {
			outline: none;

			&::before {
				outline: 2px solid var(--MI_THEME-focus);
				outline-offset: -2px;
			}
		}

		&:hover, &.active, &:focus {
			text-decoration: none;
			color: var(--navbar-readable-fg, var(--MI_THEME-navActive));

			&::before {
				content: "";
				display: block;
				height: 100%;
				aspect-ratio: 1;
				margin: auto;
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				bottom: 0;
				border-radius: var(--MI-radius-ellipse);
				background: var(--MI_THEME-accentedBg);
			}

			> .icon,
			> .text {
				opacity: 1;
			}
		}
	}

	.itemIcon {
		display: block;
		margin: 0 auto;
		color: var(--navbar-readable-fg, inherit) !important;
		-webkit-text-fill-color: var(--navbar-readable-fg, currentColor) !important;
		opacity: 1;

		&::before,
		&::after {
			color: inherit !important;
			-webkit-text-fill-color: currentColor !important;
			opacity: 1;
		}
	}

	.itemText {
		display: none;
	}

	.itemIndicator {
		position: absolute;
		top: 6px;
		left: 24px;
		color: var(--MI_THEME-navIndicator);
		font-size: 8px;

		&:has(.itemIndicateValueIcon) {
			animation: none;
			top: 4px;
			left: auto;
			right: 4px;
			font-size: 10px;
		}
	}

	.subButtons {
		left: var(--nav-icon-only-width);
	}
}
</style>
