<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps" :class="$style.root">
	<div :class="$style.summary">
		<div>
			<div :class="$style.summaryTitle">{{ i18n.ts._chat.members }}</div>
			<div :class="$style.summarySub">{{ room.memberCount }} / {{ room.memberLimit }}</div>
		</div>
		<MkButton v-if="canModerateRoom" primary rounded @click="emit('inviteUser')"><i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}</MkButton>
	</div>

	<div :class="$style.memberTools" data-chat-room-members-search>
		<MkInput v-model="memberSearchQuery" type="search" :placeholder="i18n.ts.searchUser" debounce :class="$style.searchInput">
			<template #prefix><i class="ti ti-search"></i></template>
		</MkInput>
		<button v-if="memberSearchActive" class="_button" :class="$style.clearSearchButton" :title="i18n.ts.reset" :aria-label="i18n.ts.reset" @click="memberSearchQuery = ''">
			<i class="ti ti-x"></i>
		</button>
	</div>

	<div v-if="showOwnerSection" :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-crown"></i>
			<span>{{ i18n.ts._chat.roomOwner }}</span>
		</div>
		<MkA :class="$style.userLink" :to="`${userPage(room.owner)}`">
			<MkUserCardMini :user="room.owner" :withChart="false"/>
		</MkA>
	</div>

	<div :class="$style.section">
		<div :class="$style.sectionHeader">
			<div :class="$style.sectionTitle">
				<i class="ti ti-shield-check"></i>
				<span>{{ i18n.ts._chat.roomManagers }}</span>
			</div>
			<span :class="$style.sectionCount">{{ managerMemberships.length }}</span>
		</div>

		<MkLoading v-if="membersFetching"/>
		<MkError v-else-if="membersError" @retry="initMembers"/>
		<div v-else-if="managerMemberships.length === 0" :class="$style.empty">{{ memberSearchActive ? i18n.ts.noUsers : i18n.ts._chat.noRoomManagers }}</div>
		<div v-else :class="[$style.userList, $style.scrollList]" data-chat-room-members-scroll-list>
			<div v-for="membership in managerMemberships" :key="membership.id" :class="$style.memberRow">
				<MkA :class="[$style.userLink, $style.memberRowLink]" :to="`${userPage(membership.user!)}`">
					<MkUserCardMini :user="membership.user!" :withChart="false"/>
				</MkA>
				<div :class="$style.roleBadge">
					<i class="ti ti-shield-check"></i>
					<span>{{ i18n.ts._chat.roomManager }}</span>
				</div>
				<div v-if="isMemberMuted(membership)" :class="$style.mutedBadge" :title="mutedBadgeText(membership)">
					<i class="ti ti-microphone-off"></i>
					<span>{{ mutedBadgeText(membership) }}</span>
				</div>
				<MkButton v-if="canChangeMemberRole(membership)" rounded small :class="$style.roleActionButton" @click="updateMemberRole(membership, 'member')">
					<i class="ti ti-shield-x"></i>
					<span>{{ i18n.ts._chat.unsetRoomManager }}</span>
				</MkButton>
				<button v-if="canOpenMemberMenu(membership)" class="_button" :class="$style.memberMenuButton" :title="i18n.ts.menu" :aria-label="i18n.ts.menu" @click="openMemberMenu(membership, $event)">
					<i class="ti ti-dots"></i>
				</button>
			</div>
		</div>
	</div>

	<div :class="$style.section">
		<div :class="$style.sectionHeader">
			<div :class="$style.sectionTitle">
				<i class="ti ti-users"></i>
				<span>{{ i18n.ts._chat.members }}</span>
			</div>
			<span :class="$style.sectionCount">{{ memberMemberships.length }}</span>
		</div>

		<MkLoading v-if="membersFetching"/>
		<MkError v-else-if="membersError" @retry="initMembers"/>
		<div v-else-if="memberMemberships.length === 0" :class="$style.empty">{{ i18n.ts.noUsers }}</div>
		<div v-else :class="[$style.userList, $style.scrollList]" data-chat-room-members-scroll-list>
			<div v-for="membership in memberMemberships" :key="membership.id" :class="$style.memberRow">
				<MkA :class="[$style.userLink, $style.memberRowLink]" :to="`${userPage(membership.user!)}`">
					<MkUserCardMini :user="membership.user!" :withChart="false"/>
				</MkA>
				<div v-if="isMemberMuted(membership)" :class="$style.mutedBadge" :title="mutedBadgeText(membership)">
					<i class="ti ti-microphone-off"></i>
					<span>{{ mutedBadgeText(membership) }}</span>
				</div>
				<MkButton v-if="canChangeMemberRole(membership)" primary rounded small :class="$style.roleActionButton" @click="updateMemberRole(membership, 'manager')">
					<i class="ti ti-shield-check"></i>
					<span>{{ i18n.ts._chat.setRoomManager }}</span>
				</MkButton>
				<button v-if="canOpenMemberMenu(membership)" class="_button" :class="$style.memberMenuButton" :title="i18n.ts.menu" :aria-label="i18n.ts.menu" @click="openMemberMenu(membership, $event)">
					<i class="ti ti-dots"></i>
				</button>
			</div>
		</div>

		<MkButton v-if="membersCanFetchMore" rounded :wait="membersMoreFetching" :class="$style.moreButton" @click="fetchMoreMembers">{{ i18n.ts.loadMore }}</MkButton>
	</div>

	<div v-if="canModerateRoom" :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-mail-forward"></i>
			<span>{{ i18n.ts._chat.sentInvitations }}</span>
		</div>

		<MkLoading v-if="invitationsFetching"/>
		<MkError v-else-if="invitationsError" @retry="initInvitations"/>
		<div v-else-if="invitations.length === 0" :class="$style.empty">{{ i18n.ts._chat.noInvitations }}</div>
		<div v-else :class="$style.userList">
			<MkA v-for="invitation in invitations" :key="invitation.id" :class="$style.userLink" :to="`${userPage(invitation.user)}`">
				<MkUserCardMini :user="invitation.user" :withChart="false"/>
			</MkA>
		</div>

		<MkButton v-if="invitationsCanFetchMore" rounded :wait="invitationsMoreFetching" :class="$style.moreButton" @click="fetchMoreInvitations">{{ i18n.ts.loadMore }}</MkButton>
	</div>

