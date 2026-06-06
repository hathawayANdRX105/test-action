<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div ref="rootEl" :class="$style.root">
	<div :class="$style.localHeader" data-chat-room-header data-chat-room-tabs>
		<div :class="$style.localTitle">
			<i v-if="room" class="ti ti-users"></i>
			<MkAvatar v-else-if="user" :user="user" :class="$style.localTitleAvatar" indicator/>
			<span>{{ room?.name ?? user?.name ?? user?.username ?? i18n.ts.chat }}</span>
		</div>
		<div :class="[$style.localTabsShell, { [$style.localTabsShellScrollable]: showChatTabsScrollControls }]">
			<button v-if="showChatTabsScrollControls" class="_button" :class="[$style.localTabsScrollButton, $style.localTabsScrollButtonLeft]" :disabled="!canScrollChatTabsLeft" :aria-label="i18n.ts.left" @click="scrollChatTabs('left')">
				<i class="ti ti-chevron-left"></i>
			</button>
			<div ref="localTabsEl" :class="$style.localTabs" @scroll="updateChatTabsScrollState">
				<button v-for="t in headerTabs" :key="t.key" class="_button" :class="[$style.localTab, { [$style.localTabActive]: tab === t.key }]" :data-chat-room-tab-key="t.key" @click="selectTab(t.key)">
					<i :class="t.icon"></i>
					<span>{{ t.title }}</span>
				</button>
			</div>
			<button v-if="showChatTabsScrollControls" class="_button" :class="[$style.localTabsScrollButton, $style.localTabsScrollButtonRight]" :disabled="!canScrollChatTabsRight" :aria-label="i18n.ts.right" @click="scrollChatTabs('right')">
				<i class="ti ti-chevron-right"></i>
			</button>
		</div>
		<button v-if="headerActions.length > 0" class="_button" :class="$style.localMenu" @click="headerActions[0].handler">
			<i :class="headerActions[0].icon"></i>
		</button>
	</div>
	<div v-show="tab === 'chat'" ref="chatPaneEl" :class="$style.chatPane">
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

			<div v-if="isContextMode" :class="$style.contextModeBar">
				<div :class="$style.contextModeText"><i class="ti ti-search"></i>{{ i18n.ts.searchResult }}</div>
				<button class="_buttonPrimary" :class="$style.contextModeButton" @click="exitContextToLatest">{{ i18n.ts._chat.newMessage }}</button>
			</div>

			<div v-if="messages.length > 0" ref="timelineEl" :class="$style.timeline">
				<div v-if="canFetchMore || moreFetching" :class="$style.more">
					<MkLoading v-if="moreFetching" :mini="true"/>
				</div>

				<SkTransitionGroup
					:enterActiveClass="$style.transition_x_enterActive"
					:leaveActiveClass="$style.transition_x_leaveActive"
					:enterFromClass="$style.transition_x_enterFrom"
					:leaveToClass="$style.transition_x_leaveTo"
					:moveClass="$style.transition_x_move"
					:animate="!isRestoringHistoryScroll && !isRoomChat"
					tag="div" :class="$style.messageList"
				>
					<div v-for="item in timeline.toReversed()" :key="item.id" :class="[$style.messageItem, { [$style.contextTarget]: item.type === 'item' && item.id === contextTargetMessageId }]" :data-scroll-anchor="item.type === 'item' ? item.id : undefined">
						<XMessage v-if="item.type === 'item'" :message="item.data" :enableReferenceActions="true" :canDeleteAnyMessage="canDeleteAnyMessage" :canManageRoomUsers="canManageRoomUsers" @reply="setReplyTarget(item.data)" @quote="setQuoteTarget(item.data)" @mention="mentionUser" @openReference="openReferenceMessage" @deletedMany="onDeletedMany"/>
						<div v-else-if="item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up"></i> {{ item.nextText }}</span>
							<span style="height: 1em; width: 1px; background: var(--MI_THEME-divider);"></span>
							<span>{{ item.prevText }} <i class="ti ti-chevron-down"></i></span>
						</div>
					</div>
				</SkTransitionGroup>

				<div v-if="canFetchNewer || newerFetching" :class="$style.more">
					<MkLoading v-if="newerFetching" :mini="true"/>
				</div>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<Transition name="fade">
		<button v-show="tab === 'chat' && showScrollToLatestButton && !showIndicator" class="_buttonPrimary" :class="$style.toLatestButton" :title="i18n.ts.bottom" @click="onIndicatorClick">
			<i class="ti ti-arrow-down"></i>
		</button>
	</Transition>

	<div v-if="tab === 'search'" :class="$style.searchPane">
		<XSearch :userId="userId" :roomId="roomId" :user="user" :room="room" @openContext="openMessageContext"/>
	</div>

	<div v-if="tab === 'members'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 700px;">
			<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
		</div>
	</div>

	<div v-if="tab === 'info'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 700px;">
			<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated"/>
		</div>
	</div>

	<div v-if="tab === 'management'" :class="$style.tabPane">
		<div class="_spacer" :class="$style.tabPaneInner" style="--MI_SPACER-w: 700px;">
			<XManagement v-if="room != null && room.canManage" :room="room" @updated="onRoomUpdated" @cleared="onCleared"/>
		</div>
	</div>

	<div v-if="tab === 'chat'" :class="$style.footer">
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
import XForm from './room.form.vue';
import XSearch from './room.search.vue';
import XMembers from './room.members.vue';
import XInfo from './room.info.vue';
import XManagement from './room.management.vue';
import type { MenuItem } from '@/types/menu.js';
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
import SkTransitionGroup from '@/components/SkTransitionGroup.vue';
import { ChatAutoScrollState, ChatReadReceiptBatcher, getChatScrollMetrics, isChatMessageVisibleAtLatestEdge, mergeChatMessagesForTimeline, prependChatMessageForTimeline } from './room-scroll.js';
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
const formEl = ref<InstanceType<typeof XForm> | null>(null);
const timeline = makeDateSeparatedTimelineComputedRef(messages);
const contextTargetMessageId = ref<string | null>(null);
const pendingContextScrollId = ref<string | null>(null);
const usersById = ref(new Map<string, Misskey.entities.UserLite>());
const usersRefreshingById = new Set<string>();
const usersRefreshFailedById = new Set<string>();
const usersRefreshQueue = new Map<string, Misskey.entities.UserLite>();
const showScrollToLatestButton = ref(false);
const showChatTabsScrollControls = ref(false);
const canScrollChatTabsLeft = ref(false);
const canScrollChatTabsRight = ref(false);

