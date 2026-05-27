<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 700px;">
		<div v-if="initializing || message == null">
			<MkLoading/>
		</div>
		<div v-else class="_gaps_s">
			<XMessage :message="message" :isSearchResult="true"/>
			<button class="_button" :class="$style.openContext" @click="openContext">
				<i class="ti ti-messages"></i>
				<span>{{ i18n.ts.show }}</span>
			</button>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import * as Misskey from 'misskey-js';
import XMessage from './XMessage.vue';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { useRouter } from '@/router.js';
import { chatMessageContextPath } from './chat-navigation.js';

const props = defineProps<{
	messageId?: string;
}>();

const router = useRouter();
const initializing = ref(true);
const message = ref<Misskey.entities.ChatMessage | null>();

async function initialize() {
	initializing.value = true;

	message.value = await misskeyApi('chat/messages/show', {
		messageId: props.messageId,
	});

	initializing.value = false;
}

function openContext() {
	if (message.value == null) return;

	router.push(chatMessageContextPath(message.value));
}

onMounted(() => {
	initialize();
});

definePage({
	title: i18n.ts.chat,
});
</script>

<style lang="scss" module>
.openContext {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: 6px;
	width: 100%;
	padding: 10px 12px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	color: var(--MI_THEME-accent);
}
</style>
