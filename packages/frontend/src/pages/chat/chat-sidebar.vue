<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.header">
		<MkA to="/chat" :class="$style.headerTitle">
			<i class="ti ti-messages"></i>
			<span>{{ i18n.ts.chat }}</span>
		</MkA>
		<button v-if="$i.policies.chatAvailability === 'available'" class="_button" :class="$style.headerButton" :title="i18n.ts.startChat" :aria-label="i18n.ts.startChat" @click="start">
			<i class="ti ti-plus"></i>
		</button>
	</div>

	<div :class="$style.list">
		<MkLoading v-if="initializing"/>
		<template v-else>
			<template v-if="invitations.length > 0">
				<button class="_button" :class="[$style.sectionTitle, $style.sectionToggle]" @click="toggleInvitations">
					<i class="ti ti-mail-forward"></i>
					<span>{{ i18n.ts._chat.invitations }} ({{ invitations.length }})</span>
					<i class="ti ti-chevron-down" :class="[$style.sectionChevron, { [$style.sectionChevronOpen]: invitationsOpen }]"></i>
				</button>
				<div v-for="iv in invitations" v-show="invitationsOpen" :key="`inv:${iv.id}`" :class="[$style.item, $style.inviteItem]">
					<XRoomAvatar :room="iv.room" :class="$style.itemAvatar"/>
					<div :class="$style.itemBody">
						<div :class="$style.itemHeader">
							<span :class="$style.itemName">{{ iv.room.name }}</span>
						</div>
						<div :class="$style.inviteActions">
							<MkButton primary rounded small @click="acceptInvitation(iv)"><i class="ti ti-plus"></i> {{ i18n.ts._chat.join }}</MkButton>
							<MkButton rounded small @click="ignoreInvitation(iv)">{{ i18n.ts._chat.ignore }}</MkButton>
						</div>
					</div>
				</div>
			</template>

			<div :class="$style.sectionTitle">
				<i class="ti ti-users-group"></i>
				<span>{{ i18n.ts._chat.groupChats }}</span>
			</div>
			<div v-if="roomEntries.length === 0" :class="$style.empty">{{ i18n.ts._chat.noRooms }}</div>
			<template v-for="group in groupedRoomEntries" :key="group.key">
				<button class="_button" :class="[$style.sectionTitle, $style.sectionToggle, $style.roomGroupToggle]" @click="toggleRoomGroup(group.key)">
					<i :class="group.key === UNGROUPED_ROOM_GROUP_KEY ? 'ti ti-folder' : 'ti ti-folder-filled'"></i>
					<span>{{ group.label }} ({{ group.entries.length }})</span>
					<i class="ti ti-chevron-down" :class="[$style.sectionChevron, { [$style.sectionChevronOpen]: isRoomGroupOpen(group.key) }]"></i>
				</button>
				<div
					v-for="entry in group.entries"
					v-show="isRoomGroupOpen(group.key)"
					:key="`room:${entry.id}`"
					v-memo="[isRoomGroupOpen(group.key), entry.id === activeRoomId, entry.isRead, entry.hasUnreadMention, entry.lastMessage?.id, entry.room.name, entry.room.myNickname, entry.room.myFolder, entry.room.avatarUrl]"
					:class="[$style.item, $style.roomItem, { [$style.itemActive]: entry.id === activeRoomId, [$style.itemUnread]: !entry.isRead }]"
				>
					<button class="_button" :class="$style.roomOpenButton" @click="openRoom(entry)">
						<XRoomAvatar :room="entry.room" :class="$style.itemAvatar"/>
						<div :class="$style.itemBody">
							<div :class="$style.itemHeader">
								<span :class="$style.itemName" :title="roomDisplayName(entry.room)">{{ roomDisplayName(entry.room) }}</span>
								<span v-if="hasRoomNickname(entry.room)" :class="$style.roomOriginalName" :title="`${i18n.ts._chat.originalRoomName}: ${entry.room.name}`">{{ entry.room.name }}</span>
								<span v-if="entry.hasUnreadMention" :class="$style.mentionBadge">@</span>
								<MkTime v-if="entry.lastMessage" :time="entry.lastMessage.createdAt" :class="$style.itemTime"/>
							</div>
							<div :class="$style.itemPreview">
								<template v-if="entry.lastMessage">
									<span v-if="entry.lastMessage.fromUserId === $i.id" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
									{{ previewText(entry.lastMessage) }}
								</template>
								<template v-else>{{ entry.room.description || i18n.ts._chat.noMessagesYet }}</template>
							</div>
						</div>
					</button>
					<button class="_button" :class="$style.roomMenuButton" :title="i18n.ts._chat.organizeRoom" :aria-label="i18n.ts._chat.organizeRoom" @click.stop="openRoomMenu(entry, $event)">
						<i class="ti ti-dots"></i>
					</button>
				</div>
			</template>

			<div :class="$style.sectionTitle">
				<i class="ti ti-user"></i>
				<span>{{ i18n.ts._chat.directMessages }}</span>
			</div>
			<div v-if="userEntries.length === 0" :class="$style.empty">{{ i18n.ts._chat.noHistory }}</div>
			<div
				v-for="entry in userEntries"
				:key="`user:${entry.id}`"
				v-memo="[entry.id === activeUserId, entry.isRead, entry.isMe, entry.lastMessage.id, entry.other.name, entry.other.avatarUrl]"
				:class="[$style.item, $style.userItem, { [$style.itemActive]: entry.id === activeUserId, [$style.itemUnread]: !entry.isRead && !entry.isMe }]"
			>
				<button class="_button" :class="$style.userOpenButton" @click="openUser(entry)">
					<MkAvatar :user="entry.other" :class="$style.itemAvatar" indicator :preview="false" :link="false"/>
					<div :class="$style.itemBody">
						<div :class="$style.itemHeader">
							<MkUserName :user="entry.other" :class="$style.itemName"/>
							<MkTime :time="entry.lastMessage.createdAt" :class="$style.itemTime"/>
						</div>
						<div :class="$style.itemPreview">
							<span v-if="entry.isMe" :class="$style.youSaid">{{ i18n.ts.you }}:</span>
							{{ previewText(entry.lastMessage) }}
						</div>
					</div>
				</button>
				<button class="_button" :class="$style.conversationMenuButton" :title="i18n.ts._chat.deleteConversation" :aria-label="i18n.ts._chat.deleteConversation" @click.stop="openUserMenu(entry, $event)">
					<i class="ti ti-dots"></i>
				</button>
			</div>
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { useInterval } from '@@/js/use-interval.js';
import XRoomAvatar from './XRoomAvatar.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkButton from '@/components/MkButton.vue';
import { useStream } from '@/stream.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	activeUserId?: string;
	activeRoomId?: string;
}>();

