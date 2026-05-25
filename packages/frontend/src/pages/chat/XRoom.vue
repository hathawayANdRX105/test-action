<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkA :to="`/chat/room/${room.id}`" :class="$style.root">
	<div :class="$style.header">
		<MkAvatar :user="room.owner" :link="false" :class="$style.headerAvatar"/>
		<div :class="$style.titleBlock">
			<div :class="$style.name">{{ room.name }}</div>
			<div :class="$style.description">{{ room.description || i18n.ts.noDescription }}</div>
		</div>
	</div>
</MkA>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

</script>

<style lang="scss" module>
.root {
	display: block;
	padding: 12px;
	border-radius: 12px;
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
		text-decoration: none;
	}
}

.header {
	display: flex;
	align-items: center;
	gap: 12px;
}

.headerAvatar {
	width: 48px;
	height: 48px;
	flex: 0 0 auto;
}

.titleBlock {
	min-width: 0;
}

.name {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	font-weight: 700;
}

.description {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 90%;
}
</style>
