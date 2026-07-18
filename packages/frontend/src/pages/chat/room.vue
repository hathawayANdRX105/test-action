<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div :class="$style.localHeader" data-chat-room-header data-chat-room-tabs>
		<div :class="$style.localTitle">
			<XRoomAvatar v-if="room" :room="room" :class="$style.localTitleAvatar"/>
			<MkAvatar v-else-if="user" :user="user" :class="$style.localTitleAvatar" indicator/>
			<span>{{ headerTitle }}</span>
		</div>
		<div :class="[$style.localTabsShell, { [$style.localTabsShellScrollable]: showChatTabsScrollControls }]">
			<button v-if="showChatTabsScrollControls" class="_button" :class="[$style.localTabsScrollButton, $style.localTabsScrollButtonLeft]" :disabled="!canScrollChatTabsLeft" :aria-label="i18n.ts.left" @click="scrollChatTabs('left')">
				<i class="ti ti-chevron-left"></i>
			</button>
			<div ref="localTabsEl" :class="$style.localTabs" @scroll="updateChatTabsScrollState">
				<button v-for="t in headerTabs" :key="t.key" class="_button" :class="[$style.localTab, { [$style.localTabActive]: tab === t.key }]" :data-chat-room-tab-key="t.key" :title="t.title" :aria-label="t.title" @click="selectTab(t.key)">
					<i :class="t.icon"></i>
					<span>{{ t.title }}</span>
				</button>
			</div>
			<button v-if="showChatTabsScrollControls" class="_button" :class="[$style.localTabsScrollButton, $style.localTabsScrollButtonRight]" :disabled="!canScrollChatTabsRight" :aria-label="i18n.ts.right" @click="scrollChatTabs('right')">
				<i class="ti ti-chevron-right"></i>
			</button>
		</div>
		<button v-if="headerActions.length > 0" class="_button" :class="$style.localMenu" :disabled="initializing" :title="headerActions[0].text" :aria-label="headerActions[0].text" @click="headerActions[0].handler">
			<i :class="headerActions[0].icon"></i>
		</button>
	</div>
	<!-- 聊天页签：置顶公告固定在标签栏下方、消息滚动区上方（不参与消息列表滚动） -->
	<div v-show="tab === 'chat'" :class="$style.chatColumn">
		<div
			v-if="showPinnedAnnouncement"
			:class="[$style.announcement, { [$style.announcementIsExpanded]: announcementExpanded }]"
		>
			<button
				type="button"
				class="_button"
				:class="$style.announcementMainButton"
				:title="announcementExpanded ? i18n.ts.showLess : i18n.ts.showMore"
				:aria-label="announcementExpanded ? i18n.ts.showLess : i18n.ts.showMore"
				:aria-expanded="announcementExpanded"
				@click="toggleAnnouncement"
			>
				<div :class="$style.announcementBody">
					<div :class="$style.announcementHeading">
						<i class="ti ti-pinned" :class="$style.announcementIcon" aria-hidden="true"></i>
						<span :class="$style.announcementTitle">{{ i18n.ts._chat.announcement }}</span>
						<span v-if="announcementExpanded" :class="$style.announcementToggle" aria-hidden="true">
							<span :class="$style.announcementToggleLabel">{{ i18n.ts.showLess }}</span>
							<i class="ti ti-chevron-up"></i>
						</span>
					</div>
					<div v-if="!announcementExpanded" :class="$style.announcementPreviewBlock">
						<div :class="$style.announcementPreview">{{ room!.announcement }}</div>
						<div :class="$style.announcementFade" aria-hidden="true">
							<span :class="$style.announcementEllipsis">···</span>
						</div>
					</div>
					<div v-if="announcementExpanded" :class="[$style.announcementText, $style.announcementTextExpanded]">{{ room!.announcement }}</div>
				</div>
			</button>
		</div>
		<div ref="chatPaneEl" :class="$style.chatPane">
		<div class="_gaps">
			<div v-if="initializing">
				<MkLoading/>
			</div>

			<div v-else-if="joinRequiredRoom" class="_gaps" :class="$style.joinRequired">
				<i class="ti ti-users-group" :class="$style.joinRequiredIcon"></i>
				<div :class="$style.joinRequiredTitle">{{ joinRequiredRoom.name }}</div>
				<div>{{ joinRequiredRoom.description === '' ? i18n.ts.noDescription : joinRequiredRoom.description }}</div>
				<div :class="$style.joinRequiredMeta">
					<span><MkAcct :user="joinRequiredRoom.owner"/></span>
					<span>{{ i18n.ts._chat.roomJoinMode }}: {{ i18n.ts._chat.openRoom }}</span>
				</div>
				<div>{{ i18n.ts._chat.notJoinedRoom }}</div>
				<div :class="$style.errorActions">
					<MkButton primary rounded :wait="joiningRoom" @click="joinRoom">{{ i18n.ts._chat.joinRoom }}</MkButton>
					<MkButton rounded @click="router.push('/chat')">{{ i18n.ts.goBack }}</MkButton>
				</div>
			</div>

			<div v-else-if="initializeError" class="_gaps" :class="$style.error">
				<i class="ti ti-alert-triangle" :class="$style.errorIcon"></i>
				<div>{{ initializeError }}</div>
				<div :class="$style.errorActions">
					<MkButton rounded @click="initialize">{{ i18n.ts.retry }}</MkButton>
					<MkButton rounded @click="router.push('/chat')">{{ i18n.ts.goBack }}</MkButton>
				</div>
			</div>

			<div v-else-if="messages.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.noMessagesYet }}</div>
					<template v-if="user">
						<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
						<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
						<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
						<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
					</template>
					<template v-else-if="room">
						<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
					</template>
				</div>
			</div>

				<div v-if="messages.length > 0" ref="timelineEl" :class="$style.timeline">
					<div v-if="canFetchMore || moreFetching" :class="$style.more">
						<MkLoading v-if="moreFetching" :mini="true"/>
					</div>
					<div :class="$style.messageList">
						<div
							v-for="item in visibleTimeline"
							:key="item._dynKey"
							v-memo="[item._dynKey, item.type === 'item' && item.id === contextTargetMessageId, item.type === 'item' ? item.data.reactions.length : 0, item.type === 'item' ? item.data.sendStatus : 0, item.type === 'item' ? item.data.replyUnavailable === true : false, item.type === 'item' ? item.data.quoteUnavailable === true : false, canManageRoomUsers, canDeleteAnyMessage, canManageRoomRoles, room?.ownerId]"
							:class="[$style.messageItem, { [$style.contextTarget]: item.type === 'item' && item.id === contextTargetMessageId }]"
							:data-scroll-anchor="item.type === 'item' ? item.id : undefined"
							:data-fresh="item.type === 'item' && isFreshlyArrivedItem(item.id) ? 'true' : undefined"
						>
							<XMessage v-if="item.type === 'item'" :message="item.data" :enableReferenceActions="true" :enableRoomUserMute="true" :canDeleteAnyMessage="canDeleteAnyMessage" :canManageRoomUsers="canManageRoomUsers" :canManageRoomRoles="canManageRoomRoles" :roomOwnerId="room?.ownerId" @reply="setReplyTarget(item.data)" @quote="setQuoteTarget(item.data)" @mention="mentionUser" @muteUser="muteUserInRoom" @openReference="openReferenceMessage" @deletedMany="onDeletedMany"/>
							<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
								<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
								<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
								<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
							</div>
						</div>
					</div>
					<div v-if="canFetchNewer || newerFetching" :class="$style.more">
						<MkLoading v-if="newerFetching" :mini="true"/>
					</div>
				</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
		</div><!-- chatPane: 仅消息区滚动 -->
	</div><!-- chatColumn: 置顶公告 + 消息区 -->

	<Transition name="fade">
		<button v-show="tab === 'chat' && (isContextMode || showScrollToLatestButton) && !showIndicator" class="_buttonPrimary" :class="$style.toLatestButton" :title="i18n.ts.bottom" @click="onIndicatorClick">
			<i class="ti ti-arrow-down"></i>
		</button>
	</Transition>

	<div v-if="tab === 'search'" :class="$style.searchPane">
		<XSearch :userId="userId" :roomId="roomId" :user="user" :room="room" @openContext="openMessageContext"/>
	</div>

	<div v-if="tab === 'members'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 100%;">
			<XMembers v-if="room != null" :room="room" :refreshKey="membersRefreshKey" @inviteUser="inviteUser"/>
		</div>
	</div>

	<div v-if="tab === 'mutedUsers'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 100%;">
			<XMutedUsers v-if="room != null" :room="room" :refreshKey="mutedUsersRefreshKey" @unmuted="onRoomUserUnmuted"/>
		</div>
	</div>

	<div v-if="tab === 'info'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 100%;">
			<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated" @leave="leaveRoom"/>
		</div>
	</div>

	<div v-if="tab === 'management'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 100%;">
			<XManagement v-if="room != null && canManageRoomUsers" :room="room" @updated="onRoomUpdated" @cleared="onCleared"/>
		</div>
	</div>

	<div v-if="tab === 'announcements'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 100%;">
			<XAnnouncements v-if="room != null" :room="room" :canManage="canManageRoomUsers" @updated="onRoomUpdated"/>
		</div>
	</div>

	<div v-if="tab === 'chat'" ref="footerEl" :class="$style.footer">
		<div class="_gaps">
			<Transition name="fade">
				<div v-show="showIndicator" :class="$style.new">
					<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
						<i class="ti ti-arrow-down" :class="$style.newIcon"></i>{{ i18n.ts._chat.newMessage }}<span v-if="newMessageCount > 0"> ({{ newMessageCount }})</span>
					</button>
				</div>
			</Transition>
			<XForm v-if="!initializing && !initializeError && !joinRequiredRoom" ref="formEl" :user="user" :room="room" :replyTarget="replyTarget" :quoteTarget="quoteTarget" :class="$style.form" @sending="onSendingMessage" @sent="onSentMessage" @sendFailed="onSendMessageFailed" @restoreReferences="onRestoreReferences" @clearReply="replyTarget = null" @clearQuote="quoteTarget = null"/>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated, nextTick, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@@/js/scroll.js';
import XMessage from './XMessage.vue';
import XRoomAvatar from './XRoomAvatar.vue';
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XMutedUsers from './room.user-mutes.vue';
import XInfo from './room.info.vue';
import XManagement from './room.management.vue';
import XAnnouncements from './room.announcements.vue';

import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/utility/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/MkButton.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/use/use-mutation-observer.js';
import MkInfo from '@/components/MkInfo.vue';
import MkAcct from '@/components/global/MkAcct.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/utility/timeline-date-separate.js';
import { appendDetachedChatMessages, ChatAutoScrollState, ChatReadReceiptBatcher, findMissingChatMessageIdsInLatestWindow, getChatScrollMetrics, mergeChatMessagesForTimeline, mergeChatMessagesWithWindowResult, prependChatMessageForTimeline } from './room-scroll.js';
import { hasChatUserResolvedAvatar, mergeChatUserForCache } from './room-user-cache.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
	messageId?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions' | 'reply' | 'quote'> & {
	fromUser: Misskey.entities.UserLite | null;
	reply: NormalizedChatMessage | null;
	quote: NormalizedChatMessage | null;
	replyUnavailable?: boolean;
	quoteUnavailable?: boolean;
	clientId?: string;
	sendStatus?: 'pending';
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite | null;
	})[];
};

type LatestGapMessage = Pick<Misskey.entities.ChatMessageLite, 'id' | 'fromUserId'>;
type MergeMessagesResult = {
	messages: NormalizedChatMessage[];
	droppedNewest: boolean;
	droppedOldest: boolean;
};

const initializing = ref(true);
const initializeError = ref<string | null>(null);
const joinRequiredRoom = ref<Misskey.entities.ChatRoom | null>(null);
const joiningRoom = ref(false);
const moreFetching = ref(false);
const newerFetching = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const canFetchNewer = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const replyTarget = ref<NormalizedChatMessage | null>(null);
const quoteTarget = ref<NormalizedChatMessage | null>(null);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const newMessageCount = ref(0);
const rootEl = ref<HTMLElement | null>(null);
const chatPaneEl = ref<HTMLElement | null>(null);
const localTabsEl = ref<HTMLElement | null>(null);
const timelineEl = ref<HTMLElement | null>(null);
const footerEl = ref<HTMLElement | null>(null);
const formEl = ref<InstanceType<typeof XForm> | null>(null);
// 新到消息出场动画用 data-fresh CSS;只对真新到的(非"自己刚发"被 adopt 的)播
const freshlyArrivedIds = new Set<string>();

function isFreshlyArrivedItem(id: string): boolean {
	return freshlyArrivedIds.has(id);
}

function markFreshlyArrived(ids: string[]) {
	for (const id of ids) {
		freshlyArrivedIds.add(id);
		window.setTimeout(() => freshlyArrivedIds.delete(id), 2200);
	}
}

const timeline = makeDateSeparatedTimelineComputedRef(messages);
// v-for `:key` 用的稳定标识:本地 pending 入列时 id=`~chat-pending-X`,服务端回包后 id 变成真实
// ULID 但 clientId 保留 → key 用 `c:${clientId}` 这样这一拍 DOM 不重挂(MkAvatar/MkMfm 不闪)。
const visibleTimeline = computed(() => timeline.value.toReversed().map(item => ({
	...item,
	_dynKey: item.type === 'item' && (item.data as NormalizedChatMessage).clientId != null
		? `c:${(item.data as NormalizedChatMessage).clientId}`
		: item.id,
})));
const contextTargetMessageId = ref<string | null>(null);
const pendingContextScrollId = ref<string | null>(null);
const usersById = ref(new Map<string, Misskey.entities.UserLite>());
const usersRefreshingById = new Set<string>();
const usersRefreshFailedById = new Set<string>();
const usersRefreshQueue = new Map<string, Misskey.entities.UserLite>();
const mutedRoomUserIds = ref<Set<string>>(new Set());
const mutedUsersRefreshKey = ref(0);
const membersRefreshKey = ref(0);
const showScrollToLatestButton = ref(false);
const showChatTabsScrollControls = ref(false);
const canScrollChatTabsLeft = ref(false);
const canScrollChatTabsRight = ref(false);
const announcementExpanded = ref(false);
const tab = ref('chat');
const headerTitle = computed(() => {
	const nickname = room.value?.myNickname?.trim();
	if (nickname != null && nickname !== '') return nickname;
	return room.value?.name ?? user.value?.name ?? user.value?.username ?? i18n.ts.chat;
});

const CHAT_ROOM_ANNOUNCEMENT_EXPANDED_KEY_PREFIX = 'chatRoomAnnouncementExpanded:';
// 4px 只用于"真的贴底"的自动跟随,避免用户往上拉时被拽回底部。
// 接近底部时展示/补齐最新消息用更宽的 160px:移动端图片/头像晚加载和手指轻微位移
// 很容易让 latestDistance 飘到 80px 以上,之前会错误显示"新消息"而不是直接补出来。
const SCROLL_LATEST_THRESHOLD = 160;
const SCROLL_AUTO_STICK_THRESHOLD = 4;
const SCROLL_HISTORY_THRESHOLD = 480;
const SCROLL_TAIL_THRESHOLD = 480;
const USER_SCROLL_INTERACTION_LOCK_MS = 1200;
// 锁定 8s,覆盖移动端 avatar/图片慢加载;期间 ResizeObserver 会持续把视图重锚到底部
const INITIAL_LATEST_EDGE_LOCK_MS = 8000;
const INITIAL_LATEST_EDGE_RESCROLL_DELAYS = [400, 1200, 2800, 5000, 7500] as const;
const TIMELINE_LIMIT = 20;
const TIMELINE_RECONCILE_LIMIT = 50;
const CONTEXT_LIMIT = 30;
const INITIAL_HISTORY_FILL_LIMIT = 6;
const MAX_ROOM_MESSAGES = 240;
const MAX_ROOM_MESSAGES_MOBILE = 240;
const MAX_DETACHED_INCOMING_MESSAGES = 160;

