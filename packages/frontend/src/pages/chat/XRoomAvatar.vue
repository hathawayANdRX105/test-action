<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<img v-if="roomAvatarUrl" :class="$style.avatar" :src="roomAvatarUrl" :alt="room.name" decoding="async" @error="onAvatarError"/>
<MkAvatar v-else-if="room.owner" :user="room.owner" :link="false" :class="$style.avatar"/>
<div v-else :class="[$style.avatar, $style.fallback]"><i class="ti ti-users"></i></div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { appendAvatarCacheKey } from '@/utility/avatar-cache.js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const avatarLoadFailed = ref(false);
const roomAvatarUrl = computed(() => {
	if (avatarLoadFailed.value || props.room.avatarUrl == null) return null;
	return appendAvatarCacheKey(props.room.avatarUrl, props.room.id);
});

watch([() => props.room.id, () => props.room.avatarUrl], () => {
	avatarLoadFailed.value = false;
});

function onAvatarError() {
	avatarLoadFailed.value = true;
}
</script>

<style lang="scss" module>
.avatar {
	display: block;
	aspect-ratio: 1;
	object-fit: cover;
	border-radius: 100%;
}

.fallback {
	display: grid;
	place-items: center;
	width: 100%;
	height: 100%;
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fgTransparentWeak);
}
</style>
