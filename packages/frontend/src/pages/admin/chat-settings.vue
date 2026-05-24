<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ph-chats-circle ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts.chatSettings }}</template>
				<template v-if="serverForm.modified.value" #footer>
					<MkFormFooter :form="serverForm" :canSaving="serverFormCanSave"/>
				</template>

				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts.chatSettingsAdminRequired }}</MkInfo>

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

			<MkFolder>
				<template #icon><i class="ph-users ph-bold ph-lg"></i></template>
				<template #label>{{ i18n.ts.roomMemberLimitOverride }}</template>

				<div class="_gaps_m">
					<div class="_buttons">
						<MkInput v-model="roomId" style="flex: 1;">
							<template #label>Room ID</template>
						</MkInput>
						<MkButton primary rounded :disabled="roomId.trim() === ''" @click="loadRoom"><i class="ph-magnifying-glass ph-bold ph-lg"></i> {{ i18n.ts.search }}</MkButton>
					</div>

					<div v-if="roomInfo" class="_gaps_m _panel" style="padding: 16px;">
						<div :class="$style.roomHeader">
							<div>
								<div :class="$style.roomName">{{ roomInfo.room.name }}</div>
								<div :class="$style.roomId">{{ roomInfo.room.id }}</div>
							</div>
							<MkA :to="`/chat/room/${roomInfo.room.id}`" class="_link">{{ i18n.ts.details }}</MkA>
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

						<div class="_buttons">
							<MkButton primary rounded :disabled="!roomLimitCanSave" @click="saveRoomLimit"><i class="ph-check ph-bold ph-lg"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton rounded @click="clearRoomLimit"><i class="ph-eraser ph-bold ph-lg"></i> {{ i18n.ts.useDefaultLimit }}</MkButton>
						</div>
					</div>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkFormFooter from '@/components/MkFormFooter.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { useForm } from '@/use/use-form.js';

const MIN_LIMIT = 1;
const MAX_LIMIT = 10000;

type AdminChatRoomInfo = {
	room: Misskey.entities.ChatRoom;
	memberCount: number;
	defaultMemberLimit: number;
	memberLimitOverride: number | null;
	memberLimit: number;
};

const meta = await misskeyApi('admin/meta') as Misskey.entities.AdminMetaResponse;

const serverForm = useForm({
	chatAvailability: meta.policies.chatAvailability,
	chatRoomDefaultMemberLimit: meta.chatRoomDefaultMemberLimit,
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
const roomId = ref('');
const roomInfo = ref<AdminChatRoomInfo | null>(null);
const roomLimitOverride = ref<string | number>('');

const roomLimitCanSave = computed(() => {
	if (roomLimitOverride.value === '') return false;
	return isValidLimit(Number(roomLimitOverride.value));
});

function isValidLimit(value: number) {
	return Number.isInteger(value) && value >= MIN_LIMIT && value <= MAX_LIMIT;
}

async function loadRoom() {
	const loaded = await misskeyApi<AdminChatRoomInfo>('admin/chat/rooms/show', {
		roomId: roomId.value.trim(),
	});
	roomInfo.value = loaded;
	roomLimitOverride.value = loaded.memberLimitOverride ?? '';
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
	await os.success();
}

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

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
</style>
