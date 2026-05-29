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
		<div :class="$style.localTabs">
			<button v-for="t in headerTabs" :key="t.key" class="_button" :class="[$style.localTab, { [$style.localTabActive]: tab === t.key }]" @click="tab = t.key">
				<i :class="t.icon"></i>
				<span>{{ t.title }}</span>
			</button>
		</div>
		<button v-if="headerActions.length > 0" class="_button" :class="$style.localMenu" @click="headerActions[0].handler">
			<i :class="headerActions[0].icon"></i>
		</button>
	</div>
	<div v-if="tab === 'chat'" :class="$style.chatPane">
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

			<div v-else ref="timelineEl" :class="$style.timeline">
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
						<XMessage v-if="item.type === 'item'" :message="item.data" :enableReferenceActions="true" @reply="setReplyTarget(item.data)" @quote="setQuoteTarget(item.data)" @openReference="openReferenceMessage"/>
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

	<div v-else-if="tab === 'search'" :class="$style.searchPane">
		<XSearch :userId="userId" :roomId="roomId" @openContext="openMessageContext"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room" @updated="onRoomUpdated"/>
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
			<XForm v-if="!initializing && !initializeError && !joinRequiredRoom" ref="formEl" :user="user" :room="room" :replyTarget="replyTarget" :quoteTarget="quoteTarget" :class="$style.form" @sent="onSentMessage" @clearReply="replyTarget = null" @clearQuote="quoteTarget = null"/>
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
const timelineEl = ref<HTMLElement | null>(null);
const formEl = ref<InstanceType<typeof XForm> | null>(null);
const timeline = makeDateSeparatedTimelineComputedRef(messages);
const contextTargetMessageId = ref<string | null>(null);
const pendingContextScrollId = ref<string | null>(null);

const SCROLL_HEAD_THRESHOLD = 200;
const SCROLL_HISTORY_THRESHOLD = 480;
const SCROLL_TAIL_THRESHOLD = 480;
const TIMELINE_LIMIT = 20;
const CONTEXT_LIMIT = 30;
const MAX_ROOM_MESSAGES = 500;
const STREAM_CONNECT_TIMEOUT = 5000;
let removeTimelineScrollListener: (() => void) | null = null;
let historyFetchArmed = true;
let newerFetchArmed = true;
let scrollRestorationDepth = 0;
const isRestoringHistoryScroll = ref(false);
const isRoomChat = computed(() => props.roomId != null);
const isContextMode = computed(() => contextTargetMessageId.value != null);

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

	return Math.abs(scrollContainer.scrollTop) < SCROLL_HEAD_THRESHOLD;
}

function clearNewMessageIndicator() {
	if (!showIndicator.value && newMessageCount.value === 0) return;

	showIndicator.value = false;
	newMessageCount.value = 0;
}

function scrollToLatest(behavior: ScrollBehavior = 'smooth') {
	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	scrollContainer?.scrollTo({
		top: 0,
		behavior,
	});
	clearNewMessageIndicator();
	newerFetchArmed = false;
	historyFetchArmed = true;
}

function setupTimelineScrollListener() {
	removeTimelineScrollListener?.();
	removeTimelineScrollListener = null;

	const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
	if (scrollContainer == null) return;

	const onScroll = () => {
		const maxReverseScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
		const reverseScroll = Math.min(maxReverseScroll, Math.max(0, Math.abs(scrollContainer.scrollTop)));
		const historyDistance = maxReverseScroll - reverseScroll;
		if (historyDistance >= SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = true;
		}

		if (!isRestoringHistoryScroll.value && canFetchMore.value && !moreFetching.value && messages.value.length > 0 && historyFetchArmed && historyDistance < SCROLL_HISTORY_THRESHOLD) {
			historyFetchArmed = false;
			fetchMore();
		}

		const latestDistance = reverseScroll;
		if (latestDistance < SCROLL_HEAD_THRESHOLD) {
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
	removeTimelineScrollListener = () => scrollContainer.removeEventListener('scroll', onScroll);
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

// column-reverseなので本来はスクロール位置の最下部への追従は不要なはずだが、おそらくブラウザのバグにより、最下部にスクロールした状態でも追従されない場合がある(スクロール位置が少数になることがあるのが関わっていそう)
// そのため補助としてMutationObserverを使って追従を行う
useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	if (isRestoringHistoryScroll.value || isContextMode.value) return;

	const scrollContainer = getScrollContainer(timelineEl.value)!;
	// column-reverseなのでscrollTopは負になる
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value),
		reply: message.replyId ? (message.reply ? normalizeMessage(message.reply) : null) : null,
		quote: message.quoteId ? (message.quote ? normalizeMessage(message.quote) : null) : null,
		replyUnavailable: message.replyId != null && message.reply == null,
		quoteUnavailable: message.quoteId != null && message.quote == null,
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? null,
		})),
	};
}