const emit = defineEmits<{
	// リスト読み込み完了を親に通知。targetがあればPC幅で自動で開く、nullなら会話なし（ホームを表示）
	(ev: 'ready', target: { roomId?: string; userId?: string } | null): void;
}>();

type ChatMessageWithMentionState = Misskey.entities.ChatMessage & {
	hasUnreadMention?: boolean;
};

type RoomEntry = {
	id: string;
	room: Misskey.entities.ChatRoom;
	lastMessage: Misskey.entities.ChatMessage | null;
	isRead: boolean;
	hasUnreadMention: boolean;
};

type UserEntry = {
	id: string;
	other: NonNullable<Misskey.entities.ChatMessage['fromUser']>;
	lastMessage: Misskey.entities.ChatMessage;
	isRead: boolean;
	isMe: boolean;
};

type RoomGroup = {
	key: string;
	label: string;
	entries: RoomEntry[];
};

const initializing = ref(true);
const fetching = ref(false);
const roomEntries = ref<RoomEntry[]>([]);
const userEntries = ref<UserEntry[]>([]);
// 收到的房间邀请（新布局会跳过聊天首页，故在侧边栏顶部直接显示，可一键加入/忽略）。
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
// 邀请太多时可折叠收起（记住上次的展开/收起状态）。
const invitationsOpen = ref(window.localStorage.getItem('chatInvitationsCollapsed') !== '1');
const UNGROUPED_ROOM_GROUP_KEY = '__ungrouped__';
const CHAT_ROOM_GROUPS_COLLAPSED_KEY = 'chatRoomGroupsCollapsed';
const CHAT_SIDEBAR_FALLBACK_REFRESH_INTERVAL_MS = 1000 * 60;
const CHAT_SIDEBAR_EVENT_REFRESH_DEBOUNCE_MS = 400;
const collapsedRoomGroupKeys = ref(readCollapsedRoomGroupKeys());