</div>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';
import { ensureSignin } from '@/i.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkError from '@/components/global/MkError.vue';
import { dateString } from '@/filters/date.js';

const $i = ensureSignin();
const LIMIT = 30;
const MANAGER_LIMIT = 100;

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
	refreshKey?: number;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const canModerateRoom = computed(() => (props.room.canModerateRoom ?? props.room.canManage ?? false) || isOwner.value);
const canManageRoomRoles = computed(() => (props.room.canManageRoomRoles ?? false) || isOwner.value);
const memberSearchQuery = ref('');
const normalizedMemberSearchQuery = computed(() => memberSearchQuery.value.trim().normalize('NFC'));
const memberSearchActive = computed(() => normalizedMemberSearchQuery.value !== '');

// user が解決できない(削除/凍結など)メンバーは表示しない。ページングは元のmembershipsを使う
const visibleMemberships = computed(() => memberships.value
	.filter(m => m.user != null)
	.filter(m => userMatchesMemberSearch(m.user!)));
const managerMemberships = computed(() => visibleMemberships.value.filter(m => m.role === 'manager'));
const memberMemberships = computed(() => visibleMemberships.value.filter(m => m.role !== 'manager'));
const showOwnerSection = computed(() => !memberSearchActive.value || userMatchesMemberSearch(props.room.owner));

function userMatchesMemberSearch(user: Misskey.entities.UserLite): boolean {
	const query = normalizedMemberSearchQuery.value.toLowerCase();
	if (query === '') return true;
	return [
		user.id,
		user.username,
		user.name ?? '',
		user.host == null ? `@${user.username}` : `@${user.username}@${user.host}`,
	].some(value => value.toLowerCase().includes(query));
}

