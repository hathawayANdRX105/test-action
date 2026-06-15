<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1100px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ph-chats-circle ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts.chatSettings }}</template>
				<template v-if="serverForm.modified.value" #footer>
					<MkFormFooter :form="serverForm" :canSaving="serverFormCanSave"/>
				</template>

				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts._adminChatSettings.adminOnly }}</MkInfo>

					<MkSelect v-model="serverForm.state.chatAvailability">
						<template #label>{{ i18n.ts.chatAvailability }}<span v-if="serverForm.modifiedStates.chatAvailability" class="_modified">{{ i18n.ts.modified }}</span></template>
						<option value="available">{{ i18n.ts.enabled }}</option>
						<option value="readonly">{{ i18n.ts.readonly }}</option>
						<option value="unavailable">{{ i18n.ts.disabled }}</option>
					</MkSelect>

					<MkInput v-model="serverForm.state.chatRoomDefaultMemberLimit" type="number" :min="MIN_LIMIT" :max="MAX_LIMIT">
						<template #label>{{ i18n.ts.chatRoomDefaultMemberLimit }}<span v-if="serverForm.modifiedStates.chatRoomDefaultMemberLimit" class="_modified">{{ i18n.ts.modified }}</span></template>
						<template #caption>{{ i18n.tsx.inputRangeError({ min: MIN_LIMIT, max: MAX_LIMIT }) }}</template>
					</MkInput>

					<MkInfo v-if="!serverFormCanSave" warn>{{ i18n.tsx.inputRangeError({ min: MIN_LIMIT, max: MAX_LIMIT }) }}</MkInfo>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ph-warning-octagon ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts._adminChatSettings.emergencyControls }}</template>

				<div class="_gaps_m">
					<MkSwitch v-model="emergencyMode">
						<template #label>{{ i18n.ts._adminChatSettings.emergencyMode }}</template>
						<template #caption>{{ i18n.ts._adminChatSettings.emergencyModeCaption }}</template>
					</MkSwitch>
					<MkInfo v-if="emergencyMode" warn>{{ i18n.ts._adminChatSettings.emergencyModeActive }}</MkInfo>

					<MkInput v-model="retentionDays" type="number" :min="0" :max="3650">
						<template #label>{{ i18n.ts._adminChatSettings.messageRetentionDays }}</template>
						<template #caption>{{ i18n.ts._adminChatSettings.messageRetentionCaption }}</template>
					</MkInput>

					<MkTextarea v-model="bannedKeywords">
						<template #label>{{ i18n.ts._adminChatSettings.bannedKeywords }}</template>
						<template #caption>{{ i18n.ts._adminChatSettings.bannedKeywordsCaption }}</template>
					</MkTextarea>

					<div class="_buttons">
						<MkButton primary rounded :wait="savingEmergency" @click="saveEmergency"><i class="ph-check ph-bold ph-lg"></i> {{ i18n.ts.save }}</MkButton>
						<MkButton rounded danger :wait="purging" @click="purgeKeywords"><i class="ph-trash ph-bold ph-lg"></i> {{ i18n.ts._adminChatSettings.purgeKeywordHistory }}</MkButton>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ph-list-magnifying-glass ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts._adminChatSettings.rooms }}</template>

				<div class="_gaps_m">
					<div :class="$style.filters">
						<MkInput v-model="roomQuery" type="search" debounce :class="$style.filterInput">
							<template #prefix><i class="ti ti-search"></i></template>
							<template #label>{{ i18n.ts.search }}</template>
							<template #caption>{{ i18n.ts._adminChatSettings.searchCaption }}</template>
						</MkInput>
						<MkSelect v-model="joinModeFilter" :class="$style.filterSelect">
							<template #label>{{ i18n.ts._chat.roomJoinMode }}</template>
							<option value="all">{{ i18n.ts.all }}</option>
							<option value="inviteOnly">{{ i18n.ts._chat.inviteOnlyRoom }}</option>
							<option value="open">{{ i18n.ts._chat.openRoom }}</option>
							<option value="closed">{{ i18n.ts._chat.closedRoom }}</option>
						</MkSelect>
						<MkButton rounded @click="reloadRooms"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
					</div>

					<MkLoading v-if="roomsLoading"/>
					<MkError v-else-if="roomsError" @retry="reloadRooms"/>
					<MkResult v-else-if="rooms.length === 0" type="empty"/>
					<div v-else class="_gaps_s">
						<div :class="$style.paginationBar">
							<MkButton rounded :disabled="roomsPageIndex === 0 || roomsLoading" @click="goToPreviousRoomsPage"><i class="ti ti-chevron-left"></i> {{ i18n.ts._ad.back }}</MkButton>
							<div :class="$style.pageIndicator">{{ i18n.ts.pages }} {{ roomsPageIndex + 1 }}</div>
							<MkButton rounded primary :disabled="!roomsCanFetchMore || roomsLoading" @click="goToNextRoomsPage">{{ i18n.ts.next }} <i class="ti ti-chevron-right"></i></MkButton>
						</div>

						<div :class="$style.roomList">
							<div v-for="item in rooms" :key="item.id" :class="$style.roomRow">
								<div :class="$style.roomTop">
									<div :class="$style.roomTitleLine">
										<div :class="$style.roomName">{{ item.room.name }}</div>
										<span :class="$style.badge">{{ joinModeText(item.room.joinMode) }}</span>
									</div>
									<div :class="$style.roomActions">
										<MkButton rounded :wait="selectingRoomId === item.room.id" @click="selectRoom(item)"><i class="ti ti-settings"></i> {{ i18n.ts._adminChatSettings.manage }}</MkButton>
										<MkButton rounded :wait="loadingMessagesRoomId === item.room.id" @click="openMessages(item)"><i class="ti ti-eye"></i> {{ i18n.ts._adminChatSettings.readOnlyMessages }}</MkButton>
										<MkA :to="`/chat/room/${item.room.id}`" :class="$style.openLink"><i class="ti ti-external-link"></i> {{ i18n.ts._adminChatSettings.openChatRoom }}</MkA>
									</div>
								</div>
								<div :class="$style.roomMain">
									<div :class="$style.roomMeta">
										<span>Room ID: {{ item.room.id }}</span>
										<span>{{ i18n.ts.user }}: @{{ item.room.owner?.username ?? item.room.ownerId }}</span>
									</div>
									<div :class="$style.roomMeta">
										<span>{{ i18n.ts.currentRoomMembers }}: {{ item.memberCount }} / {{ item.memberLimit }}</span>
										<span>{{ i18n.ts.roomMemberLimitOverride }}: {{ item.memberLimitOverride ?? i18n.ts.useDefaultLimit }}</span>
										<span>{{ i18n.ts._adminChatSettings.lastMessage }}: <MkTime v-if="item.lastMessageAt" :time="item.lastMessageAt"/><span v-else>{{ i18n.ts.none }}</span></span>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</MkFolder>

			<div v-if="roomInfo" ref="roomDetailsEl">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ph-users ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts._adminChatSettings.roomDetails }}</template>

				<div class="_gaps_m">
					<div class="_gaps_m _panel" style="padding: 16px;">
						<div :class="$style.roomHeader">
							<div>
								<div :class="$style.roomName">{{ roomInfo.room.name }}</div>
								<div :class="$style.roomId">{{ roomInfo.room.id }}</div>
							</div>
							<MkA :to="`/chat/room/${roomInfo.room.id}`" class="_link">{{ i18n.ts._adminChatSettings.openChatRoom }}</MkA>
						</div>

						<div :class="$style.stats">
							<div><span>{{ i18n.ts.currentRoomMembers }}</span><b>{{ roomInfo.memberCount }}</b></div>
							<div><span>{{ i18n.ts.chatRoomDefaultMemberLimit }}</span><b>{{ roomInfo.defaultMemberLimit }}</b></div>
							<div><span>{{ i18n.ts.effectiveRoomMemberLimit }}</span><b>{{ roomInfo.memberLimit }}</b></div>
							<div><span>{{ i18n.ts.roomMemberLimitOverride }}</span><b>{{ roomInfo.memberLimitOverride ?? i18n.ts.useDefaultLimit }}</b></div>
						</div>

						<MkInput v-model="roomLimitOverride" type="number" :min="MIN_LIMIT" :max="MAX_LIMIT" :placeholder="String(roomInfo.defaultMemberLimit)">
							<template #label>{{ i18n.ts.roomMemberLimitOverride }}</template>
							<template #caption>{{ i18n.ts.useDefaultLimit }}: {{ i18n.ts.clear }}</template>
						</MkInput>

						<MkInfo v-if="!roomLimitCanSave" warn>{{ i18n.tsx.inputRangeError({ min: MIN_LIMIT, max: MAX_LIMIT }) }}</MkInfo>

						<MkSelect v-model="roomJoinMode">
							<template #label>{{ i18n.ts._chat.roomJoinMode }}</template>
							<option value="inviteOnly">{{ i18n.ts._chat.inviteOnlyRoom }}</option>
							<option value="open">{{ i18n.ts._chat.openRoom }}</option>
							<option value="closed">{{ i18n.ts._chat.closedRoom }}</option>
						</MkSelect>

						<div class="_buttons">
							<MkButton primary rounded :disabled="!roomLimitCanSave" @click="saveRoomLimit"><i class="ph-check ph-bold ph-lg"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton rounded @click="clearRoomLimit"><i class="ph-eraser ph-bold ph-lg"></i> {{ i18n.ts.useDefaultLimit }}</MkButton>
							<MkButton rounded :disabled="!roomInfo || roomJoinMode === roomInfo.room.joinMode" @click="saveRoomJoinMode"><i class="ph-arrows-clockwise ph-bold ph-lg"></i> {{ i18n.ts._adminChatSettings.saveRoomJoinMode }}</MkButton>
						</div>
					</div>
				</div>
			</MkFolder>
			</div>

			<div v-if="messageRoom" ref="messagesEl">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-eye"></i></template>
				<template #label>{{ i18n.ts._adminChatSettings.readOnlyMessages }}: {{ messageRoom.room.name }}</template>

				<div class="_gaps_m">
					<MkInfo warn>{{ i18n.ts._adminChatSettings.readOnlyNotice }}</MkInfo>
					<div class="_buttons">
						<MkButton rounded @click="loadMessages(true)"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
						<MkA :to="`/chat/room/${messageRoom.room.id}`" class="_link">{{ i18n.ts._adminChatSettings.openChatRoom }}</MkA>
					</div>
					<MkLoading v-if="messagesLoading"/>
					<MkError v-else-if="messagesError" @retry="loadMessages(true)"/>
					<MkResult v-else-if="messages.length === 0" type="empty" :text="i18n.ts._chat.noMessagesYet"/>
					<div v-else class="_gaps_s">
						<div v-for="message in messages" :key="message.id" :class="$style.messageItem">
							<div :class="$style.messageHeader">
								<span>@{{ message.fromUser.username }}</span>
								<MkTime :time="message.createdAt" mode="detail"/>
							</div>
							<Mfm v-if="message.text" :text="message.text" :class="$style.messageText" :nyaize="'respect'"/>
							<MkMediaList v-if="message.file" :mediaList="[message.file]" :class="$style.messageMedia"/>
						</div>
						<MkButton v-if="messagesCanFetchMore" rounded primary :wait="messagesMoreFetching" @click="loadMoreMessages"><i class="ti ti-chevron-down"></i> {{ i18n.ts.loadMore }}</MkButton>
					</div>
				</div>
			</MkFolder>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkMediaList from '@/components/MkMediaList.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useForm } from '@/use/use-form.js';