function toggleInvitations() {
	invitationsOpen.value = !invitationsOpen.value;
	window.localStorage.setItem('chatInvitationsCollapsed', invitationsOpen.value ? '0' : '1');
}

function readCollapsedRoomGroupKeys(): Set<string> {
	try {
		const parsed = JSON.parse(window.localStorage.getItem(CHAT_ROOM_GROUPS_COLLAPSED_KEY) ?? '[]') as unknown;
		if (Array.isArray(parsed) && parsed.every(item => typeof item === 'string')) {
			return new Set(parsed);
		}
	} catch {
		// Ignore stale storage.
	}

	return new Set();
}

function saveCollapsedRoomGroupKeys() {
	window.localStorage.setItem(CHAT_ROOM_GROUPS_COLLAPSED_KEY, JSON.stringify([...collapsedRoomGroupKeys.value]));
}

function normalizedRoomFolder(room: Misskey.entities.ChatRoom): string {
	return room.myFolder?.trim() ?? '';
}

function roomGroupKey(room: Misskey.entities.ChatRoom): string {
	const folder = normalizedRoomFolder(room);
	return folder === '' ? UNGROUPED_ROOM_GROUP_KEY : `folder:${folder}`;
}

function roomGroupLabel(room: Misskey.entities.ChatRoom): string {
	const folder = normalizedRoomFolder(room);
	return folder === '' ? i18n.ts._chat.ungroupedRooms : folder;
}

const groupedRoomEntries = computed<RoomGroup[]>(() => {
	const groups = new Map<string, RoomGroup>();
	for (const entry of roomEntries.value) {
		const key = roomGroupKey(entry.room);
		const group = groups.get(key) ?? {
			key,
			label: roomGroupLabel(entry.room),
			entries: [],
		};
		group.entries.push(entry);
		groups.set(key, group);
	}

	return [...groups.values()].toSorted((a, b) => {
		if (a.key === UNGROUPED_ROOM_GROUP_KEY) return -1;
		if (b.key === UNGROUPED_ROOM_GROUP_KEY) return 1;
		return a.label.localeCompare(b.label);
	});
});

function isRoomGroupOpen(key: string): boolean {
	return !collapsedRoomGroupKeys.value.has(key);
}

function toggleRoomGroup(key: string) {
	const next = new Set(collapsedRoomGroupKeys.value);
	if (next.has(key)) {
		next.delete(key);
	} else {
		next.add(key);
	}
	collapsedRoomGroupKeys.value = next;
	saveCollapsedRoomGroupKeys();
}

function roomDisplayName(room: Misskey.entities.ChatRoom): string {
	const nickname = room.myNickname?.trim();
	return nickname != null && nickname !== '' ? nickname : room.name;
}

function hasRoomNickname(room: Misskey.entities.ChatRoom): boolean {
	return roomDisplayName(room) !== room.name;
}

// 参加中/作成済みルーム（メッセージが無いルームの補完用）。変化が少ないためポーリングごとには取得しない。
const knownRooms = ref<Map<string, Misskey.entities.ChatRoom>>(new Map());
let roomListLoaded = false;
let firstConversationEmitted = false;
let isActivated = true;
let mainConnection: Misskey.IChannelConnection<Misskey.Channels['main']> | null = null;
let pendingConversationRefreshTimer: number | null = null;
let queuedRefreshNeedsRoomList = false;
let queuedRefreshWhileFetching = false;

function shouldRefreshSidebarNow() {
	return !window.document.hidden && isActivated;
}