// 移动端 Safari 在快速上下滑动时，如果窗口比桌面小太多，分页裁剪会频繁切换 newest/oldest，
// 造成可见上下文被丢掉。移动端和桌面保持同一窗口大小，优先保证消息连续性。
function maxRoomMessagesForViewport(): number {
	return (typeof window !== 'undefined' && window.innerWidth <= 700) ? MAX_ROOM_MESSAGES_MOBILE : MAX_ROOM_MESSAGES;
}

const MAX_CONTEXT_MESSAGES = 120;
const STREAM_CONNECT_TIMEOUT = 5000;
const CHAT_RECONCILE_TIMEOUT_MS = 5000;
const CHAT_RECOVERY_FETCH_TIMEOUT_MS = 10000;
const STREAM_RECOVERY_DEBOUNCE_MS = 800;
// 之前 5 分钟才轮询一次,WS 漏一拍消息要等 5min 才能补回来,体感严重"没有立马加载出来"。
// 砍到 30s:常规情况下 WS 健康(60s 内有事件 → 跳过 syncLatestMessages),无消耗;真漏拍时
// 最多等半分钟就自动 sync 一次。
const STREAM_RECOVERY_POLL_INTERVAL_MS = 1000 * 30;
const STREAM_RECOVERY_ERROR_RETRY_MS = 5000;
const STREAM_LATEST_GAP_MAX_PAGES = 3;
const STREAM_RECOVERY_STALE_MS = 60000;
const STREAM_RECOVERY_HEALTHY_MS = 30000;
const CHAT_READ_RECEIPT_MIN_INTERVAL_MS = 2000;
const OUTGOING_MESSAGE_AUTO_STICK_MS = 3000;
const CHAT_USER_REFRESH_BATCH_SIZE = 20;
const CHAT_USER_REFRESH_DELAY_MS = 250;
const CHAT_TABS_SCROLL_MIN_DISTANCE = 160;
const CHAT_TABS_SCROLL_VISIBLE_RATIO = 0.7;
const autoScrollState = new ChatAutoScrollState({
	latestThreshold: SCROLL_AUTO_STICK_THRESHOLD,
	interactionLockMs: USER_SCROLL_INTERACTION_LOCK_MS,
});
const readReceiptBatcher = new ChatReadReceiptBatcher({
	minIntervalMs: CHAT_READ_RECEIPT_MIN_INTERVAL_MS,
	canSend: () => !window.document.hidden && isActivated,
	send: messageId => {
		connection.value?.send('read', {
			id: messageId,
		});
	},
});
let removeTimelineScrollListener: (() => void) | null = null;
let timelineResizeObserver: ResizeObserver | null = null;
let chatPaneResizeObserver: ResizeObserver | null = null;
let footerResizeObserver: ResizeObserver | null = null;
let pendingStickToLatestFrame: number | null = null;
// 进群后陆续撑高(avatar/图片晚到)的兜底定时器,卸载和切群时清掉
let lateInitialRescrollTimers: number[] = [];
let pendingIncomingMessageFrame: number | null = null;
let pendingIncomingMessages: Misskey.entities.ChatMessageLite[] = [];
let pendingIncomingShouldStickToLatest = false;
let detachedIncomingMessages: Misskey.entities.ChatMessageLite[] = [];
let pendingUserRefreshTimer: number | null = null;
let outgoingMessageAutoStickUntil = 0;
let streamRecoveryTimer: number | null = null;
let streamRecoveryPollingTimer: number | null = null;
let streamRecoverySinceId: string | undefined;
let isRoomViewDisposed = false;
let latestSyncPromise: Promise<void> | null = null;
let latestRevealPromise: Promise<void> | null = null;
let latestSyncGeneration = 0;
let latestStreamEventAt = Date.now();
let latestTimelineWindowPromise: Promise<Misskey.entities.ChatMessageLite[]> | null = null;
let latestTimelineWindowPromiseKey: string | null = null;
let latestGapPromise: Promise<LatestGapMessage[]> | null = null;
let latestGapPromiseKey: string | null = null;
let streamHadDisconnect = false;
let historyFetchArmed = true;
let newerFetchArmed = true;
let scrollRestorationDepth = 0;
let latestEdgeLockUntil = 0;
let latestEdgeLockGeneration = 0;
let suppressNextMessageIdClearInitialize = false;
let chatTabLatestReturnGeneration = 0;
const isRestoringHistoryScroll = ref(false);
const isRoomChat = computed(() => props.roomId != null);
const isContextMode = computed(() => contextTargetMessageId.value != null);
const canDeleteAnyMessage = computed(() => {
	if (room.value != null) return (room.value.canModerateRoom ?? room.value.canManage) === true;
	return $i.isAdmin || $i.isModerator;
});
const canManageRoomUsers = computed(() => (room.value?.canModerateRoom ?? room.value?.canManage) === true);
const canManageRoomRoles = computed(() => room.value?.canManageRoomRoles === true);

function getAnnouncementExpandedStorageKey(roomId: string) {
	return `${CHAT_ROOM_ANNOUNCEMENT_EXPANDED_KEY_PREFIX}${roomId}`;
}

function restoreAnnouncementExpanded(roomId: string) {
	announcementExpanded.value = window.localStorage.getItem(getAnnouncementExpandedStorageKey(roomId)) === '1';
}

// 聊天页「聊天」标签内容区顶部固定横幅（标签栏下、消息列表上）。
// 条件：服务端置顶 + 有正文。普通用户不可关闭；管理员在「管理」改置顶。
const showPinnedAnnouncement = computed(() => {
	const r = room.value;
	if (r == null) return false;
	if (r.announcementPinned !== true) return false;
	return (r.announcement ?? '').trim().length > 0;
});

function toggleAnnouncement() {
	if (room.value == null) return;
	announcementExpanded.value = !announcementExpanded.value;
	window.localStorage.setItem(getAnnouncementExpandedStorageKey(room.value.id), announcementExpanded.value ? '1' : '0');
}

watch(
	() => [room.value?.id, room.value?.announcement, room.value?.announcementPinned] as const,
	([roomId]) => {
		if (roomId == null) {
			announcementExpanded.value = false;
			return;
		}
		restoreAnnouncementExpanded(roomId);
	},
);

type ScrollAnchor = {
	id: string;
	offset: number;
};

type ScrollMetricsSnapshot = ReturnType<typeof getChatScrollMetrics>;

let latestScrollMetricsSnapshot: ScrollMetricsSnapshot | null = null;

function rememberLatestScrollMetrics(metrics: ScrollMetricsSnapshot) {
	latestScrollMetricsSnapshot = metrics;
}

function lockLatestEdgeDuringInitialRender(): number {
	latestEdgeLockGeneration++;
	latestEdgeLockUntil = Date.now() + INITIAL_LATEST_EDGE_LOCK_MS;
	autoScrollState.markLatest();
	return latestEdgeLockGeneration;
}

function clearLatestEdgeInitialLock() {
	latestEdgeLockUntil = 0;
	latestEdgeLockGeneration++;
}

function clearOutgoingMessageAutoStick() {
	outgoingMessageAutoStickUntil = 0;
}

function markOutgoingMessageAutoStick() {
	outgoingMessageAutoStickUntil = Date.now() + OUTGOING_MESSAGE_AUTO_STICK_MS;
	autoScrollState.markLatest();
	clearNewMessageIndicator();
	showScrollToLatestButton.value = false;
}

function shouldForceStickIncomingBatchToLatest(batch: Misskey.entities.ChatMessageLite[]) {
	// 用户已经手动滚离底部时,不要被"3秒内刚发过"或"batch里夹了自己消息"强行抢回底
	if (autoScrollState.isUserInteracting()) return false;
	if (latestScrollMetricsSnapshot != null && latestScrollMetricsSnapshot.latestDistance > SCROLL_AUTO_STICK_THRESHOLD) return false;
	return Date.now() <= outgoingMessageAutoStickUntil || batch.some(message => message.fromUserId === $i.id);
}

function clearLateInitialRescrollTimers() {
	for (const id of lateInitialRescrollTimers) window.clearTimeout(id);
	lateInitialRescrollTimers = [];
}

// 进群 / 切群之后 avatar、图片可能在帧循环结束后才加载完撑高内容,
// 这里按递增时间点重新锚到底部;只在初始锁定窗口内有效,用户一旦手动滑过就不会再触发。
function scheduleLateInitialRescrolls(generation: number) {
	clearLateInitialRescrollTimers();
	if (isContextMode.value) return;
	for (const delay of INITIAL_LATEST_EDGE_RESCROLL_DELAYS) {
		const id = window.setTimeout(() => {
			lateInitialRescrollTimers = lateInitialRescrollTimers.filter(v => v !== id);
			if (isContextMode.value) return;
			if (!isLatestEdgeInitialLockActive(generation)) return;
			if (!canUseChatScrollMetrics()) return;
			if (autoScrollState.isUserInteracting()) return;
			const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
			if (scrollContainer == null) return;
			const metrics = getChatScrollMetrics(scrollContainer);
			if (!shouldStickToLatestAfterLayoutShift(metrics)) {
				rememberLatestScrollMetrics(metrics);
				return;
			}
			if (metrics.latestDistance <= 0) {
				rememberLatestScrollMetrics(metrics);
				return;
			}
			scrollContainer.scrollTo({ top: metrics.maxScrollTop, behavior: 'instant' });
			rememberLatestScrollMetrics({ ...metrics, scrollTop: metrics.maxScrollTop, latestDistance: 0 });
		}, delay);
		lateInitialRescrollTimers.push(id);
	}
}

function isLatestEdgeInitialLockActive(generation = latestEdgeLockGeneration) {
	return generation === latestEdgeLockGeneration && Date.now() <= latestEdgeLockUntil && !autoScrollState.isUserInteracting();
}

function isAtLatestEdgeDistance(latestDistance: number): boolean {
	return latestDistance <= SCROLL_AUTO_STICK_THRESHOLD;
}

function isNearLatestRevealDistance(latestDistance: number): boolean {
	return latestDistance <= SCROLL_LATEST_THRESHOLD;
}

function shouldInitialLatestEdgeLockStick(metrics: ScrollMetricsSnapshot): boolean {
	if (!isLatestEdgeInitialLockActive()) return false;
	if (isAtLatestEdgeDistance(metrics.latestDistance)) return true;
	if (latestScrollMetricsSnapshot == null) return false;
	if (latestScrollMetricsSnapshot.latestDistance > SCROLL_AUTO_STICK_THRESHOLD) return false;
	if (metrics.maxScrollTop <= latestScrollMetricsSnapshot.maxScrollTop) return false;

	return Math.abs(metrics.scrollTop - latestScrollMetricsSnapshot.maxScrollTop) <= SCROLL_AUTO_STICK_THRESHOLD;
}

function shouldStickToLatestAfterLayoutShift(metrics: ScrollMetricsSnapshot): boolean {
	if (isLatestEdgeInitialLockActive()) return shouldInitialLatestEdgeLockStick(metrics);
	if (autoScrollState.shouldStickToLatest(metrics.latestDistance, SCROLL_AUTO_STICK_THRESHOLD)) return true;
	if (autoScrollState.isUserInteracting()) return false;
	if (latestScrollMetricsSnapshot == null) return false;
	if (latestScrollMetricsSnapshot.latestDistance > SCROLL_AUTO_STICK_THRESHOLD) return false;
	if (metrics.maxScrollTop <= latestScrollMetricsSnapshot.maxScrollTop) return false;

	return Math.abs(metrics.scrollTop - latestScrollMetricsSnapshot.maxScrollTop) <= SCROLL_AUTO_STICK_THRESHOLD;
}

function canUseChatScrollMetrics() {
	return tab.value === 'chat' && chatPaneEl.value != null && chatPaneEl.value.clientHeight > 0;
}

function canSyncLatestMessages() {
	return tab.value === 'chat' && !window.document.hidden && isActivated && !initializing.value && initializeError.value == null && joinRequiredRoom.value == null && !isContextMode.value && (props.userId != null ? user.value != null : room.value != null);
}

function isChatStreamHealthy() {
	return Date.now() - latestStreamEventAt < STREAM_RECOVERY_HEALTHY_MS;
}

function isAbortError(err: unknown): boolean {
	// Browser AbortError is expected when chat recovery requests are superseded.
	return err instanceof DOMException && err.name === 'AbortError' ||
		err instanceof Error && err.name === 'AbortError';
}

function beginScrollRestoration() {
	scrollRestorationDepth++;
	isRestoringHistoryScroll.value = true;
}

function endScrollRestoration() {
	scrollRestorationDepth = Math.max(0, scrollRestorationDepth - 1);
	isRestoringHistoryScroll.value = scrollRestorationDepth > 0;
}

function isAtLatest() {
	if (!canUseChatScrollMetrics()) return false;
	if (timelineEl.value == null) return true;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return true;

	const { latestDistance } = getChatScrollMetrics(scrollContainer);
	if (autoScrollState.isUserInteracting()) {
		autoScrollState.updateFromScroll(latestDistance);
		return false;
	}

	if (isAtLatestEdgeDistance(latestDistance)) {
		autoScrollState.updateFromScroll(latestDistance);
		return true;
	}

	autoScrollState.updateFromScroll(latestDistance);
	return autoScrollState.canAutoFollowLatest(latestDistance);
}

function shouldAutoRevealLatestMessages() {
	if (!canUseChatScrollMetrics()) return false;
	if (timelineEl.value == null) return true;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return true;

	const previousMetrics = latestScrollMetricsSnapshot;
	const metrics = getChatScrollMetrics(scrollContainer);
	rememberLatestScrollMetrics(metrics);

	if (autoScrollState.isUserInteracting()) {
		autoScrollState.updateFromScroll(metrics.latestDistance);
		return false;
	}

	if (isAtLatestEdgeDistance(metrics.latestDistance)) {
		autoScrollState.markLatest();
		return true;
	}

	if (isNearLatestRevealDistance(metrics.latestDistance)) {
		autoScrollState.markLatest();
		return true;
	}

	if (
		previousMetrics != null &&
		previousMetrics.latestDistance <= SCROLL_AUTO_STICK_THRESHOLD &&
		isNearLatestRevealDistance(metrics.latestDistance)
	) {
		autoScrollState.markLatest();
		return true;
	}

	autoScrollState.updateFromScroll(metrics.latestDistance);
	return autoScrollState.canAutoFollowLatest(metrics.latestDistance);
}

function clearNewMessageIndicator() {
	if (!showIndicator.value && newMessageCount.value === 0) return;

	showIndicator.value = false;
	newMessageCount.value = 0;
}

function decrementNewMessageIndicator(count: number) {
	if (count <= 0 || newMessageCount.value === 0) return;

	newMessageCount.value = Math.max(0, newMessageCount.value - count);
	if (newMessageCount.value === 0) {
		showIndicator.value = false;
	}
}

function clearReferenceTargetsByIds(idSet: Set<string>) {
	if (replyTarget.value != null && idSet.has(replyTarget.value.id)) {
		replyTarget.value = null;
	}
	if (quoteTarget.value != null && idSet.has(quoteTarget.value.id)) {
		quoteTarget.value = null;
	}
	if (contextTargetMessageId.value != null && idSet.has(contextTargetMessageId.value)) {
		contextTargetMessageId.value = null;
	}
	if (pendingContextScrollId.value != null && idSet.has(pendingContextScrollId.value)) {
		pendingContextScrollId.value = null;
	}
}

function removeLocalChatMessagesByIds(ids: Iterable<string>) {
	const idSet = new Set(ids);
	if (idSet.size === 0) return;

	messages.value = messages.value.filter(message => !idSet.has(message.id));
	pendingIncomingMessages = pendingIncomingMessages.filter(message => !idSet.has(message.id));
	if (pendingIncomingMessages.length === 0) {
		pendingIncomingShouldStickToLatest = false;
	}

	const removedDetachedMessages: Misskey.entities.ChatMessageLite[] = [];
	detachedIncomingMessages = detachedIncomingMessages.filter(message => {
		if (!idSet.has(message.id)) return true;
		removedDetachedMessages.push(message);
		return false;
	});

	decrementNewMessageIndicator(removedDetachedMessages.filter(message => message.fromUserId !== $i.id).length);
	clearReferenceTargetsByIds(idSet);
}

