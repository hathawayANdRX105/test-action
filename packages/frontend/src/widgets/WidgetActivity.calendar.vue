<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<svg viewBox="0 0 21 7">
	<rect
		v-for="record in calendarRecords"
		:key="`${record.date.year}-${record.date.month}-${record.date.day}-hitarea`"
		class="day"
		width="1" height="1"
		:x="record.x" :y="record.date.weekday"
		rx="1" ry="1"
		fill="transparent"
	>
		<title>{{ record.date.year }}/{{ record.date.month + 1 }}/{{ record.date.day }}</title>
	</rect>
	<rect
		v-for="record in calendarRecords"
		:key="`${record.date.year}-${record.date.month}-${record.date.day}-value`"
		class="day"
		:width="record.v" :height="record.v"
		:x="record.x + ((1 - record.v) / 2)" :y="record.date.weekday + ((1 - record.v) / 2)"
		rx="1" ry="1"
		:fill="record.color"
		style="pointer-events: none;"
	/>
	<rect
		v-if="calendarRecords[0]"
		class="today"
		width="1" height="1"
		:x="calendarRecords[0].x" :y="calendarRecords[0].date.weekday"
		rx="1" ry="1"
		fill="none"
		stroke-width="0.1"
		stroke="#f73520"
	/>
</svg>
</template>

<script lang="ts" setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { globalEvents } from '@/events.js';
import { getChartThemeColors } from '@/utility/chart-theme.js';

const props = defineProps<{
	activity: {
		total: number;
		notes: number;
		replies: number;
		renotes: number;
	}[]
}>();

const themeVersion = ref(0);
const themeColors = computed(() => {
	themeVersion.value;
	return getChartThemeColors();
});
const calendarRecords = computed(() => {
	themeVersion.value;

	const records = props.activity.map(d => ({
		total: d.notes + d.replies + d.renotes,
		notes: d.notes,
		replies: d.replies,
		renotes: d.renotes,
	}));
	const peak = Math.max(0, ...records.map(d => d.total));
	const now = new Date();
	const year = now.getFullYear();
	const month = now.getMonth();
	const day = now.getDate();
	let x = 20;

	return records.map((d, i) => {
		const date = new Date(year, month, day - i);
		const recordDate = {
			year: date.getFullYear(),
			month: date.getMonth(),
			day: date.getDate(),
			weekday: date.getDay(),
		};
		const v = Math.min(1, peak === 0 ? 0 : d.total / (peak / 2));
		const baseColor = recordDate.weekday === 0 || recordDate.weekday === 6 ? themeColors.value.activityWeekendColor : themeColors.value.activityNotesColor;
		const record = {
			...d,
			x,
			date: recordDate,
			v,
			color: peak === 0 ? 'transparent' : colorMix(baseColor, Math.max(0.16, v)),
		};

		if (recordDate.weekday === 0) x--;

		return record;
	});
});

function refreshTheme(): void {
	themeVersion.value++;
}

function colorMix(color: string, alpha: number): string {
	return color.startsWith('rgba(') || color.startsWith('rgb(')
		? color
		: `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
}

globalEvents.on('themeChanged', refreshTheme);
onBeforeUnmount(() => {
	globalEvents.off('themeChanged', refreshTheme);
});
</script>

<style lang="scss" scoped>
svg {
	color: var(--MI_THEME-fg);
	display: block;
	padding: 16px;
	width: 100%;
	box-sizing: border-box;

	> rect {
		transform-origin: center;

		&.day {
			&:hover {
				fill: color-mix(in srgb, currentColor 12%, transparent);
			}
		}
	}
}
</style>
