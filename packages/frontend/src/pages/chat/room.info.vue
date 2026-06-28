<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<div :class="$style.avatarBlock">
		<XRoomAvatar :room="room" :class="$style.roomAvatar"/>
		<div v-if="canEditRoomProfile" :class="$style.avatarActions">
			<MkButton primary rounded @click="changeAvatar">{{ i18n.ts._chat.changeRoomAvatar }}</MkButton>
			<MkButton v-if="room.avatarUrl" rounded @click="removeAvatar">{{ i18n.ts._chat.removeRoomAvatar }}</MkButton>
		</div>
	</div>

	<MkInput v-model="name_" :disabled="!canEditRoomProfile">
		<template #label>{{ i18n.ts.name }}</template>
	</MkInput>

	<MkTextarea v-model="description_" :disabled="!canEditRoomProfile">
		<template #label>{{ i18n.ts.description }}</template>
	</MkTextarea>

	<MkSelect v-if="canEditRoomProfile" v-model="joinMode_">
		<template #label>{{ i18n.ts._chat.roomJoinMode }}</template>
		<option value="inviteOnly">{{ i18n.ts._chat.inviteOnlyRoom }}</option>
		<option value="open">{{ i18n.ts._chat.openRoom }}</option>
		<option value="closed">{{ i18n.ts._chat.closedRoom }}</option>
	</MkSelect>
	<div v-else :class="$style.readonlyField">
		<div :class="$style.readonlyLabel">{{ i18n.ts._chat.roomJoinMode }}</div>
		<div :class="$style.readonlyValue">{{ joinModeText }}</div>
	</div>

	<MkInfo>
		{{ i18n.ts.effectiveRoomMemberLimit }}: {{ room.memberLimit }}
		<span v-if="$i.isAdmin"> {{ i18n.ts.roomMemberLimitOverride }}{{ room.memberLimitOverride == null ? `: ${i18n.ts.useDefaultLimit}` : `: ${room.memberLimitOverride}` }}</span>
	</MkInfo>

	<MkInfo v-if="$i.isAdmin">{{ i18n.ts._chat.roomMemberLimitManagedByAdmin }}</MkInfo>

	<MkButton v-if="canEditRoomProfile" primary @click="save">{{ i18n.ts.save }}</MkButton>

	<hr>

	<MkButton v-if="canDeleteRoom" danger @click="del">{{ i18n.ts._chat.deleteRoom }}</MkButton>

	<MkSwitch v-if="!isOwner" v-model="isMuted">
		<template #label>{{ i18n.ts._chat.muteThisRoom }}</template>
	</MkSwitch>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import XRoomAvatar from './XRoomAvatar.vue';
import MkButton from '@/components/MkButton.vue';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { selectFile } from '@/utility/select-file.js';
import { ensureSignin } from '@/i.js';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkInfo from '@/components/MkInfo.vue';
import { useRouter } from '@/router.js';

const router = useRouter();
const $i = ensureSignin();

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
}>();

const isOwner = computed(() => {
	return props.room.ownerId === $i.id;
});

const canEditRoomProfile = computed(() => (props.room.canEditRoomProfile ?? (isOwner.value || $i.isModerator || $i.isAdmin)) === true);
const canDeleteRoom = computed(() => (props.room.canDeleteRoom ?? (isOwner.value || $i.isModerator || $i.isAdmin)) === true);

const name_ = ref(props.room.name);
const description_ = ref(props.room.description);
const joinMode_ = ref(props.room.joinMode);
const joinModeText = computed(() => {
	switch (joinMode_.value) {
		case 'open':
			return i18n.ts._chat.openRoom;
		case 'closed':
			return i18n.ts._chat.closedRoom;
		case 'inviteOnly':
		default:
			return i18n.ts._chat.inviteOnlyRoom;
	}
});

watch(() => props.room, () => {
	name_.value = props.room.name;
	description_.value = props.room.description;
	joinMode_.value = props.room.joinMode;
});

async function save() {
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		name: name_.value,
		description: description_.value,
		joinMode: joinMode_.value,
	});

	name_.value = updated.name;
	description_.value = updated.description;
	joinMode_.value = updated.joinMode;
	emit('updated', updated);
}

function changeAvatar(ev: MouseEvent) {
	selectFile((ev.currentTarget ?? ev.target) as HTMLElement, i18n.ts._chat.roomAvatar).then(async (file) => {
		let originalOrCropped = file;

		const { canceled } = await os.confirm({
			type: 'question',
			text: i18n.ts.cropImageAsk,
			okText: i18n.ts.cropYes,
			cancelText: i18n.ts.cropNo,
		});

		if (!canceled) {
			originalOrCropped = await os.cropImage(file, {
				aspectRatio: 1,
			});
		}

		const updated = await os.apiWithDialog('chat/rooms/update', {
			roomId: props.room.id,
			avatarId: originalOrCropped.id,
		});
		emit('updated', updated);
	});
}

async function removeAvatar() {
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		avatarId: null,
	});
	emit('updated', updated);
}

async function del() {
	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.tsx.deleteAreYouSure({ x: name_.value }),
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/delete', {
		roomId: props.room.id,
	});
	router.push('/chat');
}

const isMuted = ref(props.room.isMuted ?? false);

watch(isMuted, async () => {
	await os.apiWithDialog('chat/rooms/mute', {
		roomId: props.room.id,
		mute: isMuted.value,
	});
	emit('updated', {
		...props.room,
		isMuted: isMuted.value,
	});
});
</script>

<style lang="scss" module>
.avatarBlock {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 12px;
	padding: 8px 0;
}

.roomAvatar {
	width: 96px;
	height: 96px;
}

.avatarActions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 8px;
}

.membership {
	display: flex;
}

.membershipBody {
	flex: 1;
	min-width: 0;
	margin-right: 8px;

	&:hover {
		text-decoration: none;
	}
}

.readonlyField {
	display: block;
}

.readonlyLabel {
	font-size: 0.85em;
	padding: 0 0 8px 0;
	user-select: none;
}

.readonlyValue {
	min-height: 36px;
	padding: 8px 12px;
	color: var(--MI_THEME-fg);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.7);
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.12);
	border-radius: var(--MI-radius-sm);
	box-sizing: border-box;
}
</style>