function scrollToLatest(behavior: ScrollBehavior = 'smooth', options?: { flushReadReceipt?: boolean }) {
	const hadDetachedIncomingMessages = flushDetachedIncomingMessages({ queueReadReceipt: true });
	autoScrollState.markLatest();
	const applyScroll = () => {
		const latestScrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
		const scrollTop = latestScrollContainer == null ? 0 : getChatScrollMetrics(latestScrollContainer).maxScrollTop;
		latestScrollContainer?.scrollTo({
			top: scrollTop,
			behavior,
		});
		if (latestScrollContainer != null) {
			rememberLatestScrollMetrics({
				...getChatScrollMetrics(latestScrollContainer),
				scrollTop,
				latestDistance: 0,
			});
		}
		clearNewMessageIndicator();
		showScrollToLatestButton.value = false;
		if (options?.flushReadReceipt === true) {
			readReceiptBatcher.flush();
		}
	};

	applyScroll();
	if (hadDetachedIncomingMessages) {
		void nextTick(async () => {
			await waitAnimationFrame();
			applyScroll();
		});
	}
	newerFetchArmed = false;
	historyFetchArmed = true;
}

async function revealLatestMessagesAfterLayout(options?: { behavior?: ScrollBehavior; flushReadReceipt?: boolean }) {
	// DynamicScroller / avatar / 媒体在多个帧后才撑高内容,单帧 scroll 拿到的 maxScrollTop
	// 经常是过时的(自己发完消息后体感"没贴底")。跨多帧持续 scroll,直到 maxScrollTop 稳定。
	let previousMaxScrollTop = Number.NEGATIVE_INFINITY;
	let stableFrames = 0;
	for (let i = 0; i < 6; i++) {
		await nextTick();
		await waitAnimationFrame();
		const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
		if (scrollContainer == null) break;
		const { maxScrollTop } = getChatScrollMetrics(scrollContainer);
		const isFirstIteration = i === 0;
		scrollToLatest(options?.behavior ?? 'instant', isFirstIteration ? { flushReadReceipt: options?.flushReadReceipt } : undefined);
		if (maxScrollTop === previousMaxScrollTop) {
			stableFrames++;
			if (stableFrames >= 2) break;
		} else {
			stableFrames = 0;
			previousMaxScrollTop = maxScrollTop;
		}
	}
}

function setupTimelineScrollListener() {
	removeTimelineScrollListener?.();
	removeTimelineScrollListener = null;

	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return;

	const markUserScrollInteraction = () => {
		clearLatestEdgeInitialLock();
		clearOutgoingMessageAutoStick();
		autoScrollState.markUserInteraction();
	};

	// pointermove / pointerdown / touchstart 在桌面悬停或手机点击表情时都会触发,
	// 会把进群8s兜底锁打掉导致进群没滚到底。只信"真的发生滚动"的信号:
	// - wheel(桌面输入)
	// - 滚动事件里检测到 scrollTop 向上移动,且 scrollHeight 未变(手机滑动 / 拖滚动条)
	let lastUserDirectedScrollTop = scrollContainer.scrollTop;
	let lastUserDirectedScrollHeight = scrollContainer.scrollHeight;
	const USER_SCROLL_UP_DELTA_THRESHOLD = 16;

	const onScroll = () => {
		const metrics = getChatScrollMetrics(scrollContainer);
		const currentScrollHeight = scrollContainer.scrollHeight;
		// scrollHeight 未变化 → scrollTop 的下移就是用户主动操作;
		// scrollHeight 变小(消息被 trim / 折叠) → 浏览器会把 scrollTop clamp 到新 max,
		// 这种"下移"不是用户行为,不应该打掉初始锁/触发 detached。
		const scrollHeightUnchanged = currentScrollHeight === lastUserDirectedScrollHeight;
		if (
			scrollHeightUnchanged &&
			!isRestoringHistoryScroll.value &&
			!isLatestEdgeInitialLockActive() &&
			metrics.scrollTop + USER_SCROLL_UP_DELTA_THRESHOLD < lastUserDirectedScrollTop
		) {
			markUserScrollInteraction();
		}
		lastUserDirectedScrollTop = metrics.scrollTop;
		lastUserDirectedScrollHeight = currentScrollHeight;
		rememberLatestScrollMetrics(metrics);
		const { latestDistance, historyDistance } = metrics;
		autoScrollState.updateFromScroll(latestDistance);
		const shouldRevealNearLatest = !autoScrollState.isUserInteracting() && isNearLatestRevealDistance(latestDistance);
		showScrollToLatestButton.value = latestDistance > SCROLL_TAIL_THRESHOLD;
		if (historyDistance >= SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = true;
		}

		if (!isRestoringHistoryScroll.value && canFetchMore.value && !moreFetching.value && !newerFetching.value && messages.value.length > 0 && historyFetchArmed && historyDistance < SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = false;
			fetchMore();
		}

		if (isAtLatestEdgeDistance(latestDistance) || shouldRevealNearLatest) {
			if (!isContextMode.value && (detachedIncomingMessages.length > 0 || canFetchNewer.value)) {
				void showLatestMessages('instant');
				return;
			}
			if (!isContextMode.value) {
				clearNewMessageIndicator();
			}
		}

		if (latestDistance >= SCROLL_TAIL_THRESHOLD) {
			newerFetchArmed = true;
		}

		if (!isRestoringHistoryScroll.value && canFetchNewer.value && !newerFetching.value && !moreFetching.value && messages.value.length > 0 && newerFetchArmed && latestDistance < SCROLL_TAIL_THRESHOLD) {
			if (!isContextMode.value) {
				if (isAtLatestEdgeDistance(latestDistance) || shouldRevealNearLatest) {
					newerFetchArmed = false;
					void showLatestMessages('instant');
				} else {
					showScrollToLatestButton.value = true;
				}
			} else {
				newerFetchArmed = false;
				fetchNewer();
			}
		}
	};

	scrollContainer.addEventListener('scroll', onScroll, { passive: true });
	scrollContainer.addEventListener('wheel', markUserScrollInteraction, { passive: true });
	removeTimelineScrollListener = () => {
		scrollContainer.removeEventListener('scroll', onScroll);
		scrollContainer.removeEventListener('wheel', markUserScrollInteraction);
	};

	onScroll();
}

function getVisibleMessageAnchor(): ScrollAnchor | null {
	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	if (scrollContainer == null || timelineEl.value == null) return null;

	const containerRect = scrollContainer.getBoundingClientRect();
	const elements = timelineEl.value.querySelectorAll<HTMLElement>('[data-scroll-anchor]');
	let best: ScrollAnchor | null = null;
	let bestDistance = Number.POSITIVE_INFINITY;

	for (const element of elements) {
		const rect = element.getBoundingClientRect();
		if (rect.bottom > containerRect.top && rect.top < containerRect.bottom) {
			const id = element.dataset.scrollAnchor;
			if (id == null) continue;

			const offset = rect.top - containerRect.top;
			const distance = Math.abs(offset);
			if (distance < bestDistance) {
				bestDistance = distance;
				best = {
					id,
					offset,
				};
			}
		}
	}

	return best;
}

function restoreVisibleMessageAnchor(anchor: ScrollAnchor | null): number | null {
	if (anchor == null || timelineEl.value == null) return null;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return null;

	const element = timelineEl.value.querySelector<HTMLElement>(`[data-scroll-anchor="${CSS.escape(anchor.id)}"]`);
	if (element == null) return null;

	const containerRect = scrollContainer.getBoundingClientRect();
	const rect = element.getBoundingClientRect();
	const getDelta = () => {
		const latestContainerRect = scrollContainer.getBoundingClientRect();
		const latestRect = element.getBoundingClientRect();
		return latestRect.top - latestContainerRect.top - anchor.offset;
	};
	const originalScrollTop = scrollContainer.scrollTop;
	const delta = getDelta();
	if (Math.abs(delta) <= 0.5) {
		return delta;
	}

	const candidates = [originalScrollTop + delta, originalScrollTop - delta];
	let bestScrollTop = originalScrollTop;
	let bestDelta = Math.abs(delta);

	for (const candidate of candidates) {
		scrollContainer.scrollTop = candidate;
		const currentDelta = Math.abs(getDelta());
		if (currentDelta < bestDelta) {
			bestDelta = currentDelta;
			bestScrollTop = scrollContainer.scrollTop;
		}
	}

	scrollContainer.scrollTop = bestScrollTop;
	return getDelta();
}

function scrollMessageIntoView(messageId: string, block: ScrollLogicalPosition = 'nearest'): boolean {
	if (timelineEl.value == null) return false;

	const element = timelineEl.value.querySelector<HTMLElement>(`[data-scroll-anchor="${CSS.escape(messageId)}"]`);
	if (element == null) return false;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) {
		element.scrollIntoView({
			block,
			behavior: 'auto',
		});
		return true;
	}

	const getDelta = () => {
		const containerRect = scrollContainer.getBoundingClientRect();
		const elementRect = element.getBoundingClientRect();
		const targetOffset = block === 'center'
			? (scrollContainer.clientHeight - elementRect.height) / 2
			: block === 'end'
				? scrollContainer.clientHeight - elementRect.height
				: 0;
		return elementRect.top - containerRect.top - targetOffset;
	};
	const originalScrollTop = scrollContainer.scrollTop;
	const delta = getDelta();
	const candidates = [originalScrollTop + delta, originalScrollTop - delta];
	let bestScrollTop = originalScrollTop;
	let bestDelta = Math.abs(delta);

	for (const candidate of candidates) {
		scrollContainer.scrollTop = candidate;
		const currentDelta = Math.abs(getDelta());
		if (currentDelta < bestDelta) {
			bestDelta = currentDelta;
			bestScrollTop = scrollContainer.scrollTop;
		}
	}

	scrollContainer.scrollTop = bestScrollTop;
	if (bestDelta > 1) {
		element.scrollIntoView({
			block,
			behavior: 'auto',
		});
	}
	return true;
}

function waitAnimationFrame() {
	return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
}

async function restoreVisibleMessageAnchorAfterLayout(anchor: ScrollAnchor | null) {
	if (anchor == null) return;

	let stableFrames = 0;
	for (let i = 0; i < 14; i++) {
		await nextTick();
		await waitAnimationFrame();
		const delta = restoreVisibleMessageAnchor(anchor);
		if (delta == null) return;
		if (Math.abs(delta) <= 0.5) {
			stableFrames++;
			if (stableFrames >= 2) return;
		} else {
			stableFrames = 0;
		}
	}
}

// DOM changes near the latest message can shift scroll height. Only pin when
// the user is already on the exact latest edge; otherwise preserve manual scroll.
function scheduleStickToLatestAfterMutation() {
	if (!canUseChatScrollMetrics() || isRestoringHistoryScroll.value || isContextMode.value) return;
	if (pendingStickToLatestFrame != null) return;

	pendingStickToLatestFrame = window.requestAnimationFrame(() => {
		pendingStickToLatestFrame = null;
		if (!canUseChatScrollMetrics() || isRestoringHistoryScroll.value || isContextMode.value) return;

		const scrollContainer = getScrollContainer(timelineEl.value);
		if (scrollContainer == null) return;

		const metrics = getChatScrollMetrics(scrollContainer);
		if (shouldStickToLatestAfterLayoutShift(metrics)) {
			scrollContainer.scrollTo({
				top: metrics.maxScrollTop,
				behavior: 'instant',
			});
			rememberLatestScrollMetrics({
				...metrics,
				scrollTop: metrics.maxScrollTop,
				latestDistance: 0,
			});
		} else {
			rememberLatestScrollMetrics(metrics);
		}
	});
}

useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	scheduleStickToLatestAfterMutation();
});

watch(timelineEl, (to) => {
	timelineResizeObserver?.disconnect();
	timelineResizeObserver = null;
	if (to == null) return;

	timelineResizeObserver = new ResizeObserver(() => {
		scheduleStickToLatestAfterMutation();
	});
	timelineResizeObserver.observe(to);
}, { immediate: true });

watch(chatPaneEl, (to) => {
	chatPaneResizeObserver?.disconnect();
	chatPaneResizeObserver = null;
	if (to == null) return;

	chatPaneResizeObserver = new ResizeObserver(() => {
		scheduleStickToLatestAfterMutation();
	});
	chatPaneResizeObserver.observe(to);
}, { immediate: true });

watch(footerEl, (to) => {
	footerResizeObserver?.disconnect();
	footerResizeObserver = null;
	if (to == null) return;

	footerResizeObserver = new ResizeObserver(() => {
		scheduleStickToLatestAfterMutation();
	});
	footerResizeObserver.observe(to);
}, { immediate: true });

function refreshMessagesForUser(userId: string) {
	let changed = false;
	const refreshMessage = (message: NormalizedChatMessage): NormalizedChatMessage => {
		let next = message;
		const cached = usersById.value.get(message.fromUserId);
		if (message.fromUserId === userId && cached != null && message.fromUser !== cached) {
			next = {
				...next,
				fromUser: cached,
			};
			changed = true;
		}

		if (next.reply?.fromUserId === userId) {
			const reply = refreshMessage(next.reply);
			if (reply !== next.reply) {
				next = {
					...next,
					reply,
				};
			}
		}

		if (next.quote?.fromUserId === userId) {
			const quote = refreshMessage(next.quote);
			if (quote !== next.quote) {
				next = {
					...next,
					quote,
				};
			}
		}

		const reactions = next.reactions.map(record => {
			if (record.user == null) return record;
			if (record.user.id !== userId) return record;
			const reactionUser = usersById.value.get(record.user.id);
			if (reactionUser == null || reactionUser === record.user) return record;
			changed = true;
			return {
				...record,
				user: reactionUser,
			};
		});
		if (reactions.some((record, index) => record !== next.reactions[index])) {
			next = {
				...next,
				reactions,
			};
		}

		return next;
	};

	const refreshed = messages.value.map(message => refreshMessage(message));
	if (changed) {
		messages.value = refreshed;
	}
}

function applyResolvedUser(user: Misskey.entities.UserLite) {
	const existing = usersById.value.get(user.id);
	const merged = existing == null ? user : mergeChatUserForCache(existing, user);
	usersById.value.set(user.id, merged);

	if (existing !== merged) {
		refreshMessagesForUser(user.id);
	}
}

function flushUserRefreshQueue() {
	pendingUserRefreshTimer = null;
	const requestedUsers = Array.from(usersRefreshQueue.values()).slice(0, CHAT_USER_REFRESH_BATCH_SIZE);
	if (requestedUsers.length === 0) return;

	for (const user of requestedUsers) {
		usersRefreshQueue.delete(user.id);
		usersRefreshingById.add(user.id);
	}

	const localUserIds = requestedUsers.filter(user => user.host == null).map(user => user.id);
	const remoteUsers = requestedUsers.filter(user => user.host != null);

	Promise.all([
		localUserIds.length > 0
			? misskeyApi('users/show', {
				userIds: localUserIds,
				detail: false,
			}).catch(err => {
				console.warn('Failed to refresh local chat message users:', err);
				return [] as Misskey.entities.UserLite[];
			})
			: Promise.resolve([] as Misskey.entities.UserLite[]),
		Promise.all(remoteUsers.map(user => misskeyApi('users/show', {
			username: user.username,
			host: user.host,
			detail: false,
		}).catch(err => {
			console.warn('Failed to refresh remote chat message user:', err);
			return null;
		}))),
	]).then(([localUsers, resolvedRemoteUsers]) => {
		const refreshedUsers = [
			...(localUsers as Misskey.entities.UserLite[]),
			...resolvedRemoteUsers.filter(user => user != null),
		] as Misskey.entities.UserLite[];
		const refreshedUserIds = new Set(refreshedUsers.map(user => user.id));

		for (const user of refreshedUsers) {
			applyResolvedUser(user);
			if (hasChatUserResolvedAvatar(user)) {
				usersRefreshFailedById.delete(user.id);
			} else {
				usersRefreshFailedById.add(user.id);
			}
		}

		for (const user of requestedUsers) {
			if (!refreshedUserIds.has(user.id)) {
				usersRefreshFailedById.add(user.id);
			}
		}
	}).finally(() => {
		for (const user of requestedUsers) {
			usersRefreshingById.delete(user.id);
		}
		if (usersRefreshQueue.size > 0 && pendingUserRefreshTimer == null) {
			pendingUserRefreshTimer = window.setTimeout(flushUserRefreshQueue, CHAT_USER_REFRESH_DELAY_MS);
		}
	});
}