import { iAmAdmin } from '@/i.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 10000;

type AdminChatRoomListItem = Misskey.entities.AdminChatRoomsListResponse[number];
type AdminChatRoomInfo = {
	room: Misskey.entities.ChatRoom;
	memberCount: number;
	defaultMemberLimit: number;
	memberLimitOverride: number | null;
	memberLimit: number;
};
type ChatRoomJoinMode = Misskey.entities.ChatRoom['joinMode'];

if (!iAmAdmin) {
	throw new Error('admin required');
}

const meta = await misskeyApi('admin/meta') as Misskey.entities.AdminMetaResponse;

const serverForm = useForm({
	chatAvailability: meta?.policies.chatAvailability ?? 'available',
	chatRoomDefaultMemberLimit: meta?.chatRoomDefaultMemberLimit ?? 500,
}, async (state) => {
	const nextLimit = Number(state.chatRoomDefaultMemberLimit);
	if (!isValidLimit(nextLimit)) return;

	await os.apiWithDialog('admin/update-meta', {
		chatRoomDefaultMemberLimit: nextLimit,
	});

	if (meta.policies.chatAvailability !== state.chatAvailability) {
		await os.apiWithDialog('admin/roles/update-default-policies', {
			policies: {
				...meta.policies,
				chatAvailability: state.chatAvailability,
			},
		});
	}

	await fetchInstance(true);
});