function sortMessages(items: NormalizedChatMessage[]): NormalizedChatMessage[] {
	return [...items].sort((a, b) => a.id > b.id ? -1 : a.id < b.id ? 1 : 0);
}

function trimMessages(items: NormalizedChatMessage[]): NormalizedChatMessage[] {
	if (!isRoomChat.value || isContextMode.value || items.length <= MAX_ROOM_MESSAGES) return items;
	return items.slice(0, MAX_ROOM_MESSAGES);
}

function mergeMessages(...sources: NormalizedChatMessage[][]): NormalizedChatMessage[] {
	const map = new Map<string, NormalizedChatMessage>();

	for (const source of sources) {
		for (const message of source) {
			map.set(message.id, message);
		}
	}

	return trimMessages(sortMessages([...map.values()]));
}

function prependMessage(message: NormalizedChatMessage) {
	const existingIndex = messages.value.findIndex(item => item.id === message.id);
	if (existingIndex !== -1) {
		messages.value[existingIndex] = message;
		return;
	}

	const current = messages.value;
	if (current.length === 0 || message.id > current[0].id) {
		messages.value = trimMessages([message, ...current]);
		return;
	}

	messages.value = mergeMessages(current, [message]);
}

function appendFetchedMessages(fetched: Misskey.entities.ChatMessageLite[]) {
	messages.value = mergeMessages(messages.value, fetched.map(x => normalizeMessage(x)));
}

function replaceMessages(fetched: (Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage)[]) {
	messages.value = mergeMessages(fetched.map(x => normalizeMessage(x)));
}

function onSentMessage(message: Misskey.entities.ChatMessageLite) {
	prependMessage(normalizeMessage(message));
	replyTarget.value = null;
	quoteTarget.value = null;
	nextTick(() => scrollToLatest('instant'));
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
	connection.value.on('react', onReact);
	connection.value.on('unreact', onUnreact);
}

async function fetchLatestGap() {
	const sinceId = messages.value[0]?.id;
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

async function openMessageContext(messageId: string) {
	tab.value = 'chat';
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
	if (messageId == null || initializeError.value != null || joinRequiredRoom.value != null) return;

	await scrollContextTargetAfterRender(messageId);
}

async function initialize() {
	initializing.value = true;
	initializeError.value = null;
	joinRequiredRoom.value = null;
	canFetchMore.value = false;
	canFetchNewer.value = false;
	messages.value = [];
	connection.value?.dispose();
	connection.value = null;
	showIndicator.value = false;
	newMessageCount.value = 0;
	contextTargetMessageId.value = null;
	pendingContextScrollId.value = null;
	historyFetchArmed = true;
	newerFetchArmed = true;

	try {
		if (props.userId) {
			const u = await misskeyApi('users/show', { userId: props.userId });
			user.value = u;
			room.value = null;

			connectStream();
			await waitChannelConnected();

			if (props.messageId != null) {
				await initializeContextTimeline(props.messageId);
			} else {
				const m = await misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: TIMELINE_LIMIT });
				appendFetchedMessages(m);

				if (m.length === TIMELINE_LIMIT) {
					canFetchMore.value = true;
				}
				await fetchLatestGap();
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
				const m = await misskeyApi('chat/messages/room-timeline', { roomId, limit: TIMELINE_LIMIT });
				appendFetchedMessages(m);

				if (m.length === TIMELINE_LIMIT) {
					canFetchMore.value = true;
				}
				await fetchLatestGap();
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
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;
	if (!canFetchMore.value || moreFetching.value || messages.value.length === 0) return;

	const anchor = getVisibleMessageAnchor();
	beginScrollRestoration();
	moreFetching.value = true;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			untilId: messages.value[messages.value.length - 1].id,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			untilId: messages.value[messages.value.length - 1].id,
		});

		appendFetchedMessages(newMessages);

		canFetchMore.value = newMessages.length === LIMIT;
	} finally {
		moreFetching.value = false;
		// The loading row is part of the scroll layout, so restore only after it is gone.
		await restoreVisibleMessageAnchorAfterLayout(anchor);
		endScrollRestoration();
		nextTick(() => {
			const scrollContainer = timelineEl.value == null ? null : getScrollContainer(timelineEl.value);
			if (scrollContainer == null) return;
			const maxReverseScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
			const reverseScroll = Math.min(maxReverseScroll, Math.max(0, Math.abs(scrollContainer.scrollTop)));
			historyFetchArmed = (maxReverseScroll - reverseScroll) >= SCROLL_HISTORY_THRESHOLD;
		});
	}
}