function queueUserRefresh(user: Misskey.entities.UserLite) {
	if (user.id === $i.id) return;
	if (hasChatUserResolvedAvatar(user)) return;
	if (usersRefreshingById.has(user.id) || usersRefreshFailedById.has(user.id)) return;
	usersRefreshQueue.set(user.id, user);
	if (pendingUserRefreshTimer == null) {
		pendingUserRefreshTimer = window.setTimeout(flushUserRefreshQueue, CHAT_USER_REFRESH_DELAY_MS);
	}
}

function rememberUser(user: Misskey.entities.UserLite | null | undefined) {
	if (user == null) return;
	const existing = usersById.value.get(user.id);
	const merged = existing == null ? user : mergeChatUserForCache(existing, user);
	usersById.value.set(user.id, merged);
	queueUserRefresh(merged);
}

function rememberMessageUsers(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage) {
	rememberUser(message.fromUser);
	rememberUser(message.reply?.fromUser);
	rememberUser(message.quote?.fromUser);
	for (const record of message.reactions) {
		rememberUser(record.user);
	}
}

function resolveUser(userId: string, packedUser?: Misskey.entities.UserLite | null): Misskey.entities.UserLite | null {
	if (packedUser != null) {
		rememberUser(packedUser);
		return usersById.value.get(packedUser.id) ?? packedUser;
	}

	if (userId === $i.id) return $i;
	if (user.value?.id === userId) return user.value;
	return usersById.value.get(userId) ?? null;
}

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	rememberMessageUsers(message);

	return {
		...message,
		fromUser: resolveUser(message.fromUserId, message.fromUser),
		reply: message.replyId ? (message.reply ? normalizeMessage(message.reply) : null) : null,
		quote: message.quoteId ? (message.quote ? normalizeMessage(message.quote) : null) : null,
		replyUnavailable: message.replyId != null && message.reply == null,
		quoteUnavailable: message.quoteId != null && message.quote == null,
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ? resolveUser(record.user.id, record.user) : null,
		})),
	};
}

function isRoomUserMuted(userId: string): boolean {
	return room.value != null && userId !== $i.id && mutedRoomUserIds.value.has(userId);
}

function filterMutedRoomMessages<T extends Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage>(items: T[]): T[] {
	if (room.value == null || mutedRoomUserIds.value.size === 0) return items;
	return items.filter(item => !isRoomUserMuted(item.fromUserId));
}

function filterMutedNormalizedMessages(items: NormalizedChatMessage[]): NormalizedChatMessage[] {
	if (room.value == null || mutedRoomUserIds.value.size === 0) return items;
	return items.filter(item => !isRoomUserMuted(item.fromUserId));
}

function isPendingMessage(message: NormalizedChatMessage): boolean {
	return message.sendStatus === 'pending';
}

function findNewestPersistedMessageId(): string | undefined {
	return messages.value.find(message => !isPendingMessage(message))?.id;
}

function findOldestPersistedMessageId(): string | undefined {
	for (let i = messages.value.length - 1; i >= 0; i--) {
		const message = messages.value[i];
		if (!isPendingMessage(message)) return message.id;
	}

	return undefined;
}

function messageLimit(): number | undefined {
	if (isContextMode.value) return MAX_CONTEXT_MESSAGES;
	return isRoomChat.value ? maxRoomMessagesForViewport() : undefined;
}

function detachedIncomingMessageLimit(): number | undefined {
	if (!isRoomChat.value) return undefined;
	return Math.max(MAX_DETACHED_INCOMING_MESSAGES, maxRoomMessagesForViewport() * 2);
}

function trimDetachedIncomingMessages(items: Misskey.entities.ChatMessageLite[]): Misskey.entities.ChatMessageLite[] {
	const limit = detachedIncomingMessageLimit();
	if (limit == null || items.length <= limit) return items;
	return mergeChatMessagesForTimeline([], items, { limit, keep: 'newest' });
}

function mergeMessagesWithResult(first: NormalizedChatMessage[] | { keep?: 'newest' | 'oldest' }, ...rest: NormalizedChatMessage[][]): MergeMessagesResult {
	const options = Array.isArray(first) ? { keep: 'newest' as const } : { keep: first.keep ?? 'newest' };
	const sources = Array.isArray(first) ? [first, ...rest] : rest;
	const emptyResult: MergeMessagesResult = {
		messages: [],
		droppedNewest: false,
		droppedOldest: false,
	};
	if (sources.length === 0) return emptyResult;

	const result = sources.length === 1
		? mergeChatMessagesWithWindowResult([], sources[0], { limit: messageLimit(), keep: options.keep })
		: mergeChatMessagesWithWindowResult(sources[0], sources[1], { limit: messageLimit(), keep: options.keep, preserveExistingOrder: isRoomChat.value });

	return {
		messages: result.items,
		droppedNewest: result.droppedNewest,
		droppedOldest: result.droppedOldest,
	};
}

function mergeMessages(first: NormalizedChatMessage[] | { keep?: 'newest' | 'oldest' }, ...rest: NormalizedChatMessage[][]): NormalizedChatMessage[] {
	return mergeMessagesWithResult(first, ...rest).messages;
}

function applyWindowTrimFlags(result: MergeMessagesResult) {
	if (result.droppedNewest) {
		canFetchNewer.value = true;
		newerFetchArmed = true;
		showScrollToLatestButton.value = true;
	}
	if (result.droppedOldest) {
		canFetchMore.value = true;
		historyFetchArmed = true;
	}
}

function prependMessage(message: NormalizedChatMessage) {
	messages.value = prependChatMessageForTimeline(messages.value, message, { limit: messageLimit() });
}

function appendFetchedMessages(fetched: Misskey.entities.ChatMessageLite[]): NormalizedChatMessage[] {
	return appendFetchedMessagesWithWindow(fetched, 'newest');
}

function appendFetchedMessagesWithWindow(fetched: Misskey.entities.ChatMessageLite[], keep: 'newest' | 'oldest'): NormalizedChatMessage[] {
	const visible = filterMutedRoomMessages(fetched);
	if (visible.length === 0) return [];

	const existingIds = new Set(messages.value.map(message => message.id));
	const normalized = visible.map(x => normalizeMessage(x));
	const newlyVisible = normalized.filter(message => !existingIds.has(message.id));
	const current = removeMatchingPendingMessagesFrom(messages.value, normalized);
	const result = mergeMessagesWithResult({ keep }, current, normalized);
	messages.value = result.messages;
	applyWindowTrimFlags(result);
	return newlyVisible;
}

function bufferFetchedLatestMessages(fetched: Misskey.entities.ChatMessageLite[]): LatestGapMessage[] {
	const visible = filterMutedRoomMessages(fetched);
	if (visible.length === 0) return [];

	const existingIds = new Set([
		...messages.value.map(message => message.id),
		...detachedIncomingMessages.map(message => message.id),
	]);
	const newlyVisible = visible.filter(message => !existingIds.has(message.id));
	detachedIncomingMessages = trimDetachedIncomingMessages(appendDetachedChatMessages(detachedIncomingMessages, visible, messages.value));
	return newlyVisible.map(message => ({
		id: message.id,
		fromUserId: message.fromUserId,
	}));
}

async function fetchLatestTimelineWindow(signal?: AbortSignal): Promise<Misskey.entities.ChatMessageLite[]> {
	const requestKey = props.userId != null ? `user:${props.userId}` : `room:${room.value?.id ?? ''}`;
	if (latestTimelineWindowPromise != null && latestTimelineWindowPromiseKey === requestKey) {
		return await latestTimelineWindowPromise;
	}

	const run = async () => {
		if (props.userId) {
			return await misskeyApi('chat/messages/user-timeline', {
				userId: user.value!.id,
				limit: TIMELINE_RECONCILE_LIMIT,
			}, undefined, signal);
		}

		if (room.value == null) return [];

		return await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value.id,
			limit: TIMELINE_RECONCILE_LIMIT,
		}, undefined, signal);
	};

	latestTimelineWindowPromiseKey = requestKey;
	latestTimelineWindowPromise = run();
	try {
		return await latestTimelineWindowPromise;
	} finally {
		if (latestTimelineWindowPromiseKey === requestKey && latestTimelineWindowPromise != null) {
			latestTimelineWindowPromise = null;
			latestTimelineWindowPromiseKey = null;
		}
	}
}

function reconcileLocalMessagesWithLatestWindow(latestWindow: Misskey.entities.ChatMessageLite[]) {
	const missingIds = new Set<string>([
		...findMissingChatMessageIdsInLatestWindow(messages.value, latestWindow, {
			limit: TIMELINE_RECONCILE_LIMIT,
			isPending: isPendingMessage,
		}),
		...findMissingChatMessageIdsInLatestWindow(pendingIncomingMessages, latestWindow, {
			limit: TIMELINE_RECONCILE_LIMIT,
		}),
		...findMissingChatMessageIdsInLatestWindow(detachedIncomingMessages, latestWindow, {
			limit: TIMELINE_RECONCILE_LIMIT,
		}),
	]);

	removeLocalChatMessagesByIds(missingIds);
}

async function reconcileLatestTimelineWindow(): Promise<Misskey.entities.ChatMessageLite[]> {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), CHAT_RECONCILE_TIMEOUT_MS);

	try {
		const latestWindow = await fetchLatestTimelineWindow(controller.signal);
		if (controller.signal.aborted) return latestWindow;
		reconcileLocalMessagesWithLatestWindow(latestWindow);
		return latestWindow;
	} finally {
		window.clearTimeout(timeoutId);
	}
}

function replaceMessages(fetched: (Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage)[]) {
	messages.value = mergeMessages(filterMutedRoomMessages(fetched).map(x => normalizeMessage(x)));
}

function isSameOutgoingMessage(a: NormalizedChatMessage, b: NormalizedChatMessage): boolean {
	return a.fromUserId === b.fromUserId &&
		(a.toUserId ?? null) === (b.toUserId ?? null) &&
		(a.toRoomId ?? null) === (b.toRoomId ?? null) &&
		(a.text ?? null) === (b.text ?? null) &&
		(a.fileId ?? null) === (b.fileId ?? null) &&
		(a.replyId ?? null) === (b.replyId ?? null) &&
		(a.quoteId ?? null) === (b.quoteId ?? null);
}

function outgoingMessageKey(message: NormalizedChatMessage): string {
	return [
		message.fromUserId,
		message.toUserId ?? '',
		message.toRoomId ?? '',
		message.text ?? '',
		message.fileId ?? '',
		message.replyId ?? '',
		message.quoteId ?? '',
	].join('\u001f');
}

function removeMatchingPendingMessagesFrom(current: NormalizedChatMessage[], incoming: NormalizedChatMessage[]): NormalizedChatMessage[] {
	if (incoming.length === 0) return current;

	const incomingKeys = new Set(incoming.map(message => outgoingMessageKey(message)));
	let removed = false;
	const next = current.filter(message => {
		if (!isPendingMessage(message) || !incomingKeys.has(outgoingMessageKey(message))) return true;
		removed = true;
		return false;
	});

	return removed ? next : current;
}

/**
 * 流路径下"server confirmed"原地替换 pending:返回新的 messages 数组以及被消费掉的 incoming id 集合。
 * 关键:adopted message 保留 pending 的 clientId,DynamicScroller key (`c:${clientId}`) 不变,DOM 不重挂。
 */
function adoptPendingMessagesFrom(current: NormalizedChatMessage[], incoming: NormalizedChatMessage[]): {
	next: NormalizedChatMessage[];
	consumedIncomingIds: Set<string>;
} {
	if (incoming.length === 0) return { next: current, consumedIncomingIds: new Set() };

	const pendingIndexByKey = new Map<string, number>();
	for (let i = 0; i < current.length; i++) {
		if (isPendingMessage(current[i])) {
			pendingIndexByKey.set(outgoingMessageKey(current[i]), i);
		}
	}
	if (pendingIndexByKey.size === 0) return { next: current, consumedIncomingIds: new Set() };

	const consumed = new Set<string>();
	let next = current;
	let mutated = false;
	for (const msg of incoming) {
		const key = outgoingMessageKey(msg);
		const idx = pendingIndexByKey.get(key);
		if (idx == null) continue;
		if (!mutated) {
			next = [...current];
			mutated = true;
		}
		const pending = next[idx];
		next[idx] = { ...msg, clientId: pending.clientId };
		consumed.add(msg.id);
		pendingIndexByKey.delete(key);
	}
	return { next: mutated ? next : current, consumedIncomingIds: consumed };
}

function removePendingMessage(clientId: string) {
	messages.value = messages.value.filter(message => message.clientId !== clientId);
}

function removeMatchingPendingMessage(message: NormalizedChatMessage) {
	const pending = messages.value.find(item => isPendingMessage(item) && isSameOutgoingMessage(item, message));
	if (pending != null && pending.clientId != null) {
		removePendingMessage(pending.clientId);
	}
}

function onSendingMessage(message: NormalizedChatMessage) {
	markOutgoingMessageAutoStick();
	prependMessage(message);
	void revealLatestMessagesAfterLayout({ behavior: 'instant' });
}

function onSentMessage(message: Misskey.entities.ChatMessageLite, clientId?: string) {
	markOutgoingMessageAutoStick();
	const normalized = normalizeMessage(message);

	// 关键:把"已确认"的真实消息原地替换 pending,并保留 clientId。
	// DynamicScroller 用 `c:${clientId}` 做 key,这样 DOM 不重挂 → 头像不闪。
	if (clientId != null) {
		const idx = messages.value.findIndex(m => m.clientId === clientId);
		if (idx >= 0) {
			const adopted: NormalizedChatMessage = { ...normalized, clientId };
			messages.value = [...messages.value.slice(0, idx), adopted, ...messages.value.slice(idx + 1)];
			replyTarget.value = null;
			quoteTarget.value = null;
			void revealLatestMessagesAfterLayout({ behavior: 'instant' });
			return;
		}
		removePendingMessage(clientId);
	}

	// fallback:没有 clientId,或没匹配到 pending(理论上不该发生),走旧的 remove+prepend 路径
	removeMatchingPendingMessage(normalized);
	prependMessage(normalized);
	replyTarget.value = null;
	quoteTarget.value = null;
	void revealLatestMessagesAfterLayout({ behavior: 'instant' });
}

function onSendMessageFailed(clientId: string) {
	removePendingMessage(clientId);
}

function onRestoreReferences(payload: { replyTarget: NormalizedChatMessage | null; quoteTarget: NormalizedChatMessage | null }) {
	replyTarget.value = payload.replyTarget;
	quoteTarget.value = payload.quoteTarget;
}

async function waitChannelConnected() {
	const channel = connection.value;
	if (!channel) return;

	try {
		await Promise.race([
			channel.waitConnected(),
			new Promise<void>(resolve => window.setTimeout(resolve, STREAM_CONNECT_TIMEOUT)),
		]);
	} catch (err) {
		console.warn('Failed to connect chat stream. Falling back to timeline polling.', err);
	}
}

function connectStream() {
	readReceiptBatcher.flush({ force: true });
	connection.value?.dispose();

	if (props.userId) {
		const userConnection = useStream().useChannel('chatUser', {
			otherId: props.userId,
		});
		userConnection.on('message', onMessage);
		userConnection.on('deleted', onDeleted);
		userConnection.on('deletedMany', onDeletedMany);
		userConnection.on('cleared', onCleared);
		userConnection.on('pruned', onPruned);
		userConnection.on('react', onReact);
		userConnection.on('unreact', onUnreact);
		// 1on1 进 DM 时服务端立刻 push 最新 30 条消息,替代 chat/messages/user-timeline 初次 HTTP
		userConnection.on('bootstrap', onUserBootstrap);
		connection.value = userConnection;
	} else if (room.value != null) {
		const roomConnection = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});
		roomConnection.on('message', onMessage);
		roomConnection.on('deleted', onDeleted);
		roomConnection.on('deletedMany', onDeletedMany);
		roomConnection.on('cleared', onCleared);
		roomConnection.on('pruned', onPruned);
		roomConnection.on('react', onReact);
		roomConnection.on('unreact', onUnreact);
		roomConnection.on('roomUpdated', onRoomUpdatedStream);
		roomConnection.on('memberKicked', onMemberKicked);
		roomConnection.on('memberMuted', onMemberMuted);
		roomConnection.on('memberRoleUpdated', onMemberRoleUpdated);
		// B-light:后端把 60ms 窗口内同房间的 message/react/unreact 合并成一个 batch 事件
		roomConnection.on('batch', onBatch);
		// 进群时服务端立刻 push 完整初始包(room + latest 30 messages + mutes)
		// 替代 chat/rooms/show + chat/messages/room-timeline + chat/rooms/user-mutes/list 三次 HTTP
		roomConnection.on('bootstrap', onBootstrap);
		connection.value = roomConnection;
	} else {
		connection.value = null;
		return;
	}
}