function isPermanentMute(mutedUntil: string) {
	return new Date(mutedUntil).getFullYear() >= 9999;
}

function isMemberMuted(membership: Misskey.entities.ChatRoomMembership) {
	return membership.mutedUntil != null && Date.parse(membership.mutedUntil) > Date.now();
}

function mutedBadgeText(membership: Misskey.entities.ChatRoomMembership) {
	if (membership.mutedUntil == null) return '';
	if (isPermanentMute(membership.mutedUntil)) return i18n.ts._chat.mutedForever;
	return i18n.tsx._chat.mutedUntil({ time: dateString(membership.mutedUntil) });
}

function canModerateMember(membership: Misskey.entities.ChatRoomMembership) {
	if (!canModerateRoom.value) return false;
	if (membership.userId === props.room.ownerId || membership.userId === $i.id) return false;
	if (membership.user?.isAdmin === true || membership.user?.isModerator === true) return false;
	if (membership.role === 'manager' && !canManageRoomRoles.value) return false;
	return true;
}

function canChangeMemberRole(membership: Misskey.entities.ChatRoomMembership) {
	if (!canManageRoomRoles.value) return false;
	if (membership.userId === props.room.ownerId || membership.userId === $i.id) return false;
	if (membership.user?.isAdmin === true || membership.user?.isModerator === true) return false;
	return true;
}

function canOpenMemberMenu(membership: Misskey.entities.ChatRoomMembership) {
	return canModerateMember(membership);
}

async function updateMemberRole(membership: Misskey.entities.ChatRoomMembership, role: 'member' | 'manager') {
	const updated = await os.apiWithDialog('chat/rooms/members/update-role', {
		roomId: props.room.id,
		userId: membership.userId,
		role,
	});
	const index = memberships.value.findIndex(m => m.id === membership.id);
	if (index !== -1) {
		memberships.value[index] = {
			...memberships.value[index],
			...updated,
		};
	}
}

async function kickMember(membership: Misskey.entities.ChatRoomMembership, ban: boolean) {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: ban ? i18n.ts._chat.kickAndBanUserConfirm : i18n.ts._chat.kickUserConfirm,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/kick', {
		roomId: props.room.id,
		userId: membership.userId,
		ban,
	});
	memberships.value = memberships.value.filter(m => m.id !== membership.id);
}

async function muteMember(membership: Misskey.entities.ChatRoomMembership, durationMs: number | null) {
	const expiresAt = durationMs == null ? null : Date.now() + durationMs;
	await os.apiWithDialog('chat/rooms/mute-member', {
		roomId: props.room.id,
		userId: membership.userId,
		expiresAt,
	});
	membership.mutedUntil = expiresAt == null ? '9999-12-31T23:59:59.000Z' : new Date(expiresAt).toISOString();
}

async function unmuteMember(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/unmute-member', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	membership.mutedUntil = null;
}

function openMemberMenu(membership: Misskey.entities.ChatRoomMembership, ev: MouseEvent) {
	const menuItems: MenuItem[] = [];

	if (isMemberMuted(membership)) {
		menuItems.push({
			text: i18n.ts._chat.unmuteMember,
			icon: 'ti ti-microphone',
			action: () => unmuteMember(membership),
		});
	} else {
		menuItems.push({
			type: 'parent',
			text: i18n.ts._chat.muteMember,
			icon: 'ti ti-microphone-off',
			children: [{
				text: i18n.ts._chat.muteFor10Minutes,
				action: () => muteMember(membership, 1000 * 60 * 10),
			}, {
				text: i18n.ts._chat.muteFor1Hour,
				action: () => muteMember(membership, 1000 * 60 * 60),
			}, {
				text: i18n.ts._chat.muteFor1Day,
				action: () => muteMember(membership, 1000 * 60 * 60 * 24),
			}, {
				text: i18n.ts._chat.muteForever,
				action: () => muteMember(membership, null),
			}],
		});
	}

	menuItems.push({ type: 'divider' }, {
		text: i18n.ts._chat.kickUser,
		icon: 'ti ti-user-x',
		danger: true,
		action: () => kickMember(membership, false),
	}, {
		text: i18n.ts._chat.kickAndBanUser,
		icon: 'ti ti-ban',
		danger: true,
		action: () => kickMember(membership, true),
	});

	os.popupMenu(menuItems, (ev.currentTarget ?? ev.target) as HTMLElement);
}

