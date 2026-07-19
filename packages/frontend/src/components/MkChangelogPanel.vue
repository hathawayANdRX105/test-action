<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkModal ref="modal" :zPriority="'middle'" @click="modal?.close()" @closed="onClosed">
	<div :class="$style.root">
		<div :class="$style.title"><MkSparkle>{{ i18n.ts.misskeyUpdated }}</MkSparkle></div>
		<div :class="$style.version">{{ display.runningVersion }}</div>
		<p v-if="display.version !== display.runningVersion" :class="$style.meta">
			{{ display.version }}
		</p>

		<section v-if="display.highlights.length > 0" :class="$style.section">
			<h3 :class="$style.sectionTitle">{{ i18n.ts.whatIsNew }}</h3>
			<ul :class="$style.list">
				<li v-for="(item, i) in display.highlights" :key="`h-${i}`">{{ item }}</li>
			</ul>
		</section>

		<section v-if="display.tips.length > 0" :class="$style.section">
			<h3 :class="$style.sectionTitle">{{ howToUseLabel }}</h3>
			<ul :class="$style.list">
				<li v-for="(item, i) in display.tips" :key="`t-${i}`">{{ item }}</li>
			</ul>
		</section>

		<div :class="$style.actions">
			<MkButton primary full @click="ackAndClose">{{ i18n.ts.gotIt }}</MkButton>
			<MkButton full @click="openAbout">{{ aboutLabel }}</MkButton>
		</div>
	</div>
</MkModal>
</template>

<script lang="ts" setup>
import { computed, onMounted, useTemplateRef } from 'vue';
import MkModal from '@/components/MkModal.vue';
import MkButton from '@/components/MkButton.vue';
import MkSparkle from '@/components/MkSparkle.vue';
import { i18n } from '@/i18n.js';
import { confetti } from '@/utility/confetti.js';
import { getChangelogForDisplay, markChangelogRead } from '@/utility/changelog.js';
import { mainRouter } from '@/router.js';
import { lang } from '@@/js/config.js';

const emit = defineEmits<{
	(ev: 'closed'): void;
}>();

const props = withDefaults(defineProps<{
	/** When true, celebrate with confetti (upgrade popup). */
	celebrate?: boolean;
	/** Auto-mark read when closed (default true for explicit open). */
	markReadOnClose?: boolean;
}>(), {
	celebrate: false,
	markReadOnClose: true,
});

const modal = useTemplateRef('modal');
const display = getChangelogForDisplay();
let didMark = false;

const howToUseLabel = computed(() => {
	const l = (lang ?? 'en-US').toLowerCase();
	return l.startsWith('zh') ? '新功能怎么用' : 'How to use new features';
});

const aboutLabel = computed(() => {
	const template = i18n.ts.aboutX as string | undefined;
	if (template && template.includes('{x}')) {
		return template.replace('{x}', 'Universe Federation');
	}
	return i18n.ts.about;
});

function markIfNeeded() {
	if (!props.markReadOnClose || didMark) return;
	didMark = true;
	markChangelogRead();
}

function ackAndClose() {
	markIfNeeded();
	modal.value?.close();
}

function openAbout() {
	markIfNeeded();
	modal.value?.close();
	mainRouter.push('/about');
}

function onClosed() {
	// Closing via backdrop / Esc should also clear the green dot when requested.
	markIfNeeded();
	emit('closed');
}

onMounted(() => {
	if (props.celebrate) {
		confetti({
			duration: 1000 * 3,
		});
	}
});
</script>

<style lang="scss" module>
.root {
	margin: auto;
	position: relative;
	padding: 28px 28px 24px;
	min-width: 320px;
	max-width: 480px;
	max-height: min(80vh, 640px);
	overflow-y: auto;
	box-sizing: border-box;
	text-align: left;
	background: var(--MI_THEME-panel);
	border-radius: var(--MI-radius);
}

.title {
	font-weight: bold;
	text-align: center;
	font-size: 1.1em;
}

.version {
	margin: 0.75em 0 0.25em;
	text-align: center;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: var(--MI_THEME-accent);
}

.meta {
	margin: 0 0 0.75em;
	text-align: center;
	font-size: 0.85em;
	opacity: 0.7;
}

.section {
	margin-top: 1em;
}

.sectionTitle {
	margin: 0 0 0.5em;
	font-size: 0.92em;
	font-weight: 700;
	opacity: 0.9;
}

.list {
	margin: 0;
	padding-left: 1.2em;
	display: grid;
	gap: 0.45em;
	font-size: 0.92em;
	line-height: 1.45;
	color: var(--MI_THEME-fg);
}

.actions {
	margin-top: 1.25em;
	display: grid;
	gap: 8px;
}
</style>