const serverFormCanSave = computed(() => isValidLimit(Number(serverForm.state.chatRoomDefaultMemberLimit)));

// 紧急控制：紧急模式 / 统一保持期 / 全站关键词
const emergencyMode = ref<boolean>(meta?.chatEmergencyMode ?? false);
const retentionDays = ref<number | string>(meta?.chatMessageRetentionDays ?? 0);
const bannedKeywords = ref<string>((meta?.chatBannedKeywords ?? []).join('\n'));
const savingEmergency = ref(false);
const purging = ref(false);

function parseKeywords(): string[] {
	return Array.from(new Set(bannedKeywords.value.split('\n').map(k => k.trim()).filter(k => k.length > 0))).slice(0, 200);
}

async function saveEmergency() {
	savingEmergency.value = true;
	try {
		await os.apiWithDialog('admin/update-meta', {
			chatEmergencyMode: emergencyMode.value,
			chatMessageRetentionDays: Math.max(0, Math.min(3650, Math.floor(Number(retentionDays.value) || 0))),
			chatBannedKeywords: parseKeywords(),
		});
		await fetchInstance(true);
	} finally {
		savingEmergency.value = false;
	}
}

async function purgeKeywords() {
	const kws = parseKeywords();
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._adminChatSettings.purgeKeywordConfirm,
	});
	if (canceled) return;
	purging.value = true;
	try {
		const res = await os.apiWithDialog('admin/chat/purge-keyword', kws.length > 0 ? { keywords: kws } : {});
		await os.alert({
			type: 'success',
			text: i18n.tsx._adminChatSettings.purgeKeywordDone({ n: (res as { deleted: number }).deleted }),
		});
	} finally {
		purging.value = false;
	}
}