const memberships = ref<Misskey.entities.ChatRoomMembership[]>([]);
const invitations = ref<Misskey.entities.ChatRoomInvitation[]>([]);
const membersFetching = ref(true);
const membersMoreFetching = ref(false);
const membersError = ref(false);
const membersCanFetchMore = ref(false);
const invitationsFetching = ref(false);
const invitationsMoreFetching = ref(false);
const invitationsError = ref(false);
const invitationsCanFetchMore = ref(false);
let disposed = false;
let membersRequestId = 0;
let invitationsRequestId = 0;

async function initMembers() {
	const requestId = ++membersRequestId;
	membersFetching.value = true;
	membersError.value = false;
	membersCanFetchMore.value = false;
	try {
		const [managers, members] = await Promise.all([
			misskeyApi('chat/rooms/members', {
				roomId: props.room.id,
				role: 'manager',
				limit: MANAGER_LIMIT,
				...(memberSearchActive.value ? { query: normalizedMemberSearchQuery.value } : {}),
			}),
			misskeyApi('chat/rooms/members', {
				roomId: props.room.id,
				role: 'member',
				limit: LIMIT,
				...(memberSearchActive.value ? { query: normalizedMemberSearchQuery.value } : {}),
			}),
		]);
		if (disposed || requestId !== membersRequestId) return;
		memberships.value = [...managers, ...members];
		membersCanFetchMore.value = members.length >= LIMIT;
	} catch {
		if (disposed || requestId !== membersRequestId) return;
		membersError.value = true;
	} finally {
		if (!disposed && requestId === membersRequestId) {
			membersFetching.value = false;
		}
	}
}

async function fetchMoreMembers() {
	const untilId = memberMemberships.value.at(-1)?.id;
	if (untilId == null || membersMoreFetching.value) return;

	const requestId = membersRequestId;
	membersMoreFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/members', {
			roomId: props.room.id,
			role: 'member',
			limit: LIMIT,
			untilId,
			...(memberSearchActive.value ? { query: normalizedMemberSearchQuery.value } : {}),
		});
		if (disposed || requestId !== membersRequestId) return;
		memberships.value = [...memberships.value, ...res];
		membersCanFetchMore.value = res.length >= LIMIT;
	} catch {
		if (disposed || requestId !== membersRequestId) return;
		membersError.value = true;
	} finally {
		if (!disposed && requestId === membersRequestId) {
			membersMoreFetching.value = false;
		}
	}
}

async function initInvitations() {
	if (!canModerateRoom.value) {
		invitationsRequestId++;
		invitations.value = [];
		invitationsCanFetchMore.value = false;
		return;
	}

	const requestId = ++invitationsRequestId;
	invitationsFetching.value = true;
	invitationsError.value = false;
	invitationsCanFetchMore.value = false;
	try {
		const res = await misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: LIMIT,
		});
		if (disposed || requestId !== invitationsRequestId) return;
		invitations.value = res;
		invitationsCanFetchMore.value = res.length >= LIMIT;
	} catch {
		if (disposed || requestId !== invitationsRequestId) return;
		invitationsError.value = true;
	} finally {
		if (!disposed && requestId === invitationsRequestId) {
			invitationsFetching.value = false;
		}
	}
}

async function fetchMoreInvitations() {
	const untilId = invitations.value.at(-1)?.id;
	if (untilId == null || invitationsMoreFetching.value) return;

	const requestId = invitationsRequestId;
	invitationsMoreFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/invitations/outbox', {
			roomId: props.room.id,
			limit: LIMIT,
			untilId,
		});
		if (disposed || requestId !== invitationsRequestId) return;
		invitations.value = [...invitations.value, ...res];
		invitationsCanFetchMore.value = res.length >= LIMIT;
	} catch {
		if (disposed || requestId !== invitationsRequestId) return;
		invitationsError.value = true;
	} finally {
		if (!disposed && requestId === invitationsRequestId) {
			invitationsMoreFetching.value = false;
		}
	}
}