async function fetchNewer() {
	const LIMIT = 30;
	if (!canFetchNewer.value || newerFetching.value || messages.value.length === 0) return;

	const anchor = getVisibleMessageAnchor();
	beginScrollRestoration();
	newerFetching.value = true;

	try {
		const newMessages = props.userId ? await misskeyApi('chat/messages/user-timeline', {
			userId: user.value!.id,
			limit: LIMIT,
			sinceId: messages.value[0].id,
		}) : await misskeyApi('chat/messages/room-timeline', {
			roomId: room.value!.id,
			limit: LIMIT,
			sinceId: messages.value[0].id,
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
			const maxReverseScroll = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
			const reverseScroll = Math.min(maxReverseScroll, Math.max(0, Math.abs(scrollContainer.scrollTop)));
			newerFetchArmed = reverseScroll >= SCROLL_TAIL_THRESHOLD;
		});
	}
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	const wasAtLatest = isAtLatest();
	const anchor = wasAtLatest ? null : getVisibleMessageAnchor();
	if (!wasAtLatest) {
		beginScrollRestoration();
	}

	if (room.value?.isMuted !== true) {
		sound.playMisskeySfx('chatMessage');
	}

	prependMessage(normalizeMessage(message));
	if (!wasAtLatest) {
		void restoreVisibleMessageAnchorAfterLayout(anchor).finally(() => {
			historyFetchArmed = true;
			newerFetchArmed = true;
			endScrollRestoration();
		});
	}

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}

	if (message.fromUserId !== $i.id) {
		if (wasAtLatest) {
			nextTick(() => scrollToLatest('instant'));
		} else {
			notifyNewMessage();
		}
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
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
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		const index = message.reactions.findIndex(r => r.user != null && r.reaction === ctx.reaction && r.user.id === ctx.user!.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	scrollToLatest();
}

function notifyNewMessage() {
	showIndicator.value = true;
	newMessageCount.value += 1;
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

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	window.document.addEventListener('visibilitychange', onVisibilitychange);
	watch(timelineEl, () => nextTick(setupTimelineScrollListener), { immediate: true });
	watch(() => props.messageId, (to, from) => {
		if (to !== from) {
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
	connection.value?.dispose();
	removeTimelineScrollListener?.();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
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
}] : [{
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
	position: relative;
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

	position: relative;
	z-index: 1000;
	display: grid;
	grid-template-columns: minmax(130px, auto) minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	min-height: 52px;
	padding: 0 18px;
	box-sizing: border-box;
	background: var(--chat-room-header-bg);
	border-bottom: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-pageHeaderFg);
}

:global(html[data-color-scheme=dark]) {
	.localHeader {
		--chat-room-header-bg: color-mix(in srgb, var(--MI_THEME-bg) 94%, #000);

		color: var(--MI_THEME-fg);
	}
}

.localTitle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
	font-weight: 700;

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

.localTabs {
	display: flex;
	align-items: stretch;
	min-width: 0;
	overflow-x: auto;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.localTab {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 52px;
	padding: 0 12px;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
	border-bottom: solid 3px transparent;

	&:hover {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.localTabActive {
	color: var(--MI_THEME-accent);
	border-bottom-color: var(--MI_THEME-accent);
}

.localMenu {
	display: grid;
	place-items: center;
	width: 38px;
	height: 38px;
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
		padding: 0 12px;
	}

	.localTitle {
		grid-area: title;
		min-height: 40px;
	}

	.localTabs {
		grid-area: tabs;
	}

	.localTab {
		min-height: 40px;
		padding: 0 10px;
	}

	.localMenu {
		grid-area: menu;
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
	overflow: clip;
	overflow-y: scroll;
	overflow-anchor: none;
	overscroll-behavior: contain;
	scrollbar-gutter: stable;
	display: flex;
	flex-direction: column-reverse;
	background:
		radial-gradient(circle at 20px 20px, light-dark(rgb(0 0 0 / 0.035), rgb(255 255 255 / 0.035)) 1px, transparent 1px),
		light-dark(#d8e6ee, #0e1621);
	background-size: 22px 22px, auto;
	border-inline: solid 1px light-dark(rgb(198 213 222), rgb(31 43 55));
}

.chatPane > :global(._gaps) {
	width: 100%;
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
	width: 100%;
	padding: 6px 12px max(8px, env(safe-area-inset-bottom));
	box-sizing: border-box;
	background: light-dark(#d8e6ee, #0e1621);
	border-top: solid 1px light-dark(rgb(198 213 222), rgb(31 43 55));
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