const roomInfo = ref<AdminChatRoomInfo | null>(null);
const roomLimitOverride = ref<string | number>('');
const roomJoinMode = ref<ChatRoomJoinMode>('inviteOnly');
const roomQuery = ref('');
const joinModeFilter = ref<'all' | ChatRoomJoinMode>('all');
const roomDetailsEl = useTemplateRef<HTMLElement>('roomDetailsEl');
const messagesEl = useTemplateRef<HTMLElement>('messagesEl');
const rooms = ref<AdminChatRoomListItem[]>([]);
const roomsLoading = ref(false);
const roomsError = ref(false);
const roomsCanFetchMore = ref(false);
const roomsPageIndex = ref(0);
const roomsPageCursors = ref<(string | null)[]>([null]);
const messageRoom = ref<AdminChatRoomListItem | null>(null);
const messages = ref<Misskey.entities.AdminChatRoomsMessagesResponse>([]);
const messagesLoading = ref(false);
const messagesMoreFetching = ref(false);
const messagesError = ref(false);
const messagesCanFetchMore = ref(false);
const selectingRoomId = ref<string | null>(null);
const loadingMessagesRoomId = ref<string | null>(null);

const ROOMS_LIMIT = 20;
const MESSAGES_LIMIT = 30;
let roomsLoadRequestId = 0;
let messagesLoadRequestId = 0;

const roomLimitCanSave = computed(() => {
	if (roomLimitOverride.value === '') return false;
	return isValidLimit(Number(roomLimitOverride.value));
});

function isValidLimit(value: number) {
	return Number.isInteger(value) && value >= MIN_LIMIT && value <= MAX_LIMIT;
}

async function selectRoom(item: AdminChatRoomListItem) {
	selectingRoomId.value = item.room.id;
	try {
		const loaded = await misskeyApi<AdminChatRoomInfo>('admin/chat/rooms/show', {
			roomId: item.room.id,
		});
		roomInfo.value = loaded;
		roomLimitOverride.value = loaded.memberLimitOverride ?? '';
		roomJoinMode.value = loaded.room.joinMode;
		await scrollToRoomDetails();
	} catch (err) {
		os.alert({
			type: 'error',
			text: err instanceof Error ? err.message : String(err),
		});
	} finally {
		selectingRoomId.value = null;
	}
}