async function runSidebarRefresh(options: { includeRoomList: boolean }) {
	if (fetching.value) {
		queuedRefreshNeedsRoomList = queuedRefreshNeedsRoomList || options.includeRoomList;
		queuedRefreshWhileFetching = true;
		return;
	}

	fetching.value = true;

	try {
		if (options.includeRoomList) roomListLoaded = false;
		if (!roomListLoaded) await fetchRoomList();
		await Promise.all([fetchConversations(), fetchInvitations()]);
	} finally {
		fetching.value = false;
		if (queuedRefreshWhileFetching && shouldRefreshSidebarNow()) {
			const includeRoomList = queuedRefreshNeedsRoomList;
			queuedRefreshNeedsRoomList = false;
			queuedRefreshWhileFetching = false;
			void runSidebarRefresh({ includeRoomList });
		} else {
			queuedRefreshNeedsRoomList = false;
			queuedRefreshWhileFetching = false;
		}
	}
}

function clearPendingConversationRefresh() {
	if (pendingConversationRefreshTimer == null) return;
	window.clearTimeout(pendingConversationRefreshTimer);
	pendingConversationRefreshTimer = null;
}

function flushScheduledConversationRefresh() {
	pendingConversationRefreshTimer = null;
	if (!shouldRefreshSidebarNow()) return;
	void pollConversations('event');
}

function scheduleConversationRefresh(reason: 'event' | 'fallback' | 'activation') {
	if (!shouldRefreshSidebarNow()) return;
	if (reason === 'activation') {
		roomListLoaded = false;
	}
	if (pendingConversationRefreshTimer != null) return;
	pendingConversationRefreshTimer = window.setTimeout(flushScheduledConversationRefresh, CHAT_SIDEBAR_EVENT_REFRESH_DEBOUNCE_MS);
}

function onMainNewChatMessage() {
	scheduleConversationRefresh('event');
}

function setupMainStream() {
	if (mainConnection != null) return;
	mainConnection = useStream().useChannel('main', null, 'ChatSidebar');
	mainConnection.on('newChatMessage', onMainNewChatMessage);
}

function disposeMainStream() {
	mainConnection?.off('newChatMessage', onMainNewChatMessage);
	mainConnection?.dispose();
	mainConnection = null;
}

// joining + owned を取得して補完用キャッシュを更新する（初回とページ復帰時のみ）
async function fetchRoomList() {
	const [joiningMemberships, ownedRooms] = await Promise.all([
		misskeyApi('chat/rooms/joining', { limit: 100 }),
		misskeyApi('chat/rooms/owned', { limit: 100 }),
	]);
	const map = new Map<string, Misskey.entities.ChatRoom>();
	for (const room of [...joiningMemberships.map(m => m.room), ...ownedRooms]) {
		if (room != null) map.set(room.id, room);
	}
	knownRooms.value = map;
	roomListLoaded = true;
}

// 会話一覧（最新メッセージ・未読）を取得して再構築する（ポーリングはこれだけを叩く）
async function fetchConversations() {
	const [userMessages, roomMessages] = await Promise.all([
		misskeyApi('chat/history', { room: false }),
		misskeyApi('chat/history', { room: true }),
	]);

	const roomsById = new Map<string, RoomEntry>();
	for (const message of roomMessages as ChatMessageWithMentionState[]) {
		if (message.toRoomId == null || message.toRoom == null) continue;
		roomsById.set(message.toRoomId, {
			id: message.toRoomId,
			room: message.toRoom as Misskey.entities.ChatRoom,
			lastMessage: message,
			isRead: message.fromUserId === $i.id || (message.isRead ?? true),
			hasUnreadMention: message.hasUnreadMention === true,
		});
	}
	for (const room of knownRooms.value.values()) {
		if (roomsById.has(room.id)) continue;
		roomsById.set(room.id, {
			id: room.id,
			room,
			lastMessage: null,
			isRead: true,
			hasUnreadMention: false,
		});
	}

	// 最新メッセージのあるルームを上に、メッセージのないルームは下に
	roomEntries.value = [...roomsById.values()].toSorted((a, b) => {
		if (a.lastMessage == null && b.lastMessage == null) return a.id < b.id ? 1 : -1;
		if (a.lastMessage == null) return 1;
		if (b.lastMessage == null) return -1;
		return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
	});

	userEntries.value = userMessages
		.map(message => {
			const other = message.fromUserId === $i.id ? message.toUser : message.fromUser;
			if (other == null) return null;
			return {
				id: other.id,
				other,
				lastMessage: message,
				isRead: message.isRead ?? true,
				isMe: message.fromUserId === $i.id,
			} satisfies UserEntry;
		})
		.filter(entry => entry != null)
		.toSorted((a, b) => new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime());

	initializing.value = false;

	// 初回読み込み完了を親に通知（先頭の会話 or 会話なし）。親側で未選択時のみ自動で開く
	if (!firstConversationEmitted) {
		firstConversationEmitted = true;
		const firstRoom = roomEntries.value[0];
		const firstUser = userEntries.value[0];
		if (firstRoom != null) {
			emit('ready', { roomId: firstRoom.id });
		} else if (firstUser != null) {
			emit('ready', { userId: firstUser.id });
		} else {
			emit('ready', null);
		}
	}
}