function clearStreamRecoveryTimer() {
	if (streamRecoveryTimer == null) return;
	window.clearTimeout(streamRecoveryTimer);
	streamRecoveryTimer = null;
}

function clearStreamRecoveryPollingTimer() {
	if (streamRecoveryPollingTimer == null) return;
	window.clearTimeout(streamRecoveryPollingTimer);
	streamRecoveryPollingTimer = null;
}

function markChatStreamEvent() {
	latestStreamEventAt = Date.now();
}

function startStreamRecoveryPolling(delay = STREAM_RECOVERY_POLL_INTERVAL_MS) {
	if (isRoomViewDisposed) return;
	if (streamRecoveryPollingTimer != null) return;

	streamRecoveryPollingTimer = window.setTimeout(async () => {
		streamRecoveryPollingTimer = null;
		if (isRoomViewDisposed) return;

		let retryDelay = STREAM_RECOVERY_POLL_INTERVAL_MS;
		const streamStale = Date.now() - latestStreamEventAt >= STREAM_RECOVERY_STALE_MS;
		const shouldStickToLatest = shouldAutoRevealLatestMessages();
		const shouldCheckLatest = shouldStickToLatest || streamStale || showIndicator.value || showScrollToLatestButton.value || canFetchNewer.value;
		if (canSyncLatestMessages() && shouldCheckLatest) {
			try {
				await syncLatestMessages({ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, reconcileLatestWindow: shouldStickToLatest || streamStale });
			} catch (err) {
				if (!isAbortError(err)) {
					console.warn('Failed to poll latest chat messages:', err);
				}
				retryDelay = STREAM_RECOVERY_ERROR_RETRY_MS;
			}
		}

		if (isRoomViewDisposed) return;
		startStreamRecoveryPolling(retryDelay);
	}, delay);
}

function rememberStreamRecoverySinceId(sinceId: string | undefined) {
	if (sinceId == null) return;
	if (streamRecoverySinceId == null || sinceId < streamRecoverySinceId) {
		streamRecoverySinceId = sinceId;
	}
}

function scheduleStreamRecovery(reason: 'connected' | 'visible' | 'manual' = 'manual', options?: { sinceId?: string; force?: boolean; reconcileLatestWindow?: boolean }) {
	if (reason !== 'manual' && options?.force !== true && options?.sinceId == null && !streamHadDisconnect && isChatStreamHealthy()) return;
	rememberStreamRecoverySinceId(options?.sinceId);
	clearStreamRecoveryTimer();
	streamRecoveryTimer = window.setTimeout(async () => {
		streamRecoveryTimer = null;
		if (!canSyncLatestMessages()) return;

		const shouldStickToLatest = shouldAutoRevealLatestMessages();
		const sinceId = streamRecoverySinceId;
		streamRecoverySinceId = undefined;
		try {
			if (reason === 'connected') {
				await waitChannelConnected();
			}
			await syncLatestMessages({ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId, reconcileLatestWindow: shouldStickToLatest || options?.force === true || options?.reconcileLatestWindow === true });
		} catch (err) {
			if (!isAbortError(err)) {
				console.warn('Failed to recover chat stream messages:', err);
			}
		}
	}, STREAM_RECOVERY_DEBOUNCE_MS);
}

function onStreamConnected() {
	markChatStreamEvent();
	if (streamHadDisconnect) {
		clearStreamRecoveryPollingTimer();
		scheduleStreamRecovery('connected');
	}
	streamHadDisconnect = false;
	startStreamRecoveryPolling();
}

function onStreamDisconnected() {
	streamHadDisconnect = true;
	clearStreamRecoveryPollingTimer();
	showScrollToLatestButton.value = true;
	startStreamRecoveryPolling(STREAM_RECOVERY_ERROR_RETRY_MS);
}

async function fetchLatestGap(sinceId = findNewestPersistedMessageId(), options?: { maxPages?: number; bufferOnly?: boolean; signal?: AbortSignal }): Promise<LatestGapMessage[]> {
	const requestKey = [
		props.userId != null ? `user:${props.userId}` : `room:${room.value?.id ?? ''}`,
		sinceId ?? '',
		options?.maxPages ?? 1,
		options?.bufferOnly === true ? 'buffer' : 'append',
	].join(':');
	if (latestGapPromise != null && latestGapPromiseKey === requestKey) {
		return await latestGapPromise;
	}

	const run = async (): Promise<LatestGapMessage[]> => {
		const maxPages = Math.max(1, options?.maxPages ?? 1);
		let cursor = sinceId;
		const newVisibleMessages: LatestGapMessage[] = [];

		for (let i = 0; i < maxPages; i++) {
			const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
				userId: user.value!.id,
				limit: TIMELINE_LIMIT,
				...(cursor ? { sinceId: cursor } : {}),
			}, undefined, options?.signal) : await misskeyApi('chat/messages/room-timeline', {
				roomId: room.value!.id,
				limit: TIMELINE_LIMIT,
				...(cursor ? { sinceId: cursor } : {}),
			}, undefined, options?.signal);

			if (options?.bufferOnly === true) {
				newVisibleMessages.push(...bufferFetchedLatestMessages(newMessages));
			} else {
				newVisibleMessages.push(...appendFetchedMessages(newMessages));
			}

			if (newMessages.length < TIMELINE_LIMIT) break;

			const newestId = newMessages.reduce<string | null>((acc, message) => acc == null || message.id > acc ? message.id : acc, cursor ?? null);
			if (newestId == null || newestId === cursor) break;
			cursor = newestId;
		}

		return newVisibleMessages;
	};

	latestGapPromiseKey = requestKey;
	latestGapPromise = run();
	try {
		return await latestGapPromise;
	} finally {
		if (latestGapPromiseKey === requestKey && latestGapPromise != null) {
			latestGapPromise = null;
			latestGapPromiseKey = null;
		}
	}
}

async function fetchLatestGapWithRecoveryTimeout(sinceId: string | undefined, options?: { maxPages?: number; bufferOnly?: boolean }): Promise<LatestGapMessage[]> {
	const controller = new AbortController();
	const timeoutId = window.setTimeout(() => controller.abort(), CHAT_RECOVERY_FETCH_TIMEOUT_MS);

	try {
		return await fetchLatestGap(sinceId, {
			...options,
			signal: controller.signal,
		});
	} finally {
		window.clearTimeout(timeoutId);
	}
}

async function syncLatestMessages(options?: { stickToLatest?: boolean; flushReadReceipt?: boolean; sinceId?: string; reconcileLatestWindow?: boolean }) {
	if (!canSyncLatestMessages()) return;
	if (latestSyncPromise != null) {
		await latestSyncPromise;
		return;
	}

	const generation = ++latestSyncGeneration;
	const run = async () => {
		const shouldStickToLatest = options?.stickToLatest === true || shouldAutoRevealLatestMessages();
		const initialSinceId = options?.sinceId ?? findNewestPersistedMessageId();
		flushIncomingMessagesNow({ stickToLatest: shouldStickToLatest });

		if (options?.reconcileLatestWindow === true) {
			try {
				await reconcileLatestTimelineWindow();
			} catch (err) {
				if (!isAbortError(err)) {
					console.warn('Failed to reconcile latest chat messages:', err);
				}
			}
		}

		const sinceId = options?.sinceId ?? findNewestPersistedMessageId() ?? initialSinceId;
		let newVisibleMessages: LatestGapMessage[] = [];

		try {
			newVisibleMessages = await fetchLatestGapWithRecoveryTimeout(sinceId, { maxPages: STREAM_LATEST_GAP_MAX_PAGES, bufferOnly: !shouldStickToLatest });
		} catch (err) {
			if (!isAbortError(err)) {
				console.warn('Failed to sync latest chat messages:', err);
			}
		}

		const isLatestSync = generation === latestSyncGeneration;

		if (shouldStickToLatest) {
			if (!isLatestSync) return;
			await scrollToLatestAfterLayout({ flushReadReceipt: options?.flushReadReceipt });
		} else {
			const otherCount = newVisibleMessages.filter(message => message.fromUserId !== $i.id).length;
			if (otherCount > 0) {
				notifyNewMessages(otherCount);
			}
			if (newVisibleMessages.length > 0) {
				showScrollToLatestButton.value = true;
			}
		}
	};

	const syncPromise = (latestSyncPromise ?? Promise.resolve()).then(run, run);
	latestSyncPromise = syncPromise;
	await syncPromise;
	if (latestSyncPromise === syncPromise) {
		latestSyncPromise = null;
	}
}

async function showLatestMessages(behavior: ScrollBehavior = 'smooth') {
	if (latestRevealPromise != null) {
		await latestRevealPromise;
		await scrollToLatestAfterLayout({ behavior, flushReadReceipt: true });
		return;
	}

	const run = async () => {
		try {
			await revealAuthoritativeLatestWindow();
		} catch (err) {
			if (!isAbortError(err)) {
				console.warn('Failed to reconcile latest chat messages before revealing:', err);
			}
		}
	};

	latestRevealPromise = run();
	try {
		await latestRevealPromise;
	} finally {
		latestRevealPromise = null;
	}

	await scrollToLatestAfterLayout({ behavior, flushReadReceipt: true });
}

async function revealAuthoritativeLatestWindow() {
	if (!canSyncLatestMessages()) {
		flushIncomingMessagesNow({ stickToLatest: true });
		flushDetachedIncomingMessages({ queueReadReceipt: true, keep: 'newest' });
		clearNewMessageIndicator();
		showScrollToLatestButton.value = false;
		return;
	}

	const latestWindow = await reconcileLatestTimelineWindow();
	flushIncomingMessagesNow({ stickToLatest: true });
	const latestResult = appendFetchedMessagesWithWindow(latestWindow, 'newest');
	flushDetachedIncomingMessages({ queueReadReceipt: true, keep: 'newest' });
	if (latestResult.length > 0 || detachedIncomingMessages.length === 0) {
		canFetchNewer.value = false;
		newerFetchArmed = false;
	}
	clearNewMessageIndicator();
	showScrollToLatestButton.value = false;
}

async function initializeContextTimeline(messageId: string) {
	const context = await misskeyApi<{
		before: Misskey.entities.ChatMessage[];
		target: Misskey.entities.ChatMessage;
		after: Misskey.entities.ChatMessage[];
		hasMoreBefore: boolean;
		hasMoreAfter: boolean;
	}>('chat/messages/context', {
		messageId,
		limitBefore: CONTEXT_LIMIT,
		limitAfter: CONTEXT_LIMIT,
	});

	contextTargetMessageId.value = context.target.id;
	pendingContextScrollId.value = context.target.id;
	replaceMessages([...context.after, context.target, ...context.before]);
	canFetchMore.value = context.hasMoreBefore;
	canFetchNewer.value = context.hasMoreAfter;
}

async function loadLatestTimeline() {
	clearIncomingMessageQueue({ flushReadReceipt: true });
	streamRecoverySinceId = undefined;
	// 等 bootstrap:WS 连接 + 后端 packedRoomTimeline + send,实测国内蜂窝网下要 300~800ms,
	// 之前给 200ms 不够,导致大部分用户都 fallback 到 HTTP。给 1500ms 上限,WS 健康时绝大多数
	// 在 200ms 内拿到 bootstrap;真的连不通了再走 HTTP 兜底。
	if (room.value != null || props.userId != null) {
		const startWait = Date.now();
		while (Date.now() - startWait < 1500 && bootstrapAppliedAt === 0) {
			await new Promise(r => window.setTimeout(r, 30));
		}
		if (bootstrapAppliedAt > 0) {
			// bootstrap 已经填好 messages + canFetchMore,直接出
			return;
		}
	}
	messages.value = [];
	canFetchMore.value = false;
	canFetchNewer.value = false;
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	showIndicator.value = false;
	newMessageCount.value = 0;
	historyFetchArmed = true;
	newerFetchArmed = true;

	if (props.userId) {
		const m = await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: TIMELINE_LIMIT });
		appendFetchedMessages(m);
		canFetchMore.value = m.length === TIMELINE_LIMIT;
		return;
	}

	if (room.value == null) return;

	const m = await misskeyApi('chat/messages/room-timeline', { roomId: room.value.id, limit: TIMELINE_LIMIT });
	appendFetchedMessages(m);
	canFetchMore.value = m.length === TIMELINE_LIMIT;
}

async function loadMutedRoomUsers() {
	if (room.value == null || room.value.isJoined === false) {
		mutedRoomUserIds.value = new Set();
		return;
	}

	// bootstrap 已应用过的话直接跳过 HTTP(mutedRoomUserIds 已被填好)
	if (bootstrapAppliedAt > 0) return;

	const res = await misskeyApi('chat/rooms/user-mutes/list', {
		roomId: room.value.id,
		limit: 100,
	});
	mutedRoomUserIds.value = new Set(res.map(item => item.muteeId));
}

function clearMessageContextRoute() {
	if (props.messageId == null) return;

	const path = props.roomId != null ? `/chat/room/${props.roomId}` : props.userId != null ? `/chat/user/${props.userId}` : null;
	if (path == null) return;

	suppressNextMessageIdClearInitialize = true;
	router.replace(path);
}

async function finishContextAtLatest() {
	if (!isContextMode.value) return;

	clearMessageContextRoute();
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	await showLatestMessages('instant');
	await fillInitialScrollableHistory();
}

async function exitContextToLatest() {
	if (initializing.value) return;

	clearMessageContextRoute();
	initializing.value = true;
	initializeError.value = null;
	joinRequiredRoom.value = null;

	try {
		await loadLatestTimeline();
	} catch (err) {
		console.error('Failed to exit chat message context:', err);
		messages.value = [];
		initializeError.value = props.roomId ? i18n.ts._chat.noPermissionToViewRoom : i18n.ts.pageLoadError;
	} finally {
		await finishInitializeRender();
	}
}

async function openMessageContext(messageId: string) {
	tab.value = 'chat';
	clearLatestEdgeInitialLock();
	clearLateInitialRescrollTimers();
	clearIncomingMessageQueue({ flushReadReceipt: true });
	streamRecoverySinceId = undefined;
	initializeError.value = null;
	joinRequiredRoom.value = null;
	canFetchMore.value = false;
	canFetchNewer.value = false;
	messages.value = [];
	showIndicator.value = false;
	newMessageCount.value = 0;
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	historyFetchArmed = true;
	newerFetchArmed = true;
	initializing.value = true;

	try {
		await initializeContextTimeline(messageId);
	} catch (err) {
		console.error('Failed to open chat message context:', err);
		messages.value = [];
		initializeError.value = props.roomId ? i18n.ts._chat.noPermissionToViewRoom : i18n.ts.pageLoadError;
	} finally {
		await finishInitializeRender();
	}
}

async function openReferenceMessage(messageId: string) {
	tab.value = 'chat';
	clearLatestEdgeInitialLock();
	clearLateInitialRescrollTimers();
	clearIncomingMessageQueue({ flushReadReceipt: true });
	streamRecoverySinceId = undefined;
	initializeError.value = null;
	joinRequiredRoom.value = null;
	showIndicator.value = false;
	newMessageCount.value = 0;
	contextTargetMessageId.value = messageId;
	pendingContextScrollId.value = messageId;

	if (messages.value.some(message => message.id === messageId)) {
		await scrollContextTargetAfterRender(messageId);
		return;
	}

	canFetchMore.value = false;
	canFetchNewer.value = false;
	historyFetchArmed = true;
	newerFetchArmed = true;
	initializing.value = true;

	try {
		await initializeContextTimeline(messageId);
	} catch (err) {
		console.error('Failed to open referenced chat message:', err);
		contextTargetMessageId.value = null;
		pendingContextScrollId.value = null;
		initializeError.value = props.roomId ? i18n.ts._chat.noPermissionToViewRoom : i18n.ts.pageLoadError;
	} finally {
		await finishInitializeRender();
	}
}