const SCROLL_LATEST_THRESHOLD = 24;
const SCROLL_AUTO_STICK_THRESHOLD = 4;
const SCROLL_HISTORY_THRESHOLD = 480;
const SCROLL_TAIL_THRESHOLD = 480;
const USER_SCROLL_INTERACTION_LOCK_MS = 1200;
const TIMELINE_LIMIT = 20;
const CONTEXT_LIMIT = 30;
const INITIAL_HISTORY_FILL_LIMIT = 6;
const MAX_ROOM_MESSAGES = 500;
const STREAM_CONNECT_TIMEOUT = 5000;
const CHAT_READ_RECEIPT_MIN_INTERVAL_MS = 2000;
const CHAT_USER_REFRESH_BATCH_SIZE = 20;
const CHAT_USER_REFRESH_DELAY_MS = 250;
const CHAT_TABS_SCROLL_MIN_DISTANCE = 160;
const CHAT_TABS_SCROLL_VISIBLE_RATIO = 0.7;
const autoScrollState = new ChatAutoScrollState({
	latestThreshold: SCROLL_LATEST_THRESHOLD,
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
let pendingStickToLatestFrame: number | null = null;
let pendingIncomingMessageFrame: number | null = null;
let pendingIncomingMessages: Misskey.entities.ChatMessageLite[] = [];
let pendingUserRefreshTimer: number | null = null;
let historyFetchArmed = true;
let newerFetchArmed = true;
let scrollRestorationDepth = 0;
let suppressNextMessageIdClearInitialize = false;
let chatTabLatestReturnGeneration = 0;
const isRestoringHistoryScroll = ref(false);
const isRoomChat = computed(() => props.roomId != null);
const isContextMode = computed(() => contextTargetMessageId.value != null);
const canDeleteAnyMessage = computed(() => {
	if (room.value != null) return room.value.canManage === true;
	return $i.isAdmin || $i.isModerator;
});
const canManageRoomUsers = computed(() => room.value?.canManage === true);

type ScrollAnchor = {
	id: string;
	offset: number;
};

function beginScrollRestoration() {
	scrollRestorationDepth++;
	isRestoringHistoryScroll.value = true;
}

function endScrollRestoration() {
	scrollRestorationDepth = Math.max(0, scrollRestorationDepth - 1);
	isRestoringHistoryScroll.value = scrollRestorationDepth > 0;
}

function isAtLatest() {
	if (timelineEl.value == null) return true;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return true;

	const { latestDistance } = getChatScrollMetrics(scrollContainer);
	if (latestDistance <= SCROLL_LATEST_THRESHOLD) {
		autoScrollState.updateFromScroll(latestDistance);
		return true;
	}

	return autoScrollState.canAutoFollowLatest(latestDistance);
}

function clearNewMessageIndicator() {
	if (!showIndicator.value && newMessageCount.value === 0) return;

	showIndicator.value = false;
	newMessageCount.value = 0;
}

function scrollToLatest(behavior: ScrollBehavior = 'smooth', options?: { flushReadReceipt?: boolean }) {
	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	autoScrollState.markLatest();
	const scrollTop = scrollContainer == null ? 0 : getChatScrollMetrics(scrollContainer).maxScrollTop;
	scrollContainer?.scrollTo({
		top: scrollTop,
		behavior,
	});
	clearNewMessageIndicator();
	showScrollToLatestButton.value = false;
	if (options?.flushReadReceipt === true) {
		readReceiptBatcher.flush();
	}
	newerFetchArmed = false;
	historyFetchArmed = true;
}

function setupTimelineScrollListener() {
	removeTimelineScrollListener?.();
	removeTimelineScrollListener = null;

	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return;

	const markUserScrollInteraction = () => {
		autoScrollState.markUserInteraction();
	};

	const onScroll = () => {
		const { latestDistance, historyDistance } = getChatScrollMetrics(scrollContainer);
		autoScrollState.updateFromScroll(latestDistance);
		showScrollToLatestButton.value = latestDistance > SCROLL_TAIL_THRESHOLD;
		if (historyDistance >= SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = true;
		}

		if (!isRestoringHistoryScroll.value && canFetchMore.value && !moreFetching.value && messages.value.length > 0 && historyFetchArmed && historyDistance < SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = false;
			fetchMore();
		}

		if (latestDistance <= SCROLL_LATEST_THRESHOLD) {
			clearNewMessageIndicator();
		}

		if (latestDistance >= SCROLL_TAIL_THRESHOLD) {
			newerFetchArmed = true;
		}

		if (!isRestoringHistoryScroll.value && canFetchNewer.value && !newerFetching.value && messages.value.length > 0 && newerFetchArmed && latestDistance < SCROLL_TAIL_THRESHOLD) {
			newerFetchArmed = false;
			fetchNewer();
		}
	};

	scrollContainer.addEventListener('scroll', onScroll, { passive: true });
	scrollContainer.addEventListener('touchstart', markUserScrollInteraction, { passive: true });
	scrollContainer.addEventListener('touchmove', markUserScrollInteraction, { passive: true });
	scrollContainer.addEventListener('pointerdown', markUserScrollInteraction, { passive: true });
	scrollContainer.addEventListener('pointermove', markUserScrollInteraction, { passive: true });
	scrollContainer.addEventListener('wheel', markUserScrollInteraction, { passive: true });
	removeTimelineScrollListener = () => {
		scrollContainer.removeEventListener('scroll', onScroll);
		scrollContainer.removeEventListener('touchstart', markUserScrollInteraction);
		scrollContainer.removeEventListener('touchmove', markUserScrollInteraction);
		scrollContainer.removeEventListener('pointerdown', markUserScrollInteraction);
		scrollContainer.removeEventListener('pointermove', markUserScrollInteraction);
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

function isMessageVisibleAtLatestEdge(messageId: string): boolean {
	if (timelineEl.value == null) return false;

	const scrollContainer = getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return true;

	const element = timelineEl.value.querySelector<HTMLElement>(`[data-scroll-anchor="${CSS.escape(messageId)}"]`);
	if (element == null) return false;

	return isChatMessageVisibleAtLatestEdge(
		scrollContainer.getBoundingClientRect(),
		element.getBoundingClientRect(),
		SCROLL_LATEST_THRESHOLD,
	);
}

function waitAnimationFrame() {
	return new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
}

async function restoreVisibleMessageAnchorAfterLayout(anchor: ScrollAnchor | null) {
	if (anchor == null) return;

	let stableFrames = 0;
	for (let i = 0; i < 8; i++) {
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
	if (isRestoringHistoryScroll.value || isContextMode.value) return;
	if (pendingStickToLatestFrame != null) return;

	pendingStickToLatestFrame = window.requestAnimationFrame(() => {
		pendingStickToLatestFrame = null;
		if (isRestoringHistoryScroll.value || isContextMode.value) return;

		const scrollContainer = getScrollContainer(timelineEl.value);
		if (scrollContainer == null) return;

		const metrics = getChatScrollMetrics(scrollContainer);
		if (autoScrollState.shouldStickToLatest(metrics.latestDistance, SCROLL_AUTO_STICK_THRESHOLD)) {
			scrollContainer.scrollTo({
				top: metrics.maxScrollTop,
				behavior: 'instant',
			});
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
	return isRoomChat.value && !isContextMode.value ? MAX_ROOM_MESSAGES : undefined;
}

function mergeMessages(...sources: NormalizedChatMessage[][]): NormalizedChatMessage[] {
	if (sources.length === 0) return [];
	if (sources.length === 1) return mergeChatMessagesForTimeline([], sources[0], { limit: messageLimit() });
	return mergeChatMessagesForTimeline(sources[0], sources[1], { limit: messageLimit() });
}

function prependMessage(message: NormalizedChatMessage) {
	messages.value = prependChatMessageForTimeline(messages.value, message, { limit: messageLimit() });
}

function appendFetchedMessages(fetched: Misskey.entities.ChatMessageLite[]) {
	messages.value = mergeMessages(messages.value, fetched.map(x => normalizeMessage(x)));
}

function replaceMessages(fetched: (Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage)[]) {
	messages.value = mergeMessages(fetched.map(x => normalizeMessage(x)));
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
	prependMessage(message);
	nextTick(() => scrollToLatest('instant'));
}

function onSentMessage(message: Misskey.entities.ChatMessageLite, clientId?: string) {
	if (clientId != null) {
		removePendingMessage(clientId);
	}

	const normalized = normalizeMessage(message);
	removeMatchingPendingMessage(normalized);
	prependMessage(normalized);
	replyTarget.value = null;
	quoteTarget.value = null;
	nextTick(() => scrollToLatest('instant'));
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

	const waitConnected = (channel as { waitConnected?: () => Promise<void> }).waitConnected;
	if (waitConnected == null) return;

	try {
		await Promise.race([
			waitConnected(),
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
		connection.value = useStream().useChannel('chatUser', {
			otherId: props.userId,
		});
	} else if (room.value != null) {
		connection.value = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});
	} else {
		connection.value = null;
		return;
	}

	connection.value.on('message', onMessage);
	connection.value.on('deleted', onDeleted);
	connection.value.on('deletedMany', onDeletedMany);
	connection.value.on('cleared', onCleared);
	connection.value.on('pruned', onPruned);
	connection.value.on('react', onReact);
	connection.value.on('unreact', onUnreact);
}

async function fetchLatestGap() {
	const sinceId = findNewestPersistedMessageId();
	const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
		userId: user.value!.id,
		limit: TIMELINE_LIMIT,
		...(sinceId ? { sinceId } : {}),
	}) : await misskeyApi('chat/messages/room-timeline', {
		roomId: room.value!.id,
		limit: TIMELINE_LIMIT,
		...(sinceId ? { sinceId } : {}),
	});

	appendFetchedMessages(newMessages);
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
		await fetchLatestGap();
		return;
	}

	if (room.value == null) return;

	const m = await misskeyApi('chat/messages/room-timeline', { roomId: room.value.id, limit: TIMELINE_LIMIT });
	appendFetchedMessages(m);
	canFetchMore.value = m.length === TIMELINE_LIMIT;
	await fetchLatestGap();
}

function clearMessageContextRoute() {
	if (props.messageId == null) return;

	const path = props.roomId != null ? `/chat/room/${props.roomId}` : props.userId != null ? `/chat/user/${props.userId}` : null;
	if (path == null) return;

	suppressNextMessageIdClearInitialize = true;
	router.replace(path);
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
	clearIncomingMessageQueue({ flushReadReceipt: true });
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
	clearIncomingMessageQueue({ flushReadReceipt: true });
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

async function scrollToLatestAfterLayout(options?: { flushReadReceipt?: boolean; fillHistory?: boolean }) {
	let stableFrames = 0;
	let previousMaxScrollTop = -1;

	for (let i = 0; i < 10; i++) {
		await nextTick();
		await waitAnimationFrame();

		const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
		if (scrollContainer == null) continue;

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

	scrollToLatest('instant', { flushReadReceipt: options?.flushReadReceipt });
	if (options?.fillHistory === true) {
		await fillInitialScrollableHistory();
	}
}

async function initialize() {
	initializing.value = true;
	clearIncomingMessageQueue({ flushReadReceipt: true });
	initializeError.value = null;
	joinRequiredRoom.value = null;
	canFetchMore.value = false;
	canFetchNewer.value = false;
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
			const u = await misskeyApi('users/show', { userId: props.userId });
			user.value = u;
			rememberUser(u);
			room.value = null;

			connectStream();
			await waitChannelConnected();

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

			connectStream();
			await waitChannelConnected();

			if (props.messageId != null) {
				await initializeContextTimeline(props.messageId);
			} else {
				await loadLatestTimeline();
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
		scheduleLatestOnChatTabReturn();
	}
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore(options: { keepLatest?: boolean } = {}) {
	const LIMIT = 30;
	const untilId = findOldestPersistedMessageId();
	if (!canFetchMore.value || moreFetching.value || untilId == null) return;

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

		appendFetchedMessages(newMessages);

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

		await fetchMore({ keepLatest: true });
	}
}

async function fetchNewer() {
	const LIMIT = 30;
	const sinceId = findNewestPersistedMessageId();
	if (!canFetchNewer.value || newerFetching.value || sinceId == null) return;

	const anchor = getVisibleMessageAnchor();
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

		appendFetchedMessages(newMessages);
		canFetchNewer.value = newMessages.length === LIMIT;
	} finally {
		newerFetching.value = false;
		await restoreVisibleMessageAnchorAfterLayout(anchor);
		endScrollRestoration();
		nextTick(() => {
			const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
			if (scrollContainer == null) return;
			newerFetchArmed = getChatScrollMetrics(scrollContainer).latestDistance >= SCROLL_TAIL_THRESHOLD;
		});
	}
}

function clearIncomingMessageQueue(options?: { flushReadReceipt?: boolean }) {
	if (options?.flushReadReceipt === true) {
		readReceiptBatcher.flush({ force: true });
	}

	pendingIncomingMessages = [];
	if (pendingIncomingMessageFrame != null) {
		window.cancelAnimationFrame(pendingIncomingMessageFrame);
		pendingIncomingMessageFrame = null;
	}
	if (options?.flushReadReceipt !== true) {
		readReceiptBatcher.cancel();
	}
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

function processIncomingMessageBatch(batch: Misskey.entities.ChatMessageLite[]) {
	if (batch.length === 0) return;

	if (isContextMode.value) {
		const normalized = batch.map(message => normalizeMessage(message));
		messages.value = removeMatchingPendingMessagesFrom(messages.value, normalized);
		const otherCount = normalized.filter(message => message.fromUserId !== $i.id).length;
		if (otherCount > 0) {
			notifyNewMessages(otherCount);
		}
		return;
	}

	const wasAtLatest = isAtLatest();
	const anchor = wasAtLatest ? null : getVisibleMessageAnchor();
	if (!wasAtLatest) {
		beginScrollRestoration();
	}

	if (room.value?.isMuted !== true) {
		sound.playMisskeySfx('chatMessage');
	}

	const normalized = batch.map(message => normalizeMessage(message));
	const newestOtherMessage = getNewestMessage(normalized.filter(message => message.fromUserId !== $i.id));
	const firstNormalized = normalized[0];
	if (firstNormalized == null) return;

	const current = removeMatchingPendingMessagesFrom(messages.value, normalized);
	messages.value = normalized.length === 1
		? prependChatMessageForTimeline(current, firstNormalized, { limit: messageLimit() })
		: mergeChatMessagesForTimeline(current, normalized, { limit: messageLimit() });
	if (!wasAtLatest) {
		void restoreVisibleMessageAnchorAfterLayout(anchor).finally(() => {
			historyFetchArmed = true;
			newerFetchArmed = true;
			endScrollRestoration();
		});
	}

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (newestOtherMessage != null && !window.document.hidden && isActivated) {
		readReceiptBatcher.queue(newestOtherMessage.id);
	}

	if (newestOtherMessage != null) {
		if (wasAtLatest) {
			nextTick(() => {
				scrollToLatest('instant');
				clearNewMessageIndicator();
			});
		} else {
			nextTick(async () => {
				await waitAnimationFrame();
				if (isMessageVisibleAtLatestEdge(newestOtherMessage.id)) {
					clearNewMessageIndicator();
				} else {
					notifyNewMessages(normalized.filter(message => message.fromUserId !== $i.id).length);
				}
			});
		}
	}
}

function flushIncomingMessages() {
	pendingIncomingMessageFrame = null;
	const batch = pendingIncomingMessages;
	pendingIncomingMessages = [];
	processIncomingMessageBatch(batch);
}

function flushIncomingMessagesNow() {
	if (pendingIncomingMessageFrame != null) {
		window.cancelAnimationFrame(pendingIncomingMessageFrame);
		pendingIncomingMessageFrame = null;
	}

	const batch = pendingIncomingMessages;
	pendingIncomingMessages = [];
	processIncomingMessageBatch(batch);
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	pendingIncomingMessages.push(message);
	if (pendingIncomingMessageFrame == null) {
		pendingIncomingMessageFrame = window.requestAnimationFrame(flushIncomingMessages);
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onDeletedMany(ids: string[]) {
	const idSet = new Set(ids);
	messages.value = messages.value.filter(message => !idSet.has(message.id));
}

function onCleared() {
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
	messages.value = messages.value.filter(message => message.id >= ctx.cutoffId);
	if (messages.value.length === 0) {
		canFetchMore.value = false;
		canFetchNewer.value = false;
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
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

function onIndicatorClick() {
	if (isContextMode.value) {
		void exitContextToLatest();
		return;
	}

	scrollToLatest('smooth', { flushReadReceipt: true });
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

function onVisibilitychange() {
	if (window.document.hidden) return;
	readReceiptBatcher.flush();
}

onMounted(() => {
	window.document.addEventListener('visibilitychange', onVisibilitychange);
	window.addEventListener('resize', updateChatTabsScrollState);
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
	readReceiptBatcher.flush({ force: true });
	connection.value?.dispose();
	removeTimelineScrollListener?.();
	clearIncomingMessageQueue();
	if (pendingStickToLatestFrame != null) {
		window.cancelAnimationFrame(pendingStickToLatestFrame);
		pendingStickToLatestFrame = null;
	}
	if (pendingUserRefreshTimer != null) {
		window.clearTimeout(pendingUserRefreshTimer);
		pendingUserRefreshTimer = null;
	}
	usersRefreshQueue.clear();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
	window.removeEventListener('resize', updateChatTabsScrollState);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
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

function showMenu(ev: MouseEvent) {
	const menuItems: MenuItem[] = [];

	if (room.value) {
		if (room.value.ownerId === $i.id) {
			menuItems.push({
				text: i18n.ts._chat.inviteUser,
				icon: 'ti ti-user-plus',
				action: () => {
					inviteUser();
				},
			});
		} else if (room.value.isJoined) {
			menuItems.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-x',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	if (menuItems.length === 0) return;

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const tab = ref('chat');

async function ensureLatestOnChatTabReturn(generation: number) {
	await nextTick();
	await waitAnimationFrame();

	if (generation !== chatTabLatestReturnGeneration || tab.value !== 'chat' || initializing.value || initializeError.value != null || joinRequiredRoom.value != null) return;

	scrollToLatest('instant');
	flushIncomingMessagesNow();

	try {
		await fetchLatestGap();
	} catch (err) {
		console.warn('Failed to refresh latest chat messages after returning to chat tab:', err);
	}

	await nextTick();
	await waitAnimationFrame();

	if (generation !== chatTabLatestReturnGeneration || tab.value !== 'chat' || initializing.value || initializeError.value != null || joinRequiredRoom.value != null) return;

	await scrollToLatestAfterLayout({ flushReadReceipt: true, fillHistory: true });
}

function scheduleLatestOnChatTabReturn() {
	chatTabLatestReturnGeneration++;
	void ensureLatestOnChatTabReturn(chatTabLatestReturnGeneration);
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
		scheduleLatestOnChatTabReturn();
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
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}, ...(room.value.canManage ? [{
	key: 'management',
	title: i18n.ts._chat.management,
	icon: 'ti ti-shield-cog',
}] : [])] : [{
	key: 'chat',
	title: i18n.ts.chat,
	icon: 'ti ti-messages',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
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
	if (room.value == null || (!room.value.isJoined && room.value.ownerId !== $i.id)) return [];

	return [{
		icon: 'ti ti-dots',
		text: '',
		handler: showMenu,
	}];
});

definePage(computed(() => {
	if (!initializing.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: i18n.ts.chat,
			};
		}
	} else {
		return {
			title: i18n.ts.chat,
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

	position: relative;
	container-type: inline-size;
	height: 100%;
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

.localHeader {
	--chat-room-header-bg: color(from var(--MI_THEME-pageHeaderBg) srgb r g b / 0.92);
	--chat-room-header-fg: var(--MI_THEME-pageHeaderFg);

	position: relative;
	z-index: 1000;
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	grid-template-areas:
		"title menu"
		"tabs tabs";
	align-items: center;
	gap: 0 8px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	padding: 0 14px 4px;
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
	max-width: 260px;
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
	border-top: solid 1px color-mix(in srgb, var(--chat-room-header-fg) 10%, transparent);
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
		padding: 0 12px 2px;
	}

	.localTitle {
		max-width: none;
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

.messageItem {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
}

.contextTarget {
	border-radius: 22px;
	animation: contextTargetPulse 2.2s ease-out 1;
}

.contextModeBar {
	position: sticky;
	top: 0;
	z-index: 2;
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 10px;
	padding: 8px 10px;
	border-radius: 14px;
	background: light-dark(rgb(255 255 255 / 0.86), rgb(23 35 47 / 0.9));
	box-shadow: 0 1px 4px rgb(0 0 0 / 0.14);
	-webkit-backdrop-filter: var(--MI-blur, blur(8px));
	backdrop-filter: var(--MI-blur, blur(8px));
}

.contextModeText {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.9em;
	font-weight: 700;
}

.contextModeButton {
	flex-shrink: 0;
	padding: 0 12px;
	line-height: 30px;
	border-radius: 999px;
	font-size: 0.9em;
}

.more {
	min-height: 44px;
	display: grid;
	place-items: center;
}

.chatPane {
	height: 100%;
	min-height: 0;
	width: min(100%, 920px);
	margin: 0 auto;
	padding: 14px 18px;
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
	background:
		radial-gradient(circle at 20px 20px, light-dark(rgb(0 0 0 / 0.035), rgb(255 255 255 / 0.035)) 1px, transparent 1px),
		var(--chat-room-surface);
	background-size: 22px 22px, auto;
	border-inline: solid 1px var(--chat-room-border);
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
	padding: 6px 12px max(8px, env(safe-area-inset-bottom));
	box-sizing: border-box;
	background: var(--chat-room-surface);
	border-top: none;
	box-shadow: 0 -12px 20px -18px var(--chat-room-footer-shadow);
}

.footer::before {
	content: "";
	position: absolute;
	inset: -18px 0 auto;
	height: 18px;
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
	max-width: 920px;
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