// 初回・ページ復帰時：ルーム一覧も含めて全取得
async function fetchAll() {
	await runSidebarRefresh({ includeRoomList: true });
}

// ポーリング用：会話一覧（履歴）のみ更新。ルーム一覧は叩かない。
async function pollConversations(reason: 'event' | 'fallback' | 'activation' = 'fallback') {
	await runSidebarRefresh({ includeRoomList: reason === 'activation' });
}

async function fetchInvitations() {
	try {
		invitations.value = await misskeyApi('chat/rooms/invitations/inbox');
	} catch {
		// 邀请获取失败不影响会话列表
	}
}

async function acceptInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/join', { roomId: invitation.room.id });
	invitations.value = invitations.value.filter(i => i.id !== invitation.id);
	roomListLoaded = false;
	await fetchAll();
	router.push(`/chat/room/${invitation.room.id}`);
}

async function ignoreInvitation(invitation: Misskey.entities.ChatRoomInvitation) {
	await misskeyApi('chat/rooms/invitations/ignore', { roomId: invitation.room.id });
	invitations.value = invitations.value.filter(i => i.id !== invitation.id);
}

function previewText(message: Misskey.entities.ChatMessage) {
	return message.text ?? (message.fileId != null ? i18n.ts.file : '');
}

function applyUpdatedRoom(updated: Misskey.entities.ChatRoom) {
	const nextKnownRooms = new Map(knownRooms.value);
	nextKnownRooms.set(updated.id, updated);
	knownRooms.value = nextKnownRooms;
	roomEntries.value = roomEntries.value.map(entry => entry.id === updated.id ? {
		...entry,
		room: updated,
	} : entry);
}

async function editRoomOrganization(entry: RoomEntry) {
	const { canceled, result } = await os.form(i18n.ts._chat.organizeRoom, {
		nickname: {
			type: 'string',
			required: false,
			label: i18n.ts._chat.roomNickname,
			default: entry.room.myNickname ?? '',
		},
		folder: {
			type: 'string',
			required: false,
			label: i18n.ts._chat.roomFolder,
			default: entry.room.myFolder ?? '',
		},
	});
	if (canceled) return;

	const nickname = (result.nickname ?? '').trim() || null;
	const folder = (result.folder ?? '').trim() || null;
	const updated = await os.apiWithDialog<Misskey.entities.ChatRoom>('chat/rooms/user-settings/update', {
		roomId: entry.id,
		nickname,
		folder,
	});
	applyUpdatedRoom(updated);
}

async function clearRoomOrganization(entry: RoomEntry) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	const updated = await os.apiWithDialog<Misskey.entities.ChatRoom>('chat/rooms/user-settings/update', {
		roomId: entry.id,
		nickname: null,
		folder: null,
	});
	applyUpdatedRoom(updated);
}