async function scrollContextTargetAfterRender(messageId: string) {
	beginScrollRestoration();
	try {
		for (let i = 0; i < 60; i++) {
			await nextTick();
			await waitAnimationFrame();
			if (scrollMessageIntoView(messageId, 'center')) {
				break;
			}
		}
	} finally {
		endScrollRestoration();
	}
}

async function finishInitializeRender() {
	initializing.value = false;
	const messageId = pendingContextScrollId.value;
	pendingContextScrollId.value = null;
	if (initializeError.value != null || joinRequiredRoom.value != null) return;

	if (messageId != null) {
		await scrollContextTargetAfterRender(messageId);
	} else {
		await scrollToLatestAfterLayout({ fillHistory: true });
	}
}

async function scrollToLatestAfterLayout(options?: { flushReadReceipt?: boolean; fillHistory?: boolean; behavior?: ScrollBehavior }) {
	let initialLatestEdgeLockGeneration: number | null = null;
	if (!isContextMode.value) {
		initialLatestEdgeLockGeneration = lockLatestEdgeDuringInitialRender();
	}
	beginScrollRestoration();

	try {
		let stableFrames = 0;
		let previousMaxScrollTop = -1;
		// 切换房间后,重新挂载的时间线容器可能需要超过10帧才会拿到高度。
		// 因此「容器未就绪(clientHeight<=0)」的帧不计入稳定预算,改为单独的总帧上限,
		// 保证容器一旦有高度就一定会滚到底部(修复换群聊后停在最上面的问题)。
		let readyFrames = 0;
		let totalFrames = 0;
		const MAX_READY_FRAMES = 10;
		const MAX_TOTAL_FRAMES = 40;

		while (readyFrames < MAX_READY_FRAMES && totalFrames < MAX_TOTAL_FRAMES) {
			totalFrames++;
			await nextTick();
			await waitAnimationFrame();

			const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
			if (scrollContainer == null || scrollContainer.clientHeight <= 0) continue;

			readyFrames++;
			const { maxScrollTop } = getChatScrollMetrics(scrollContainer);
			scrollToLatest('instant');

			if (maxScrollTop === previousMaxScrollTop) {
				stableFrames++;
				if (stableFrames >= 2) break;
			} else {
				stableFrames = 0;
				previousMaxScrollTop = maxScrollTop;
			}
		}

		scrollToLatest(options?.behavior ?? 'instant', { flushReadReceipt: options?.flushReadReceipt });
		if (options?.fillHistory === true) {
			await fillInitialScrollableHistory();
		}
		// avatar/图片晚加载会撑高内容把视图顶离底部:在锁定期内分批兜底重锚
		if (initialLatestEdgeLockGeneration != null && isLatestEdgeInitialLockActive(initialLatestEdgeLockGeneration)) {
			scheduleLateInitialRescrolls(initialLatestEdgeLockGeneration);
		}
	} finally {
		endScrollRestoration();
	}
}

async function initialize() {
	initializing.value = true;
	clearIncomingMessageQueue({ flushReadReceipt: true });
	streamRecoverySinceId = undefined;
	initializeError.value = null;
	joinRequiredRoom.value = null;
	canFetchMore.value = false;
	canFetchNewer.value = false;
	// 切群时上一房间的滚动 snapshot 必须清掉,否则 ResizeObserver
	// 触发的"是否吸底"判断会拿旧 maxScrollTop 比对新房间,新房进群停在错误位置(经常停在中间/顶部)。
	latestScrollMetricsSnapshot = null;
	bootstrapAppliedAt = 0;
	clearLatestEdgeInitialLock();
	clearLateInitialRescrollTimers();
	autoScrollState.markLatest();
	messages.value = [];
	readReceiptBatcher.flush({ force: true });
	connection.value?.dispose();
	connection.value = null;
	showIndicator.value = false;
	newMessageCount.value = 0;
	showScrollToLatestButton.value = false;
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	historyFetchArmed = true;
	newerFetchArmed = true;

	try {
		if (props.userId) {
			mutedRoomUserIds.value = new Set();
			const u = await misskeyApi('users/show', { userId: props.userId });
			user.value = u;
			rememberUser(u);
			room.value = null;

			connectStream();

			if (props.messageId != null) {
				await initializeContextTimeline(props.messageId);
			} else {
				await loadLatestTimeline();
			}
		} else {
			const roomId = props.roomId;
			if (roomId == null) {
				initializeError.value = i18n.ts.pageLoadError;
				return;
			}

			const r = await misskeyApi('chat/rooms/show', { roomId });

			user.value = null;
			room.value = r as Misskey.entities.ChatRoomsShowResponse;
			rememberUser(room.value.owner);

			if (room.value.isJoined === false) {
				mutedRoomUserIds.value = new Set();
				messages.value = [];
				if (room.value.joinMode === 'open') {
					joinRequiredRoom.value = room.value;
				} else if (room.value.joinMode === 'closed') {
					initializeError.value = i18n.ts._chat.joiningDisabledRoom;
				} else {
					initializeError.value = i18n.ts._chat.needInvitationToJoinRoom;
				}
				return;
			}

			// stream接続はブロックせず開始し、タイムラインとミュート一覧を並列取得して往復回数を削減する
			// （接続前のメッセージ取りこぼしは _connected_ 後の recovery で補完される）
			connectStream();

			if (props.messageId != null) {
				await Promise.all([loadMutedRoomUsers(), initializeContextTimeline(props.messageId)]);
			} else {
				await Promise.all([loadMutedRoomUsers(), loadLatestTimeline()]);
			}
		}
	} catch (err) {
		console.error('Failed to initialize chat room:', err);
		messages.value = [];
		initializeError.value = props.roomId ? i18n.ts._chat.noPermissionToViewRoom : i18n.ts.pageLoadError;
	} finally {
		await finishInitializeRender();
	}
}

async function joinRoom() {
	if (room.value == null) return;

	joiningRoom.value = true;
	try {
		await os.apiWithDialog('chat/rooms/join', {
			roomId: room.value.id,
		}, undefined, {
			'6bf0e3a6-0434-4be0-85d5-5d3c9b8f4f6d': {
				text: i18n.ts._chat.needInvitationToJoinRoom,
			},
			'b4855d16-3863-4600-8301-2a53f2f76541': {
				text: i18n.tsx._chat.roomIsFull({ limit: room.value?.memberLimit ?? '?' }),
			},
			'bd6e849a-9870-4dcb-8025-765cf404f6d8': {
				text: i18n.ts._chat.joiningDisabledRoom,
			},
		});
		await initialize();
	} finally {
		joiningRoom.value = false;
	}
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
	readReceiptBatcher.flush();
	if (tab.value === 'chat' && !isContextMode.value && !initializing.value && initializeError.value == null && joinRequiredRoom.value == null) {
		scheduleLatestOnChatTabReturn({ forceLatest: false });
	}
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore(options: { keepLatest?: boolean } = {}) {
	const LIMIT = 30;
	const untilId = findOldestPersistedMessageId();
	if (!canFetchMore.value || moreFetching.value || newerFetching.value || untilId == null) return;

	const anchor = options.keepLatest ? null : getVisibleMessageAnchor();
	beginScrollRestoration();
	moreFetching.value = true;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId,
		});

		appendFetchedMessagesWithWindow(newMessages, options.keepLatest ? 'newest' : 'oldest');

		canFetchMore.value = newMessages.length === LIMIT;
	} finally {
		moreFetching.value = false;
		if (options.keepLatest) {
			await nextTick();
			await waitAnimationFrame();
			scrollToLatest('instant');
		} else {
			// The loading row is part of the scroll layout, so restore only after it is gone.
			await restoreVisibleMessageAnchorAfterLayout(anchor);
		}
		endScrollRestoration();
		nextTick(() => {
			const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
			if (scrollContainer == null) return;
			historyFetchArmed = getChatScrollMetrics(scrollContainer).historyDistance >= SCROLL_HISTORY_THRESHOLD;
		});
	}
}

async function fillInitialScrollableHistory() {
	if (isContextMode.value) return;

	for (let i = 0; i < INITIAL_HISTORY_FILL_LIMIT; i++) {
		await nextTick();
		await waitAnimationFrame();

		const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
		if (scrollContainer == null || messages.value.length === 0 || !canFetchMore.value || moreFetching.value) return;
		if (scrollContainer.scrollHeight > scrollContainer.clientHeight + 1) return;
		const limit = messageLimit();
		if (limit != null && messages.value.length >= limit) return;

		await fetchMore({ keepLatest: true });
	}
}

async function fetchNewer() {
	const LIMIT = 30;
	const sinceId = findNewestPersistedMessageId();
	if (!canFetchNewer.value || newerFetching.value || moreFetching.value || sinceId == null) return;

	const anchor = getVisibleMessageAnchor();
	const wasContextMode = isContextMode.value;
	let reachedLatestInContext = false;
	beginScrollRestoration();
	newerFetching.value = true;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			sinceId,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			sinceId,
		});

		appendFetchedMessagesWithWindow(newMessages, 'newest');
		canFetchNewer.value = newMessages.length === LIMIT;
		reachedLatestInContext = wasContextMode && !canFetchNewer.value;
	} finally {
		newerFetching.value = false;
		if (reachedLatestInContext) {
			endScrollRestoration();
			await finishContextAtLatest();
		} else {
			await restoreVisibleMessageAnchorAfterLayout(anchor);
			endScrollRestoration();
			nextTick(() => {
				const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
				if (scrollContainer == null) return;
				newerFetchArmed = getChatScrollMetrics(scrollContainer).latestDistance >= SCROLL_TAIL_THRESHOLD;
			});
		}
	}
}

function clearIncomingMessageQueue(options?: { flushReadReceipt?: boolean }) {
	if (options?.flushReadReceipt === true) {
		readReceiptBatcher.flush({ force: true });
	}

	pendingIncomingMessages = [];
	pendingIncomingShouldStickToLatest = false;
	detachedIncomingMessages = [];
	if (pendingIncomingMessageFrame != null) {
		window.cancelAnimationFrame(pendingIncomingMessageFrame);
		pendingIncomingMessageFrame = null;
	}
	if (options?.flushReadReceipt !== true) {
		readReceiptBatcher.cancel();
	}
}

function flushDetachedIncomingMessages(options?: { queueReadReceipt?: boolean; keep?: 'newest' | 'oldest' }) {
	if (detachedIncomingMessages.length === 0) return false;

	const filtered = filterMutedRoomMessages(detachedIncomingMessages);
	const normalized = filtered.map(message => normalizeMessage(message));
	detachedIncomingMessages = [];
	if (normalized.length === 0) return false;

	const newestOtherMessage = getNewestMessage(normalized.filter(message => message.fromUserId !== $i.id));
	const current = removeMatchingPendingMessagesFrom(messages.value, normalized);
	const result = mergeMessagesWithResult({ keep: options?.keep ?? 'newest' }, current, normalized);
	messages.value = result.messages;
	applyWindowTrimFlags(result);

	if (options?.queueReadReceipt === true && newestOtherMessage != null && !window.document.hidden && isActivated) {
		readReceiptBatcher.queue(newestOtherMessage.id);
	}

	return true;
}

function getNewestMessage(messages: NormalizedChatMessage[]): NormalizedChatMessage | null {
	let newest: NormalizedChatMessage | null = null;
	for (const message of messages) {
		if (newest == null || message.id > newest.id) {
			newest = message;
		}
	}
	return newest;
}

function processIncomingMessageBatch(batch: Misskey.entities.ChatMessageLite[], options?: { stickToLatest?: boolean }) {
	if (batch.length === 0) return;

	const visibleBatch = filterMutedRoomMessages(batch);
	if (visibleBatch.length === 0) return;
	const batchNewestId = visibleBatch.reduce<string | null>((acc, message) => acc == null || message.id > acc ? message.id : acc, null);
	const shouldStickToLatest = options?.stickToLatest === true || shouldForceStickIncomingBatchToLatest(visibleBatch) || shouldAutoRevealLatestMessages();

	if (isContextMode.value) {
		if (shouldStickToLatest) {
			clearMessageContextRoute();
			contextTargetMessageId.value = null;
			pendingContextScrollId.value = null;
			canFetchNewer.value = false;
			newerFetchArmed = false;
		} else {
			const normalized = visibleBatch.map(message => normalizeMessage(message));
			messages.value = removeMatchingPendingMessagesFrom(messages.value, normalized);
			const otherCount = normalized.filter(message => message.fromUserId !== $i.id).length;
			if (otherCount > 0) {
				notifyNewMessages(otherCount);
			}
			return;
		}
	}

	const wasAtLatest = shouldStickToLatest || isAtLatest();
	const shouldRecoverGap = batchNewestId != null && findNewestPersistedMessageId() != null && batchNewestId > findNewestPersistedMessageId()!;
	const normalized = visibleBatch.map(message => normalizeMessage(message));
	const newestOtherMessage = getNewestMessage(normalized.filter(message => message.fromUserId !== $i.id));
	const otherCount = normalized.filter(message => message.fromUserId !== $i.id).length;

	if (room.value?.isMuted !== true) {
		sound.playMisskeySfx('chatMessage');
	}

	const firstNormalized = normalized[0];
	if (firstNormalized == null) return;

	const { next: adopted, consumedIncomingIds } = adoptPendingMessagesFrom(messages.value, normalized);
	const remaining = consumedIncomingIds.size === 0 ? normalized : normalized.filter(m => !consumedIncomingIds.has(m.id));

	if (!wasAtLatest) {
		detachedIncomingMessages = trimDetachedIncomingMessages(appendDetachedChatMessages(detachedIncomingMessages, visibleBatch, messages.value));
		messages.value = adopted;
		detachedIncomingMessages = trimDetachedIncomingMessages(appendDetachedChatMessages(detachedIncomingMessages, [], messages.value));
		// 用户在向上翻历史。不滚动,仅亮起 "+N 条新消息" 指示器 + 到底按钮。
		if (otherCount > 0) {
			notifyNewMessages(otherCount);
		}
		showScrollToLatestButton.value = true;
		canFetchNewer.value = true;
		newerFetchArmed = true;
		if (shouldRecoverGap) {
			scheduleStreamRecovery('manual');
		}
		return;
	}

	if (remaining.length === 0) {
		messages.value = adopted;
	} else {
		const result = mergeMessagesWithResult(adopted, remaining);
		messages.value = result.messages;
		applyWindowTrimFlags(result);
	}
	markFreshlyArrived(remaining.map(m => m.id));

	// 在底部:标已读 + 自动锚底
	if (newestOtherMessage != null && !window.document.hidden && isActivated) {
		readReceiptBatcher.queue(newestOtherMessage.id);
	}
	void revealLatestMessagesAfterLayout({ behavior: 'instant', flushReadReceipt: true });
	if (shouldRecoverGap) {
		scheduleStreamRecovery('manual');
	}
}

function flushIncomingMessages() {
	pendingIncomingMessageFrame = null;
	const batch = pendingIncomingMessages;
	const shouldStickToLatest = pendingIncomingShouldStickToLatest;
	pendingIncomingMessages = [];
	pendingIncomingShouldStickToLatest = false;
	processIncomingMessageBatch(batch, { stickToLatest: shouldStickToLatest });
}

function flushIncomingMessagesNow(options?: { stickToLatest?: boolean }) {
	if (pendingIncomingMessageFrame != null) {
		window.cancelAnimationFrame(pendingIncomingMessageFrame);
		pendingIncomingMessageFrame = null;
	}

	const batch = pendingIncomingMessages;
	const shouldStickToLatest = pendingIncomingShouldStickToLatest || options?.stickToLatest === true;
	pendingIncomingMessages = [];
	pendingIncomingShouldStickToLatest = false;
	processIncomingMessageBatch(batch, { stickToLatest: shouldStickToLatest });
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	markChatStreamEvent();
	pendingIncomingShouldStickToLatest = pendingIncomingShouldStickToLatest || shouldForceStickIncomingBatchToLatest([message]) || shouldAutoRevealLatestMessages();
	pendingIncomingMessages.push(message);
	if (pendingIncomingMessageFrame == null) {
		pendingIncomingMessageFrame = window.requestAnimationFrame(flushIncomingMessages);
	}
}

