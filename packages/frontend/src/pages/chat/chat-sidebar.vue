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
				<div :class="$style.sectionTitle">
					<i class="ti ti-mail-forward"></i>
					<span>{{ i18n.ts._chat.invitations }} ({{ invitations.length }})</span>
				</div>
				<div v-for="iv in invitations" :key="`inv:${iv.id}`" :class="[$style.item, $style.inviteItem]">
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
			<button
				v-for="entry in roomEntries"
				:key="`room:${entry.id}`"
				v-memo="[entry.id === activeRoomId, entry.isRead, entry.hasUnreadMention, entry.lastMessage?.id, entry.room.name, entry.room.avatarUrl]"
				class="_button"
				:class="[$style.item, { [$style.itemActive]: entry.id === activeRoomId, [$style.itemUnread]: !entry.isRead }]"
				@click="openRoom(entry)"
			>
				<XRoomAvatar :room="entry.room" :class="$style.itemAvatar"/>
				<div :class="$style.itemBody">
					<div :class="$style.itemHeader">
						<span :class="$style.itemName">{{ entry.room.name }}</span>
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

			<div :class="$style.sectionTitle">
				<i class="ti ti-user"></i>
				<span>{{ i18n.ts._chat.directMessages }}</span>
			</div>
			<div v-if="userEntries.length === 0" :class="$style.empty">{{ i18n.ts._chat.noHistory }}</div>
			<button
				v-for="entry in userEntries"
				:key="`user:${entry.id}`"
				v-memo="[entry.id === activeUserId, entry.isRead, entry.isMe, entry.lastMessage.id, entry.other.name, entry.other.avatarUrl]"
				class="_button"
				:class="[$style.item, { [$style.itemActive]: entry.id === activeUserId, [$style.itemUnread]: !entry.isRead && !entry.isMe }]"
				@click="openUser(entry)"
			>
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
		</template>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onActivated, onDeactivated, onMounted, ref } from 'vue';
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

const $i = ensureSignin();
const router = useRouter();

defineProps<{
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

const initializing = ref(true);
const fetching = ref(false);
const roomEntries = ref<RoomEntry[]>([]);
const userEntries = ref<UserEntry[]>([]);
// 收到的房间邀请（新布局会跳过聊天首页，故在侧边栏顶部直接显示，可一键加入/忽略）。
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);

// 参加中/作成済みルーム（メッセージが無いルームの補完用）。変化が少ないためポーリングごとには取得しない。
const knownRooms = ref<Map<string, Misskey.entities.ChatRoom>>(new Map());
let roomListLoaded = false;
let firstConversationEmitted = false;

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
	if (fetching.value) return;
	fetching.value = true;

	try {
		if (!roomListLoaded) await fetchRoomList();
		await Promise.all([fetchConversations(), fetchInvitations()]);
	} finally {
		fetching.value = false;
	}
}

// ポーリング用：会話一覧（履歴）のみ更新。ルーム一覧は叩かない。
async function pollConversations() {
	if (fetching.value) return;
	fetching.value = true;

	try {
		await Promise.all([fetchConversations(), fetchInvitations()]);
	} finally {
		fetching.value = false;
	}
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

let isActivated = true;

onActivated(() => {
	isActivated = true;
	// ページ復帰時はルーム一覧も更新（新規参加ルームの反映）
	roomListLoaded = false;
	fetchAll();
});

onDeactivated(() => {
	isActivated = false;
});

// ポーリングは履歴(未読/最新メッセージ)のみ。ルーム一覧は変化が少ないため叩かない（高並列時の負荷削減）
useInterval(() => {
	if (!window.document.hidden && isActivated) {
		pollConversations();
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

onMounted(() => {
	fetchAll();
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
	overflow: hidden;
	text-overflow: ellipsis;
	font-weight: 700;
	font-size: 0.95em;
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