function openRoomMenu(entry: RoomEntry, ev: MouseEvent) {
	const hasOrganization = hasRoomNickname(entry.room) || normalizedRoomFolder(entry.room) !== '';
	os.popupMenu([{
		text: i18n.ts._chat.organizeRoom,
		icon: 'ti ti-folder-cog',
		action: () => {
			editRoomOrganization(entry);
		},
	}, ...(hasOrganization ? [{
		type: 'divider' as const,
	}, {
		text: i18n.ts._chat.clearRoomOrganization,
		icon: 'ti ti-eraser',
		danger: true,
		action: () => {
			clearRoomOrganization(entry);
		},
	}] : [])], ev.currentTarget ?? ev.target);
}

async function deleteUserConversation(entry: UserEntry) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx._chat.deleteConversationConfirm({ name: entry.other.name ?? entry.other.username }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/users/conversation/delete', {
		userId: entry.id,
	});
	userEntries.value = userEntries.value.filter(userEntry => userEntry.id !== entry.id);
	if (entry.id === props.activeUserId) {
		router.push('/chat');
	}
}

function openUserMenu(entry: UserEntry, ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.deleteConversation,
		icon: 'ti ti-trash',
		danger: true,
		action: () => {
			deleteUserConversation(entry);
		},
	}], ev.currentTarget ?? ev.target);
}

function openRoom(entry: RoomEntry) {
	entry.isRead = true;
	entry.hasUnreadMention = false;
	router.push(`/chat/room/${entry.id}`);
}

function openUser(entry: UserEntry) {
	entry.isRead = true;
	router.push(`/chat/user/${entry.id}`);
}

function start(ev: MouseEvent) {
	os.popupMenu([{
		text: i18n.ts._chat.individualChat,
		caption: i18n.ts._chat.individualChat_description,
		icon: 'ti ti-user',
		action: () => { startUser(); },
	}, { type: 'divider' }, {
		type: 'parent',
		text: i18n.ts._chat.roomChat,
		caption: i18n.ts._chat.roomChat_description,
		icon: 'ti ti-users-group',
		children: [{
			text: i18n.ts._chat.createRoom,
			icon: 'ti ti-plus',
			action: () => { createRoom(); },
		}],
	}], (ev.currentTarget ?? ev.target) as HTMLElement);
}

async function startUser() {
	// TODO: localOnly は連合に対応したら消す
	os.selectUser({ localOnly: true }).then(user => {
		router.push(`/chat/user/${user.id}`);
	});
}

async function createRoom() {
	const { canceled, result } = await os.form(i18n.ts._chat.createRoom, {
		name: {
			type: 'string',
			label: i18n.ts.name,
		},
		description: {
			type: 'string',
			label: i18n.ts.description,
			required: false,
			multiline: true,
		},
		joinMode: {
			type: 'radio',
			label: i18n.ts._chat.roomJoinMode,
			default: 'inviteOnly',
			options: [{
				label: i18n.ts._chat.inviteOnlyRoom,
				value: 'inviteOnly',
			}, {
				label: i18n.ts._chat.openRoom,
				value: 'open',
			}, {
				label: i18n.ts._chat.closedRoom,
				value: 'closed',
			}],
		},
	});
	if (canceled) return;
	if (result.name.trim() === '') return;

	const room = await misskeyApi('chat/rooms/create', {
		name: result.name.trim(),
		description: result.description?.trim() ?? '',
		joinMode: result.joinMode as 'inviteOnly' | 'open' | 'closed',
	});

	// 新規作成したルームを一覧に反映するためルーム一覧も更新する
	roomListLoaded = false;
	await fetchAll();
	router.push(`/chat/room/${room.id}`);
}

onActivated(() => {
	isActivated = true;
	scheduleConversationRefresh('activation');
});

onDeactivated(() => {
	isActivated = false;
	clearPendingConversationRefresh();
});

// WSイベントが主経路。低頻度の兜底だけ残し、長時間切断・イベント欠落時にも一覧が自然に復旧する。
useInterval(() => {
	if (shouldRefreshSidebarNow()) {
		pollConversations('fallback');
	}
}, CHAT_SIDEBAR_FALLBACK_REFRESH_INTERVAL_MS, {
	immediate: false,
	afterMounted: true,
});

onMounted(() => {
	setupMainStream();
	fetchAll();
});

onBeforeUnmount(() => {
	clearPendingConversationRefresh();
	disposeMainStream();
});
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	box-sizing: border-box;
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.55);
	border-right: solid 1px var(--MI_THEME-divider);
}