async function saveRoomLimit() {
	if (!roomInfo.value || !roomLimitCanSave.value) return;

	const currentRoom = roomInfo.value;
	const updated = await os.apiWithDialog<AdminChatRoomInfo>('admin/chat/rooms/update', {
		roomId: currentRoom.room.id,
		memberLimitOverride: Number(roomLimitOverride.value),
	});
	roomInfo.value = updated;
	roomLimitOverride.value = updated.memberLimitOverride ?? '';
	roomJoinMode.value = updated.room.joinMode;
	updateRoomListItem(updated);
	await os.success();
}

async function clearRoomLimit() {
	if (!roomInfo.value) return;

	const currentRoom = roomInfo.value;
	const updated = await os.apiWithDialog<AdminChatRoomInfo>('admin/chat/rooms/update', {
		roomId: currentRoom.room.id,
		memberLimitOverride: null,
	});
	roomInfo.value = updated;
	roomLimitOverride.value = '';
	roomJoinMode.value = updated.room.joinMode;
	updateRoomListItem(updated);
	await os.success();
}

async function saveRoomJoinMode() {
	if (!roomInfo.value) return;

	const currentRoom = roomInfo.value;
	const updated = await os.apiWithDialog<AdminChatRoomInfo>('admin/chat/rooms/update', {
		roomId: currentRoom.room.id,
		joinMode: roomJoinMode.value,
	});
	roomInfo.value = updated;
	roomLimitOverride.value = updated.memberLimitOverride ?? '';
	roomJoinMode.value = updated.room.joinMode;
	updateRoomListItem(updated);
	await os.success();
}

function updateRoomListItem(updated: AdminChatRoomInfo) {
	rooms.value = rooms.value.map(item => item.room.id === updated.room.id ? {
		...item,
		room: updated.room,
		memberCount: updated.memberCount,
		defaultMemberLimit: updated.defaultMemberLimit,
		memberLimitOverride: updated.memberLimitOverride,
		memberLimit: updated.memberLimit,
	} : item);
}

async function reloadRooms() {
	await loadRooms(0);
}

function joinModeText(joinMode: Misskey.entities.ChatRoom['joinMode']) {
	if (joinMode === 'open') return i18n.ts._chat.openRoom;
	if (joinMode === 'closed') return i18n.ts._chat.closedRoom;
	return i18n.ts._chat.inviteOnlyRoom;
}

async function openMessages(item: AdminChatRoomListItem) {
	loadingMessagesRoomId.value = item.room.id;
	messageRoom.value = item;
	messages.value = [];
	messagesCanFetchMore.value = false;
	messagesError.value = false;
	try {
		await loadMessages(true);
		await scrollToMessages();
	} finally {
		loadingMessagesRoomId.value = null;
	}
}

async function loadRooms(pageIndex = roomsPageIndex.value) {
	if (roomsLoading.value) return;
	const cursor = roomsPageCursors.value[pageIndex];
	if (cursor === undefined) return;

	const requestId = ++roomsLoadRequestId;
	roomsLoading.value = true;
	roomsError.value = false;

	try {
		const loaded = await misskeyApi('admin/chat/rooms/list', {
			limit: ROOMS_LIMIT + 1,
			query: roomQuery.value.trim() === '' ? null : roomQuery.value.trim(),
			joinMode: joinModeFilter.value,
			...(cursor == null ? {} : {
				untilId: cursor,
			}),
		});

		if (requestId !== roomsLoadRequestId) return;

		const page = loaded.slice(0, ROOMS_LIMIT);
		rooms.value = page;
		roomsPageIndex.value = pageIndex;
		roomsCanFetchMore.value = loaded.length > ROOMS_LIMIT;
		roomsPageCursors.value = roomsPageCursors.value.slice(0, pageIndex + 1);
		if (roomsCanFetchMore.value && page.length > 0) {
			roomsPageCursors.value[pageIndex + 1] = page.at(-1)?.id ?? null;
		}
	} catch (err) {
		roomsError.value = true;
	} finally {
		if (requestId === roomsLoadRequestId) roomsLoading.value = false;
	}
}