onMounted(async () => {
	await Promise.all([
		initMembers(),
		initInvitations(),
	]);
});

watch(() => props.room.id, async () => {
	memberSearchQuery.value = '';
	memberships.value = [];
	invitations.value = [];
	await Promise.all([
		initMembers(),
		initInvitations(),
	]);
});

watch(() => props.refreshKey, () => {
	initMembers();
	initInvitations();
});

watch(normalizedMemberSearchQuery, () => {
	memberships.value = [];
	initMembers();
});

onBeforeUnmount(() => {
	disposed = true;
	membersRequestId++;
	invitationsRequestId++;
});
</script>

<style lang="scss" module>
.root {
	width: 100%;
	max-width: 100%;
	min-width: 0;
	min-height: max-content;
	padding-bottom: max(28px, calc(16px + env(safe-area-inset-bottom)));
	box-sizing: border-box;
}

.summary {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 16px;
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.1);
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.72);
}

.summaryTitle {
	font-weight: 700;
}

.summarySub {
	margin-top: 2px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.68);
	font-size: 0.9em;
}

	.searchInput {
		flex: 1 1 auto;
		min-width: 0;
	}

	.memberTools {
		display: flex;
		align-items: stretch;
		gap: 8px;
		min-width: 0;
		padding: 10px;
		border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.1);
		border-radius: var(--MI-radius);
		background: color(from var(--MI_THEME-panel) srgb r g b / 0.58);
	}

	.clearSearchButton {
		display: grid;
		place-items: center;
		flex: 0 0 auto;
		width: 36px;
		min-height: 36px;
		border-radius: 999px;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.72);

		&:hover {
			background: var(--MI_THEME-buttonHoverBg);
		}
	}

.section {
	display: grid;
	gap: 12px;
	min-width: 0;
}

	.sectionTitle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.72);
	font-size: 0.9em;
		font-weight: 700;
	}

	.sectionHeader {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.sectionCount {
		flex: 0 0 auto;
		min-width: 2.2em;
		padding: 2px 8px;
		border-radius: 999px;
		background: color(from var(--MI_THEME-fg) srgb r g b / 0.07);
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.68);
		font-size: 0.82em;
		font-weight: 700;
		text-align: center;
	}

.userList {
	display: grid;
	gap: 10px;
	min-width: 0;
}

	.scrollList {
		max-height: min(420px, 54dvh);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 4px;
		scrollbar-gutter: stable;
	}

.userLink {
	display: block;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.memberRow {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.memberRowLink {
	flex: 1;
	min-width: 0;
}

.mutedBadge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex: 0 0 auto;
	max-width: 40%;
	padding: 4px 10px;
	border-radius: 999px;
	background: color(from var(--MI_THEME-warn) srgb r g b / 0.15);
	color: var(--MI_THEME-warn);
	font-size: 0.8em;

	> span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.roleBadge {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	flex: 0 0 auto;
	max-width: 40%;
	padding: 4px 10px;
	border-radius: 999px;
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.14);
	color: var(--MI_THEME-accent);
	font-size: 0.8em;
	font-weight: 700;

	> span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
}

.roleActionButton {
	flex: 0 0 auto;
	white-space: nowrap;

	:global(.ti) {
		margin-right: 4px;
	}
}

.memberMenuButton {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 34px;
	height: 34px;
	border-radius: 999px;

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.empty {
	padding: 22px 16px;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.62);
	text-align: center;
	border: dashed 1px color(from var(--MI_THEME-fg) srgb r g b / 0.16);
	border-radius: var(--MI-radius-sm);
}

.moreButton {
	margin: 0 auto;
}

@container (max-width: 520px) {
	.summary {
		align-items: stretch;
		flex-direction: column;
	}
}
</style>