function onDeleted(id: string) {
	markChatStreamEvent();
	removeLocalChatMessagesByIds([id]);
}

function onDeletedMany(ids: string[]) {
	markChatStreamEvent();
	removeLocalChatMessagesByIds(ids);
}

function onCleared() {
	markChatStreamEvent();
	clearIncomingMessageQueue({ flushReadReceipt: true });
	messages.value = [];
	canFetchMore.value = false;
	canFetchNewer.value = false;
	replyTarget.value = null;
	quoteTarget.value = null;
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	clearNewMessageIndicator();
}

function onPruned(ctx: Parameters<Misskey.Channels['chatRoom']['events']['pruned']>[0]) {
	markChatStreamEvent();
	messages.value = messages.value.filter(message => message.id >= ctx.cutoffId);
	if (messages.value.length === 0) {
		canFetchMore.value = false;
		canFetchNewer.value = false;
	}
}

// 进群 bootstrap:WS 端口直推的初始数据。把 messages + mutes 全套填进去,
// 后续 loadLatestTimeline / loadMutedRoomUsers 看到 bootstrapAppliedAt 就直接跳过 HTTP。
let bootstrapAppliedAt = 0;

// 1on1 DM 的 bootstrap:服务端推过来 30 条 messages,跳过 HTTP user-timeline
function onUserBootstrap(payload: Parameters<Misskey.Channels['chatUser']['events']['bootstrap']>[0]) {
	if (payload.messages.length > 0) {
		// ChatMessageLiteFor1on1 跟 ChatMessageLite 在 frontend 这一侧统一处理;运行时一致
		appendFetchedMessages(payload.messages as unknown as Misskey.entities.ChatMessageLite[]);
		canFetchMore.value = payload.messages.length === 30;
	}
	bootstrapAppliedAt = Date.now();
}

function onBootstrap(payload: Parameters<Misskey.Channels['chatRoom']['events']['bootstrap']>[0]) {
	// room 信息:HTTP 已经在跑了,但 bootstrap 一般会更新——以 HTTP 为准时也接受 bootstrap 的 latest 字段
	if (room.value == null) {
		room.value = payload.room as Misskey.entities.ChatRoomsShowResponse;
		rememberUser(payload.room.owner);
	}
	// muted list
	mutedRoomUserIds.value = new Set(payload.mutedRoomUserIds);
	// 消息:合并而非覆盖(HTTP 可能已经回来一部分;bootstrap 30 条通常更全)
	if (payload.messages.length > 0) {
		appendFetchedMessages(payload.messages);
		canFetchMore.value = payload.messages.length === 30;
	}
	bootstrapAppliedAt = Date.now();
}

// B-light:后端 batcher 合并的高频事件包,这里按顺序解包后复用既有 onMessage/onReact/onUnreact 分发逻辑。
function onBatch(events: Parameters<Misskey.Channels['chatRoom']['events']['batch']>[0]) {
	for (const ev of events) {
		switch (ev.type) {
			case 'message': onMessage(ev.body); break;
			case 'react': onReact(ev.body); break;
			case 'unreact': onUnreact(ev.body); break;
		}
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	markChatStreamEvent();
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		if (room.value == null) { // 1on1の時はuserは省略される
			message.reactions.push({
				reaction: ctx.reaction,
				user: message.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			rememberUser(ctx.user);
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user ?? null,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	markChatStreamEvent();
	const message = messages.value.find(m => m.id === ctx.messageId);
	rememberUser(ctx.user);
	if (message) {
		const reactedUser = ctx.user ?? (room.value == null ? (message.fromUserId === $i.id ? user.value : $i) : null);
		if (reactedUser == null) return;

		const index = message.reactions.findIndex(r => r.user != null && r.reaction === ctx.reaction && r.user.id === reactedUser.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onRoomUpdatedStream(ctx: Parameters<Misskey.Channels['chatRoom']['events']['roomUpdated']>[0]) {
	markChatStreamEvent();
	if (room.value == null) return;
	room.value = {
		...room.value,
		name: ctx.name,
		description: ctx.description,
		joinMode: ctx.joinMode,
		avatarUrl: ctx.avatarUrl,
		isSilenced: ctx.isSilenced,
		announcement: ctx.announcement,
		announcementPinned: ctx.announcementPinned,
		...(ctx.announcementHistory != null ? { announcementHistory: ctx.announcementHistory } : {}),
	} as typeof room.value;
}

function onMemberKicked(ctx: Parameters<Misskey.Channels['chatRoom']['events']['memberKicked']>[0]) {
	markChatStreamEvent();
	if (room.value == null) return;

	if (ctx.userId === $i.id) {
		// 進行中の取得処理(room.value!.id 参照)が走らないように先にストリームを止め、
		// 退出後はチャットホームへ戻す
		isRoomViewDisposed = true;
		connection.value?.dispose();
		connection.value = null;
		void os.alert({
			type: 'warning',
			text: i18n.ts._chat.youWereKickedFromRoom,
		}).then(() => {
			router.push('/chat');
		});
		return;
	}

	room.value = {
		...room.value,
		memberCount: Math.max(1, room.value.memberCount - 1),
	};
	membersRefreshKey.value++;
}

function onMemberMuted(ctx: Parameters<Misskey.Channels['chatRoom']['events']['memberMuted']>[0]) {
	markChatStreamEvent();
	if (room.value == null) return;

	if (ctx.userId === $i.id) {
		room.value = {
			...room.value,
			myMutedUntil: ctx.mutedUntil,
		};
	}
	membersRefreshKey.value++;
}

async function onMemberRoleUpdated(ctx: Parameters<Misskey.Channels['chatRoom']['events']['memberRoleUpdated']>[0]) {
	markChatStreamEvent();
	membersRefreshKey.value++;
	if (room.value == null || ctx.userId !== $i.id) return;
	try {
		const updated = await misskeyApi('chat/rooms/show', {
			roomId: room.value.id,
		});
		room.value = updated;
	} catch {
		// 権限が変わった直後に再取得できなくても、次の通常更新で復旧する
	}
}

function onIndicatorClick() {
	if (isContextMode.value) {
		// 之前调 exitContextToLatest → loadLatestTimeline,会等 bootstrap 1.5s 再 HTTP 兜底,
		// 导致"点了跳到底部"看上去没反应。WS 已连着,直接走 finishContextAtLatest:
		// 清 context 标记 + revealLatestMessagesAfterLayout + 同步最新,瞬时反馈。
		void finishContextAtLatest();
		return;
	}

	void showLatestMessages('instant');
}

function notifyNewMessages(count = 1) {
	showIndicator.value = true;
	newMessageCount.value += count;
}

function setReplyTarget(message: NormalizedChatMessage) {
	replyTarget.value = message;
	quoteTarget.value = null;
	nextTick(() => formEl.value?.focus());
}

function setQuoteTarget(message: NormalizedChatMessage) {
	quoteTarget.value = message;
	replyTarget.value = null;
	nextTick(() => formEl.value?.focus());
}

function mentionUser(user: Misskey.entities.UserLite) {
	formEl.value?.insertMention(user);
}

function updateChatTabsScrollState() {
	const tabs = localTabsEl.value;
	if (tabs == null) {
		showChatTabsScrollControls.value = false;
		canScrollChatTabsLeft.value = false;
		canScrollChatTabsRight.value = false;
		return;
	}

	const maxScrollLeft = Math.max(0, tabs.scrollWidth - tabs.clientWidth);
	const hasOverflow = maxScrollLeft > 1;
	showChatTabsScrollControls.value = hasOverflow;
	canScrollChatTabsLeft.value = hasOverflow && tabs.scrollLeft > 1;
	canScrollChatTabsRight.value = hasOverflow && tabs.scrollLeft < maxScrollLeft - 1;
}

function scrollChatTabs(direction: 'left' | 'right') {
	const tabs = localTabsEl.value;
	if (tabs == null) return;

	const distance = Math.max(CHAT_TABS_SCROLL_MIN_DISTANCE, tabs.clientWidth * CHAT_TABS_SCROLL_VISIBLE_RATIO);
	tabs.scrollBy({
		left: direction === 'left' ? -distance : distance,
		behavior: 'smooth',
	});
	window.requestAnimationFrame(updateChatTabsScrollState);
}

function ensureSelectedChatTabVisible(behavior: ScrollBehavior = 'smooth') {
	void nextTick(() => {
		const tabs = localTabsEl.value;
		const selectedTab = tabs?.querySelector<HTMLElement>(`[data-chat-room-tab-key="${CSS.escape(tab.value)}"]`);
		selectedTab?.scrollIntoView({
			behavior,
			block: 'nearest',
			inline: 'nearest',
		});
		window.requestAnimationFrame(updateChatTabsScrollState);
	});
}

function recoverLatestAfterMobileResume() {
	if (window.document.hidden) return;
	readReceiptBatcher.flush();
	scheduleStickToLatestAfterMutation();
	startStreamRecoveryPolling(STREAM_RECOVERY_ERROR_RETRY_MS);
	scheduleStreamRecovery('visible', { force: true, reconcileLatestWindow: true });
}

function onVisibilitychange() {
	recoverLatestAfterMobileResume();
}

function onWindowFocus() {
	recoverLatestAfterMobileResume();
}

function onPageShow() {
	recoverLatestAfterMobileResume();
}

function onVisualViewportChange() {
	scheduleStickToLatestAfterMutation();
}

onMounted(() => {
	isRoomViewDisposed = false;
	window.document.addEventListener('visibilitychange', onVisibilitychange);
	window.addEventListener('focus', onWindowFocus);
	window.addEventListener('pageshow', onPageShow);
	window.addEventListener('resize', updateChatTabsScrollState);
	window.visualViewport?.addEventListener('resize', onVisualViewportChange);
	window.visualViewport?.addEventListener('scroll', onVisualViewportChange);
	useStream().on('_connected_', onStreamConnected);
	useStream().on('_disconnected_', onStreamDisconnected);
	startStreamRecoveryPolling(STREAM_RECOVERY_ERROR_RETRY_MS);
	watch(timelineEl, () => nextTick(setupTimelineScrollListener), { immediate: true });
	watch(headerTabs, () => {
		showChatTabsScrollControls.value = false;
		ensureSelectedChatTabVisible('instant');
	}, { immediate: true });
	watch(tab, () => ensureSelectedChatTabVisible());
	watch(() => props.messageId, (to, from) => {
		if (to !== from) {
			if (suppressNextMessageIdClearInitialize && to == null) {
				suppressNextMessageIdClearInitialize = false;
				return;
			}

			if (to != null) {
				openMessageContext(to);
			} else {
				initialize();
			}
		}
	});
	initialize();
});

onBeforeUnmount(() => {
	isRoomViewDisposed = true;
	readReceiptBatcher.flush({ force: true });
	connection.value?.dispose();
	useStream().off('_connected_', onStreamConnected);
	useStream().off('_disconnected_', onStreamDisconnected);
	removeTimelineScrollListener?.();
	timelineResizeObserver?.disconnect();
	chatPaneResizeObserver?.disconnect();
	footerResizeObserver?.disconnect();
	clearStreamRecoveryTimer();
	clearStreamRecoveryPollingTimer();
	streamRecoverySinceId = undefined;
	clearIncomingMessageQueue();
	if (pendingStickToLatestFrame != null) {
		window.cancelAnimationFrame(pendingStickToLatestFrame);
		pendingStickToLatestFrame = null;
	}
	clearLateInitialRescrollTimers();
	clearLatestEdgeInitialLock();
	if (pendingUserRefreshTimer != null) {
		window.clearTimeout(pendingUserRefreshTimer);
		pendingUserRefreshTimer = null;
	}
	usersRefreshQueue.clear();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
	window.removeEventListener('focus', onWindowFocus);
	window.removeEventListener('pageshow', onPageShow);
	window.removeEventListener('resize', updateChatTabsScrollState);
	window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
	window.visualViewport?.removeEventListener('scroll', onVisualViewportChange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	await os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
	// 邀请成功后刷新成员页的「已发送邀请」列表，否则刚邀请的人看不到。
	membersRefreshKey.value++;
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	misskeyApi('chat/rooms/leave', {
		roomId: room.value.id,
	});
	router.push('/chat');
}

function onRoomUpdated(updated: Misskey.entities.ChatRoom) {
	room.value = updated;
	rememberUser(updated.owner);
}

async function muteUserInRoom(user: Misskey.entities.UserLite) {
	if (room.value == null || user.id === $i.id || mutedRoomUserIds.value.has(user.id)) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._chat.muteUserInRoomConfirm,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/user-mutes/create', {
		roomId: room.value.id,
		userId: user.id,
	});
	mutedRoomUserIds.value = new Set([...mutedRoomUserIds.value, user.id]);
	messages.value = filterMutedNormalizedMessages(messages.value);
	pendingIncomingMessages = filterMutedRoomMessages(pendingIncomingMessages);
	detachedIncomingMessages = filterMutedRoomMessages(detachedIncomingMessages);
	mutedUsersRefreshKey.value++;
}

function onRoomUserUnmuted(userId: string) {
	if (!mutedRoomUserIds.value.has(userId)) return;
	const next = new Set(mutedRoomUserIds.value);
	next.delete(userId);
	mutedRoomUserIds.value = next;
}

async function ensureLatestOnChatTabReturn(generation: number, options: { forceLatest?: boolean } = {}) {
	await nextTick();
	await waitAnimationFrame();

	if (generation !== chatTabLatestReturnGeneration || tab.value !== 'chat' || initializing.value || initializeError.value != null || joinRequiredRoom.value != null) return;

	const sinceId = findNewestPersistedMessageId();
	const shouldStickToLatest = options.forceLatest === true || shouldAutoRevealLatestMessages();
	try {
		await syncLatestMessages({ stickToLatest: shouldStickToLatest, flushReadReceipt: shouldStickToLatest, sinceId, reconcileLatestWindow: shouldStickToLatest });
	} catch (err) {
		if (!isAbortError(err)) {
			console.warn('Failed to refresh latest chat messages after returning to chat tab:', err);
		}
	}

	await nextTick();
	await waitAnimationFrame();

	if (generation !== chatTabLatestReturnGeneration || tab.value !== 'chat' || initializing.value || initializeError.value != null || joinRequiredRoom.value != null) return;

	if (shouldStickToLatest) {
		await scrollToLatestAfterLayout({ flushReadReceipt: true, fillHistory: true });
	}
}

function scheduleLatestOnChatTabReturn(options: { forceLatest?: boolean } = {}) {
	chatTabLatestReturnGeneration++;
	void ensureLatestOnChatTabReturn(chatTabLatestReturnGeneration, options);
}

function selectTab(key: string) {
	const previousTab = tab.value;
	tab.value = key;

	if (key !== 'chat') return;

	if (isContextMode.value) {
		void exitContextToLatest();
		return;
	}

	if (previousTab !== 'chat') {
		scheduleLatestOnChatTabReturn({ forceLatest: true });
	}
}

const headerTabs = computed(() => room.value ? room.value.isJoined ? [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-messages',
}, {
	key: 'members',
	title: i18n.ts._chat.members,
	icon: 'ti ti-users',
}, {
	key: 'mutedUsers',
	title: i18n.ts._chat.mutedUsers,
	icon: 'ti ti-eye-off',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}, ...(canManageRoomUsers.value ? [{
	key: 'management',
	title: i18n.ts._chat.management,
	icon: 'ti ti-shield-cog',
}] : []), {
	key: 'announcements',
	title: i18n.ts._chat.announcementHistory,
	icon: 'ti ti-speakerphone',
}] : [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-messages',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}, {
	key: 'announcements',
	title: i18n.ts._chat.announcementHistory,
	icon: 'ti ti-speakerphone',
}] : [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-messages',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const headerActions = computed<PageHeaderItem[]>(() => {
	if (room.value == null) return [];

	return [{
		icon: 'ti ti-refresh',
		text: i18n.ts.reload,
		handler: () => {
			void initialize();
		},
	}];
});
definePage(computed(() => {
	if (!initializing.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
				needWideArea: true,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
				needWideArea: true,
			};
		} else {
			return {
				title: i18n.ts.chat,
				needWideArea: true,
			};
		}
	} else {
		return {
			title: i18n.ts.chat,
			needWideArea: true,
		};
	}
}));
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	--chat-room-surface: light-dark(#d8e6ee, #0e1621);
	--chat-room-border: light-dark(rgb(198 213 222), rgb(31 43 55));
	--chat-room-footer-cover: light-dark(rgb(216 230 238 / 0.98), rgb(14 22 33 / 0.98));
	--chat-room-footer-shadow: light-dark(rgb(137 164 180 / 0.52), rgb(0 0 0 / 0.44));
	--chat-room-footer-overlap: 18px;

	position: relative;
	container-type: inline-size;
	height: 100%;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px) + var(--MI-visualViewportBottom, 0px)));
	overflow: hidden;
	display: grid;
	grid-template-rows: auto minmax(0, 1fr) auto;
	background: var(--MI_THEME-bg);
}

