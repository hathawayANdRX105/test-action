<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModalWindow
	ref="dialogEl"
	:width="460"
	:height="600"
	@close="dialogEl?.close()"
	@closed="emit('closed')"
>
	<template #header><i class="ti ti-sparkles" style="margin-right: 0.5em;"></i>{{ i18n.ts._recommendation.manage }}</template>

	<div class="_spacer" style="--MI_SPACER-min: 20px; --MI_SPACER-max: 28px;">
		<MkLoading v-if="fetching"/>
		<MkError v-else-if="errored" @retry="load"/>
		<div v-else-if="data != null" class="_gaps">
			<div :class="$style.title">{{ i18n.ts._recommendation.diagnostics }}</div>
			<div :class="$style.grid">
				<div><span>{{ i18n.ts._recommendation.ageHours }}</span><b>{{ data.ageHours }}</b></div>
				<div><span>{{ i18n.ts._recommendation.exposure }}</span><b>{{ data.exposureCount }}</b></div>
				<div><span>{{ i18n.ts._recommendation.engagement }}</span><b>{{ data.engagement.total }}</b></div>
				<div><span>{{ i18n.ts.reaction }}</span><b>{{ data.engagement.reactions }}</b></div>
				<div><span>{{ i18n.ts.reply }}</span><b>{{ data.engagement.replies }}</b></div>
				<div><span>{{ i18n.ts.renote }}</span><b>{{ data.engagement.renotes }}</b></div>
			</div>

			<div :class="$style.title">{{ i18n.ts._recommendation.authorActivity }}</div>
			<div :class="$style.grid">
				<div><span>{{ i18n.ts._recommendation.accountAgeDays }}</span><b>{{ data.author.accountAgeDays }}</b></div>
				<div><span>{{ i18n.ts._recommendation.followers }}</span><b>{{ data.author.followersCount }}</b></div>
				<div><span>{{ i18n.ts._recommendation.posts }}</span><b>{{ data.author.notesCount }}</b></div>
				<div><span>{{ i18n.ts._recommendation.trustScore }}</span><b>{{ data.author.trustScore }}</b></div>
			</div>

			<MkInfo v-if="data.flags.promoSuspected" warn>{{ i18n.ts._recommendation.suspectedPromo }}</MkInfo>
			<MkInfo v-if="data.flags.lowValueSuspected" warn>{{ i18n.ts._recommendation.suspectedLowValue }}</MkInfo>
			<MkInfo v-if="data.author.isBot">Bot</MkInfo>

			<hr/>

			<MkSwitch v-model="pinned">
				<template #label>{{ i18n.ts._recommendation.pinToTop }}</template>
				<template #caption>{{ i18n.ts._recommendation.pinToTopCaption }}</template>
			</MkSwitch>

			<MkInput v-model="scoreBoost" type="number" :min="-300" :max="300">
				<template #label>{{ i18n.ts._recommendation.scoreBoost }}</template>
				<template #caption>{{ i18n.ts._recommendation.scoreBoostCaption }}</template>
			</MkInput>

			<MkButton primary full :disabled="!changed" @click="save">{{ i18n.ts.save }}</MkButton>
		</div>
	</div>
</MkModalWindow>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue';
import * as Misskey from 'misskey-js';
import MkModalWindow from '@/components/MkModalWindow.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkInput from '@/components/MkInput.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkError from '@/components/global/MkError.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { misskeyApi } from '@/utility/misskey-api.js';

const props = defineProps<{
	noteId: string;
}>();

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const dialogEl = useTemplateRef('dialogEl');

const fetching = ref(true);
const errored = ref(false);
const data = ref<Misskey.entities.AdminRecommendationShowResponse | null>(null);
const pinned = ref(false);
const scoreBoost = ref<number>(0);

const changed = computed(() => data.value != null && (pinned.value !== data.value.pinned || Number(scoreBoost.value) !== data.value.scoreBoost));

async function load() {
	fetching.value = true;
	errored.value = false;
	try {
		const res = await misskeyApi('admin/recommendation/show', { noteId: props.noteId });
		data.value = res;
		pinned.value = res.pinned;
		scoreBoost.value = res.scoreBoost;
	} catch {
		errored.value = true;
	} finally {
		fetching.value = false;
	}
}

async function save() {
	await os.apiWithDialog('admin/recommendation/update', {
		noteId: props.noteId,
		pinned: pinned.value,
		scoreBoost: Math.round(Number(scoreBoost.value)),
	});
	if (data.value != null) {
		data.value.pinned = pinned.value;
		data.value.scoreBoost = Math.round(Number(scoreBoost.value));
	}
}

load();
</script>

<style lang="scss" module>
.title {
	font-weight: 700;
	font-size: 0.9em;
	color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
}

.grid {
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;

	> div {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		border-radius: var(--MI-radius-sm);
		background: color(from var(--MI_THEME-bg) srgb r g b / 0.5);

		> span {
			color: color(from var(--MI_THEME-fg) srgb r g b / 0.65);
			font-size: 0.85em;
		}

		> b {
			flex: 0 0 auto;
		}
	}
}
</style>
