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
		<MkButton v-if="isOwner" primary rounded @click="emit('inviteUser')"><i class="ti ti-plus"></i> {{ i18n.ts._chat.inviteUser }}</MkButton>
	</div>

	<div :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-crown"></i>
			<span>{{ i18n.ts.administrator }}</span>
		</div>
		<MkA :class="$style.userLink" :to="`${userPage(room.owner)}`">
			<MkUserCardMini :user="room.owner" :withChart="false"/>
		</MkA>
	</div>

	<div :class="$style.section">
		<div :class="$style.sectionTitle">
			<i class="ti ti-users"></i>
			<span>{{ i18n.ts._chat.members }}</span>
		</div>

		<MkLoading v-if="membersFetching"/>
		<MkError v-else-if="membersError" @retry="initMembers"/>
		<div v-else-if="memberships.length === 0" :class="$style.empty">{{ i18n.ts.noUsers }}</div>
		<div v-else :class="$style.userList">
			<MkA v-for="membership in memberships" :key="membership.id" :class="$style.userLink" :to="`${userPage(membership.user!)}`">
				<MkUserCardMini :user="membership.user!" :withChart="false"/>
			</MkA>
		</div>

		<MkButton v-if="membersCanFetchMore" rounded :wait="membersMoreFetching" :class="$style.moreButton" @click="fetchMoreMembers">{{ i18n.ts.loadMore }}</MkButton>
	</div>

	<div v-if="isOwner" :class="$style.section">
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
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';
import { ensureSignin } from '@/i.js';
import MkLoading from '@/components/global/MkLoading.vue';
import MkError from '@/components/global/MkError.vue';

const $i = ensureSignin();
const LIMIT = 30;

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'inviteUser'): void,
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

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
		const res = await misskeyApi('chat/rooms/members', {
			roomId: props.room.id,
			limit: LIMIT,
		});
		if (disposed || requestId !== membersRequestId) return;
		memberships.value = res;
		membersCanFetchMore.value = res.length >= LIMIT;
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
	const untilId = memberships.value.at(-1)?.id;
	if (untilId == null || membersMoreFetching.value) return;

	const requestId = membersRequestId;
	membersMoreFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/members', {
			roomId: props.room.id,
			limit: LIMIT,
			untilId,
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
	if (!isOwner.value) {
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
	memberships.value = [];
	invitations.value = [];
	await Promise.all([
		initMembers(),
		initInvitations(),
	]);
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

.userList {
	display: grid;
	gap: 10px;
	min-width: 0;
}

.userLink {
	display: block;
	min-width: 0;

	&:hover {
		text-decoration: none;
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