.header {
	position: relative;
	z-index: 1000;
}

/* 固定在「聊天」页签顶部（标签栏下、消息滚动区上），不随消息列表滚走 */
.chatColumn {
	min-height: 0;
	height: 100%;
	width: 100%;
	max-width: 100%;
	display: flex;
	flex-direction: column;
	overflow: hidden;
	background:
		radial-gradient(circle at 20px 20px, light-dark(rgb(0 0 0 / 0.035), rgb(255 255 255 / 0.035)) 1px, transparent 1px),
		var(--chat-room-surface);
	background-size: 22px 22px, auto;
	border-inline: solid 1px var(--chat-room-border);
}

.announcement {
	--announcement-surface: color-mix(in srgb, var(--MI_THEME-panel) 94%, var(--MI_THEME-bg));

	flex: 0 0 auto;
	position: relative;
	z-index: 900;
	display: grid;
	gap: 0;
	width: calc(100% - 24px);
	margin: 8px 12px 0;
	padding: 0;
	border-radius: var(--MI-radius-sm);
	background: var(--announcement-surface);
	color: var(--MI_THEME-fg);
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 84%, transparent);
	box-shadow: 0 8px 18px -14px var(--MI_THEME-shadow);
	overflow: hidden;
	transition: background-color 0.15s ease, border-color 0.15s ease;

	&:hover {
		background: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-accent));
		border-color: color-mix(in srgb, var(--MI_THEME-divider) 70%, var(--MI_THEME-accent));
		--announcement-surface: color-mix(in srgb, var(--MI_THEME-panel) 88%, var(--MI_THEME-accent));
	}
}

.announcementIsExpanded {
	padding-bottom: 0;
}

.announcementMainButton {
	display: block;
	width: 100%;
	padding: 8px 12px 10px;
	text-align: left;
	color: inherit;
	background: transparent;
	border: none;
	cursor: pointer;

	&:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--MI_THEME-accent) 55%, transparent);
		outline-offset: -2px;
	}
}

.announcementDismiss {
	justify-self: end;
	margin: 0 10px 8px;
	padding: 3px 8px;
	font-size: 0.75em;
	font-weight: 700;
	line-height: 1.2;
	color: color-mix(in srgb, var(--MI_THEME-fg) 72%, var(--MI_THEME-warn));
	border-radius: 6px;
	border: solid 1px color-mix(in srgb, var(--MI_THEME-divider) 70%, var(--MI_THEME-warn));
	background: color-mix(in srgb, var(--MI_THEME-panel) 80%, transparent);
	cursor: pointer;
	transition: color 0.15s ease, background-color 0.15s ease, border-color 0.15s ease;

	&:hover {
		color: var(--MI_THEME-warn);
		border-color: color-mix(in srgb, var(--MI_THEME-warn) 45%, var(--MI_THEME-divider));
		background: color-mix(in srgb, var(--MI_THEME-warn) 12%, var(--MI_THEME-panel));
	}
}

.announcementBody {
	display: grid;
	gap: 6px;
	min-width: 0;
	width: 100%;
}

.announcementHeading {
	display: flex;
	align-items: center;
	gap: 6px;
	min-width: 0;
}

.announcementIcon {
	flex: 0 0 auto;
	font-size: 0.95em;
	color: var(--MI_THEME-accent);
}

.announcementTitle {
	flex: 1 1 auto;
	min-width: 0;
	font-size: 0.78em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
	opacity: 0.92;
}

/* 收起：完整 1 行 + 半行被遮住的文字；省略号贴在正文裁切区右下角 */
.announcementPreviewBlock {
	position: relative;
	width: 100%;
	min-width: 0;
	/* 一整行 + 约半行 */
	max-height: calc(1.45em * 1.55);
	overflow: hidden;
}

.announcementPreview {
	width: 100%;
	min-width: 0;
	font-size: 0.9em;
	line-height: 1.45;
	color: var(--MI_THEME-fg);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	word-break: break-word;
}

/* 底部遮罩条：盖住第二行下半，并把 ··· 固定在右下角正文里 */
.announcementFade {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 0;
	z-index: 1;
	display: flex;
	align-items: flex-end;
	justify-content: flex-end;
	height: 1.25em;
	padding: 0 2px 0 1.25em;
	background: linear-gradient(
		to bottom,
		color-mix(in srgb, var(--announcement-surface) 0%, transparent) 0%,
		color-mix(in srgb, var(--announcement-surface) 72%, transparent) 42%,
		var(--announcement-surface) 100%
	);
	pointer-events: none;
}

.announcementEllipsis {
	display: inline-block;
	margin-left: 0.35em;
	padding: 0 0.12em;
	font-size: 1.55em;
	font-weight: 900;
	line-height: 0.85;
	letter-spacing: 0.12em;
	color: var(--MI_THEME-fg);
	opacity: 0.95;
	text-shadow:
		0 0 0.5px currentColor,
		0 0 0.5px currentColor;
	user-select: none;
}

.announcement:hover .announcementEllipsis {
	color: var(--MI_THEME-accent);
	opacity: 1;
}

.announcementText {
	color: var(--MI_THEME-fg);
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-size: 0.88em;
	line-height: 1.35;
	display: -webkit-box;
	-webkit-box-orient: vertical;
	-webkit-line-clamp: 1;
	line-clamp: 1;
	overflow: hidden;
}

.announcementTextExpanded {
	display: block;
	-webkit-line-clamp: unset;
	line-clamp: unset;
	line-height: 1.55;
	overflow: visible;
	margin-top: 2px;
	padding-left: 1.35em;
}

.announcementToggle {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 2px;
	flex: 0 0 auto;
	margin-left: auto;
	padding: 2px 4px;
	color: color-mix(in srgb, var(--MI_THEME-fg) 62%, var(--MI_THEME-accent));
	font-size: 0.78em;
	line-height: 1;
	border-radius: 6px;
	background: transparent;
	border: none;
	transition: color 0.15s ease, background-color 0.15s ease;

	> .ti {
		font-size: 1.05em;
	}
}

.announcement:hover .announcementToggle {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
}

.announcementToggleLabel {
	font-weight: 600;
	letter-spacing: 0.02em;
}

.localHeader {
	--chat-room-header-bg: color(from var(--MI_THEME-pageHeaderBg) srgb r g b / 0.92);
	--chat-room-header-fg: var(--MI_THEME-pageHeaderFg);

	position: relative;
	z-index: 1000;
	display: grid;
	grid-template-columns: minmax(120px, auto) minmax(0, 1fr) auto;
	grid-template-areas: "title tabs menu";
	align-items: center;
	gap: 0 8px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	padding: 0 14px;
	box-sizing: border-box;
	background: var(--chat-room-header-bg);
	border-bottom: solid 1px var(--MI_THEME-divider);
	color: var(--chat-room-header-fg);
}

:global(html[data-color-scheme=dark]) {
	.localHeader {
		--chat-room-header-bg: color-mix(in srgb, var(--MI_THEME-bg) 94%, #000);
		--chat-room-header-fg: var(--MI_THEME-fg);

		color: var(--chat-room-header-fg);
	}
}

.localTitle {
	display: inline-flex;
	align-items: center;
	grid-area: title;
	gap: 8px;
	min-width: 0;
	min-height: 52px;
	font-weight: 700;
	color: var(--chat-room-header-fg);

	> span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.localTitleAvatar {
	width: 24px;
	height: 24px;
}

.localTabsShell {
	grid-area: tabs;
	position: relative;
	display: grid;
	grid-template-columns: minmax(0, 1fr);
	align-items: stretch;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	border-top: none;
}

.localTabsShellScrollable {
	grid-template-columns: 32px minmax(0, 1fr) 32px;
	gap: 4px;
}

.localTabs {
	display: flex;
	align-items: stretch;
	gap: 2px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	overflow-x: auto;
	overscroll-behavior-x: contain;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.localTabsScrollButton {
	position: relative;
	z-index: 1;
	align-self: center;
	display: grid;
	place-items: center;
	width: 32px;
	height: 36px;
	color: var(--chat-room-header-fg);
	background: color-mix(in srgb, var(--chat-room-header-bg) 88%, transparent);
	border-radius: var(--MI-radius-sm);
	box-shadow: 0 0 12px color-mix(in srgb, var(--MI_THEME-shadow) 35%, transparent);

	&:hover:not(:disabled) {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:disabled {
		opacity: 0.35;
		cursor: default;
	}
}

.localTabsScrollButtonLeft {
	justify-self: start;
}

.localTabsScrollButtonRight {
	justify-self: end;
}

.localTab {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 52px;
	padding: 0 14px;
	color: color-mix(in srgb, var(--chat-room-header-fg) 76%, transparent);
	white-space: nowrap;
	border-bottom: solid 3px transparent;
	box-sizing: border-box;

	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.localTabActive {
	color: var(--MI_THEME-accent);
	background: color-mix(in srgb, var(--MI_THEME-accent) 10%, transparent);
	border-bottom-color: var(--MI_THEME-accent);
}

.localMenu {
	display: grid;
	grid-area: menu;
	place-items: center;
	width: 38px;
	height: 38px;
	color: var(--chat-room-header-fg);
	border-radius: 999px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

@container (max-width: 520px) {
	.localHeader {
		grid-template-columns: minmax(0, 1fr) auto;
		grid-template-areas:
			"title menu"
			"tabs tabs";
		padding: 0 12px 2px;
	}

	.localTabsShell {
		border-top: solid 1px color-mix(in srgb, var(--chat-room-header-fg) 10%, transparent);
	}

	.localTitle {
		min-height: 40px;
	}

	.localTab {
		min-height: 40px;
		padding: 0 10px;
	}
}

.timeline {
	display: grid;
	gap: 8px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
}

.messageList {
	display: grid;
	gap: 6px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	overflow: clip;
}

@keyframes chatItemEnter {
	from { opacity: 0; transform: translateY(8px); }
	to { opacity: 1; transform: none; }
}

.messageItem {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
	/* 不使用 content-visibility。移动端 WebKit 快速滑动时会用估算高度参与滚动，
	 * 图片/引用晚加载后容易出现消息错位或短暂不可见。 */
}

/* 新到消息出场动画:标了 data-fresh=true 的 item 演 220ms */
.messageItem[data-fresh="true"] {
	animation: chatItemEnter 220ms ease-out;
}

.contextTarget {
	border-radius: 22px;
	animation: contextTargetPulse 2.2s ease-out 1;
}

.more {
	min-height: 44px;
	display: grid;
	place-items: center;
}

.chatPane {
	flex: 1 1 auto;
	height: auto;
	min-height: 0;
	width: 100%;
	max-width: 100%;
	margin: 0 auto;
	padding: 14px 18px calc(14px + var(--chat-room-footer-overlap));
	box-sizing: border-box;
	overflow-x: hidden;
	overflow-y: scroll;
	overflow-anchor: none;
	overscroll-behavior: contain;
	-webkit-overflow-scrolling: touch;
	touch-action: pan-y;
	scrollbar-gutter: stable;
	display: flex;
	flex-direction: column;
	/* 背景改由 .chatColumn 承担，避免与置顶条割裂 */
	background: transparent;
	border-inline: none;
}

.chatPane > :global(._gaps) {
	width: 100%;
	min-height: 100%;
	flex: 0 0 auto;
	display: flex;
	flex-direction: column;
}

.chatPane > :global(._gaps) > :first-child {
	margin-top: auto;
}

.searchPane {
	height: 100%;
	width: 100%;
	max-width: 100%;
	min-height: 0;
	max-height: 100%;
	overflow: hidden;
	display: flex;
	flex-direction: column;
	touch-action: pan-y;
	overscroll-behavior: contain;
}

.searchPane > * {
	flex: 1 1 auto;
	min-height: 0;
	max-height: 100%;
	width: 100%;
}

.tabPane {
	height: 100%;
	width: 100%;
	max-width: 100%;
	min-height: 0;
	max-height: 100%;
	display: flex;
	flex-direction: column;
	overflow-x: hidden;
	overflow-y: hidden;
	touch-action: pan-y;
	overscroll-behavior: contain;
	box-sizing: border-box;
	background: var(--MI_THEME-bg);
}

.tabPaneInner {
	flex: 1 1 auto;
	width: 100%;
	max-width: 100%;
	height: 100%;
	min-height: 0;
	max-height: 100%;
	overflow-x: hidden;
	overflow-y: auto;
	-webkit-overflow-scrolling: touch;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
	box-sizing: border-box;
}

.error {
	align-items: center;
	justify-content: center;
	padding: 32px 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.errorIcon {
	font-size: 28px;
	color: var(--MI_THEME-warn);
}

.errorActions {
	display: flex;
	gap: 8px;
	justify-content: center;
	flex-wrap: wrap;
}

.joinRequired {
	align-items: center;
	justify-content: center;
	padding: 32px 16px;
	text-align: center;
}

.joinRequiredIcon {
	font-size: 32px;
	color: var(--MI_THEME-accent);
}

.joinRequiredTitle {
	font-weight: 700;
	font-size: 1.2em;
}

.joinRequiredMeta {
	display: flex;
	gap: 8px 16px;
	justify-content: center;
	flex-wrap: wrap;
	color: var(--MI_THEME-fgTransparentWeak);
}

.footer {
	position: relative;
	z-index: 3;
	width: 100%;
	max-width: 100%;
	padding: 6px 12px max(8px, env(safe-area-inset-bottom));
	box-sizing: border-box;
	background: var(--chat-room-surface);
	border-top: none;
	box-shadow: 0 -12px 20px -18px var(--chat-room-footer-shadow);
}

.footer::before {
	content: "";
	position: absolute;
	inset: calc(-1 * var(--chat-room-footer-overlap)) 0 auto;
	height: var(--chat-room-footer-overlap);
	pointer-events: none;
	background: linear-gradient(to bottom, transparent, var(--chat-room-footer-cover));
}

.footer > :global(._gaps) {
	position: relative;
	z-index: 1;
}

.new {
	width: 100%;
	padding-bottom: 6px;
	text-align: center;
}

.newButton {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	margin: 0;
	padding: 0 12px;
	line-height: 28px;
	font-size: 12px;
	border-radius: 16px;
}

.newIcon {
	display: inline-block;
}

.toLatestButton {
	position: absolute;
	right: max(18px, env(safe-area-inset-right));
	bottom: calc(72px + env(safe-area-inset-bottom));
	z-index: 5;
	display: grid;
	place-items: center;
	width: 42px;
	height: 42px;
	padding: 0;
	border-radius: 999px;
	box-shadow: 0 6px 18px rgb(0 0 0 / 0.22);

	> i {
		font-size: 18px;
	}
}

.footer {

}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 100%;
}

.fade-enter-active, .fade-leave-active {
	transition: opacity 0.1s;
}

.fade-enter-from, .fade-leave-to {
	transition: opacity 0.5s;
	opacity: 0;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: none;
	border-radius: 999px;
	width: fit-content;
	padding: 0.45em 0.9em;
	margin: 0 auto;
	background: light-dark(rgb(255 255 255 / 0.72), rgb(31 45 58 / 0.82));
	box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
}

@keyframes contextTargetPulse {
	0% {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.28);
		box-shadow: 0 0 0 5px color(from var(--MI_THEME-accent) srgb r g b / 0.18);
	}

	100% {
		background: transparent;
		box-shadow: 0 0 0 0 color(from var(--MI_THEME-accent) srgb r g b / 0);
	}
}
</style>