async function resetRoomsPagination() {
	roomsPageIndex.value = 0;
	roomsPageCursors.value = [null];
	await loadRooms(0);
}

async function goToPreviousRoomsPage() {
	if (roomsPageIndex.value === 0) return;
	await loadRooms(roomsPageIndex.value - 1);
}

async function goToNextRoomsPage() {
	if (!roomsCanFetchMore.value) return;
	await loadRooms(roomsPageIndex.value + 1);
}

async function loadMessages(reset = false) {
	if (!messageRoom.value) return;
	if (!reset && (!messagesCanFetchMore.value || messagesMoreFetching.value || messagesLoading.value)) return;

	const roomId = messageRoom.value.room.id;
	const loading = reset ? messagesLoading : messagesMoreFetching;
	const requestId = ++messagesLoadRequestId;
	loading.value = true;
	if (reset) messagesError.value = false;
	try {
		const loaded = await misskeyApi('admin/chat/rooms/messages', {
			roomId,
			limit: MESSAGES_LIMIT + 1,
			...(reset || messages.value.length === 0 ? {} : {
				untilId: messages.value.at(-1)?.id,
			}),
		});

		if (requestId !== messagesLoadRequestId || messageRoom.value?.room.id !== roomId) return;

		const page = loaded.slice(0, MESSAGES_LIMIT);
		messages.value = reset ? page : [...messages.value, ...page];
		messagesCanFetchMore.value = loaded.length > MESSAGES_LIMIT;
	} catch (err) {
		if (reset) {
			messagesError.value = true;
		} else {
			await os.alert({
				type: 'error',
				text: err instanceof Error ? err.message : String(err),
			});
		}
	} finally {
		if (requestId === messagesLoadRequestId) loading.value = false;
	}
}

async function loadMoreMessages() {
	await loadMessages(false);
}

async function scrollToRoomDetails() {
	await nextTick();
	roomDetailsEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function scrollToMessages() {
	await nextTick();
	messagesEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

watch([roomQuery, joinModeFilter], () => {
	resetRoomsPagination();
}, { immediate: true });

definePage({
	title: i18n.ts.chatSettings,
	icon: 'ph-chats-circle ph-bold ph-lg',
});
</script>

<style lang="scss" module>
.roomHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.roomName {
	font-weight: 700;
}

.roomId {
	font-size: 85%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;

	> div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px;
		border-radius: var(--MI-radius);
		background: var(--MI_THEME-panelHighlight);
	}

	span {
		font-size: 85%;
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.filters {
	display: flex;
	align-items: flex-end;
	gap: 12px;
	flex-wrap: wrap;
}

.paginationBar {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	flex-wrap: wrap;
}

.pageIndicator {
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 90%;
}

.filterInput {
	flex: 2 1 260px;
}

.filterSelect {
	flex: 1 1 180px;
}

.roomList {
	display: flex;
	flex-direction: column;
	gap: 10px;
}

.roomRow {
	display: flex;
	flex-direction: column;
	gap: 10px;
	padding: 14px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.roomTop {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.roomMain {
	min-width: 0;
}

.roomTitleLine {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.badge {
	display: inline-flex;
	align-items: center;
	min-height: 22px;
	padding: 0 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	font-size: 80%;
	color: var(--MI_THEME-fgTransparentWeak);
	white-space: nowrap;
}

.roomMeta {
	display: flex;
	flex-wrap: wrap;
	gap: 8px 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 85%;
	overflow-wrap: anywhere;
}

.roomActions {
	display: flex;
	align-items: center;
	justify-content: flex-end;
	gap: 8px;
	flex-wrap: wrap;
}

.openLink {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	min-height: 36px;
	padding: 0 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	color: var(--MI_THEME-fg);
}

.messageItem {
	padding: 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.messageHeader {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-bottom: 8px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 85%;
}

.messageText {
	overflow-wrap: anywhere;
}

.messageMedia {
	margin-top: 10px;
}

@media (max-width: 700px) {
	.roomTop {
		align-items: flex-start;
		flex-direction: column;
	}

	.roomActions {
		justify-content: flex-start;
	}
}
</style>
