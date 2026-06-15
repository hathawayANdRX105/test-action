<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="[$style.root, { [$style.wide]: !narrow }]">
	<template v-if="!narrow">
		<!-- PC幅: 左に会話リスト + 右にチャット。betaホームは一切描画しない -->
		<div :class="$style.sidebar">
			<XChatSidebar :activeUserId="userId" :activeRoomId="roomId" @ready="onSidebarReady"/>
		</div>
		<div :class="$style.main">
			<XRoomView v-if="userId != null || roomId != null" :key="userId ?? roomId" :userId="userId" :roomId="roomId" :messageId="messageId"/>
			<div v-else-if="noConversation" :class="$style.empty">
				<i class="ti ti-messages" :class="$style.emptyIcon"></i>
				<span>{{ i18n.ts._chat.selectConversation }}</span>
			</div>
			<div v-else :class="$style.placeholder"><MkLoading/></div>
		</div>
	</template>
	<template v-else>
		<!-- モバイル幅: 会話を選ぶ前は会話リスト(サイドバー)を全幅表示。会話を選んだらチャットを全幅表示 -->
		<XRoomView v-if="userId != null || roomId != null" :key="userId ?? roomId" :userId="userId" :roomId="roomId" :messageId="messageId"/>
		<div v-else :class="$style.narrowSidebar">
			<XChatSidebar :activeUserId="userId" :activeRoomId="roomId"/>
		</div>
	</template>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import XChatSidebar from './chat-sidebar.vue';
import XRoomView from './room.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';

const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	messageId?: string;
}>();

// PC幅で会話が1つも無いときだけ「会話を選択」プレースホルダを出す。それまではローディング。
const noConversation = ref(false);

// PC幅で会話未選択のとき、リスト先頭の会話を自動で開く（会話が無ければプレースホルダ）
function onSidebarReady(target: { roomId?: string; userId?: string } | null) {
	if (narrow.value) return;
	if (props.userId != null || props.roomId != null) return;
	if (target?.roomId != null) {
		router.replace(`/chat/room/${target.roomId}`);
	} else if (target?.userId != null) {
		router.replace(`/chat/user/${target.userId}`);
	} else {
		noConversation.value = true;
	}
}

// サイドバー(2カラム)を出すかは「ビューポート幅」で判定する。
// コンテナ幅で判定するとウィジェット出現などで非単調になり、画面が広いほど隠れる不具合になるため。
const NARROW_THRESHOLD = 1100;

const rootEl = shallowRef<HTMLElement | null>(null);
const narrow = ref(window.innerWidth < NARROW_THRESHOLD);

function updateNarrow() {
	narrow.value = window.innerWidth < NARROW_THRESHOLD;
}

onMounted(() => {
	updateNarrow();
	window.addEventListener('resize', updateNarrow);
});

onActivated(() => {
	updateNarrow();
});

onUnmounted(() => {
	window.removeEventListener('resize', updateNarrow);
});

definePage(() => ({
	title: i18n.ts.chat,
	icon: 'ti ti-messages',
	needWideArea: true,
	// チャットは二ペインで完結する全幅レイアウト。グローバルのウィジェット枠(旧レイアウト)は一切描画しない。
	// （PC幅で「リスト→ウィジェット枠→先頭ルーム」と多段で描画していた無駄をなくし、ウィジェット枠の出入りに
	//  伴うレイアウトのガタつき＝ルーム切替時に最下部へスクロールできない問題も解消する）
	keepWidgets: false,
}));
</script>

<style lang="scss" module>
.root {
	height: 100%;
	min-height: 0;
}

.wide {
	display: grid;
	grid-template-columns: minmax(220px, 260px) minmax(0, 1fr);
}

.sidebar {
	min-width: 0;
	min-height: 0;
	height: 100%;
	overflow: hidden;
}

.narrowSidebar {
	height: 100%;
	min-height: 0;
	overflow: hidden;
}

.main {
	min-width: 0;
	min-height: 0;
	height: 100%;
	overflow: hidden;
	display: flex;
	flex-direction: column;

	> * {
		flex: 1;
		min-height: 0;
	}
}

.placeholder {
	display: grid;
	place-items: center;
	height: 100%;
}

.empty {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 12px;
	height: 100%;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
}

.emptyIcon {
	font-size: 2.5em;
	opacity: 0.6;
}
</style>