.header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	flex: 0 0 auto;
	padding: 12px 16px;
	border-bottom: solid 1px var(--MI_THEME-divider);
}

.headerTitle {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	color: var(--MI_THEME-fg);
	font-weight: 700;

	&:hover {
		text-decoration: none;
		color: var(--MI_THEME-accent);
	}
}

.headerButton {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	border-radius: 999px;
	color: var(--MI_THEME-fgOnAccent);
	background: var(--MI_THEME-accent);

	&:hover {
		opacity: 0.85;
	}
}

.list {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding: 8px;
}

.sectionTitle {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 12px 8px 6px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.6);
	font-size: 0.82em;
	font-weight: 700;
}

.sectionToggle {
	width: 100%;
	text-align: left;
	border-radius: 8px;

	&:hover {
		color: var(--MI_THEME-fg);
		background: color(from var(--MI_THEME-fg) srgb r g b / 0.05);
	}
}

.sectionChevron {
	margin-left: auto;
	font-size: 1.1em;
	transition: transform 0.2s ease;
	transform: rotate(-90deg);
}

.sectionChevronOpen {
	transform: rotate(0deg);
}

.roomGroupToggle {
	padding-left: 12px;
}

.empty {
	padding: 8px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.55);
	font-size: 0.85em;
}

.inviteItem {
	cursor: default;

	&:hover {
		background: none;
	}
}

.inviteActions {
	display: flex;
	gap: 8px;
	margin-top: 6px;
	flex-wrap: wrap;
}

.item {
	position: relative;
	display: flex;
	align-items: center;
	gap: 10px;
	width: 100%;
	padding: 10px;
	border-radius: 10px;
	text-align: left;
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.itemActive {
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.12);

	&:hover {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.16);
	}
}

.itemUnread::before {
	content: '';
	position: absolute;
	top: 10px;
	right: 10px;
	width: 8px;
	height: 8px;
	border-radius: 100%;
	background-color: var(--MI_THEME-accent);
}

.roomItem {
	gap: 0;
	padding: 0;
	overflow: hidden;

	&.itemUnread::before {
		right: 44px;
	}
}

.roomOpenButton,
.userOpenButton {
	display: flex;
	align-items: center;
	gap: 10px;
	flex: 1 1 auto;
	min-width: 0;
	padding: 10px;
	border-radius: inherit;
	color: inherit;
	text-align: left;
}

.userItem {
	gap: 0;
	padding: 0;
	overflow: hidden;

	&.itemUnread::before {
		right: 44px;
	}
}

.roomMenuButton,
.conversationMenuButton {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 36px;
	height: 44px;
	margin-right: 4px;
	border-radius: 8px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.55);

	&:hover {
		color: var(--MI_THEME-fg);
		background: color(from var(--MI_THEME-fg) srgb r g b / 0.08);
	}
}

.itemAvatar {
	flex: 0 0 auto;
	width: 44px;
	height: 44px;
}

.itemBody {
	flex: 1;
	min-width: 0;
}

.itemHeader {
	display: flex;
	align-items: center;
	gap: 6px;
	white-space: nowrap;
	overflow: clip;
}

.itemName {
	flex: 0 1 auto;
	overflow: hidden;
	text-overflow: ellipsis;
	font-weight: 700;
	font-size: 0.95em;
}

.roomOriginalName {
	flex: 1 1 auto;
	min-width: 32px;
	max-width: 42%;
	overflow: hidden;
	text-overflow: ellipsis;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.5);
	font-size: 0.78em;
}

.mentionBadge {
	display: inline-grid;
	flex: 0 0 auto;
	place-items: center;
	width: 18px;
	height: 18px;
	border-radius: 999px;
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
	font-size: 0.8em;
	font-weight: 800;
	line-height: 1;
}

.itemTime {
	margin-left: auto;
	flex: 0 0 auto;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.55);
	font-size: 0.78em;
}

.itemPreview {
	margin-top: 2px;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);
	font-size: 0.85em;
}

.youSaid {
	font-weight: 700;
	margin-right: 0.4em;
}
</style>
