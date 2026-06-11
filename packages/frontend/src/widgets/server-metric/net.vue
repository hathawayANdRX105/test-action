<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="oxxrhrto">
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<polygon
			:points="inPolygonPoints"
			fill="#94a029"
			fill-opacity="0.5"
		/>
		<polyline
			:points="inPolylinePoints"
			fill="none"
			stroke="#94a029"
			stroke-width="1"
		/>
		<circle
			:cx="inHeadX"
			:cy="inHeadY"
			r="1.5"
			fill="#94a029"
		/>
		<text x="1" y="5">NET rx <tspan>{{ bytes(inRecent) }}</tspan></text>
	</svg>
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<polygon
			:points="outPolygonPoints"
			fill="#ff9156"
			fill-opacity="0.5"
		/>
		<polyline
			:points="outPolylinePoints"
			fill="none"
			stroke="#ff9156"
			stroke-width="1"
		/>
		<circle
			:cx="outHeadX"
			:cy="outHeadY"
			r="1.5"
			fill="#ff9156"
		/>
		<text x="1" y="5">NET tx <tspan>{{ bytes(outRecent) }}</tspan></text>
	</svg>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import bytes from '@/filters/bytes.js';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const viewBoxX = ref<number>(50);
const viewBoxY = ref<number>(30);
const stats = ref<Misskey.entities.ServerStats[]>([]);
const inPolylinePoints = ref<string>('');
const outPolylinePoints = ref<string>('');
const inPolygonPoints = ref<string>('');
const outPolygonPoints = ref<string>('');
const inHeadX = ref<number>(viewBoxX.value);
const inHeadY = ref<number>(viewBoxY.value);
const outHeadX = ref<number>(viewBoxX.value);
const outHeadY = ref<number>(viewBoxY.value);
const inRecent = ref<number>(0);
const outRecent = ref<number>(0);

onMounted(() => {
	props.connection.on('stats', onStats);
	props.connection.on('statsLog', onStatsLog);
	props.connection.send('requestLog', {
		length: 50,
	});
});

onBeforeUnmount(() => {
	props.connection.off('stats', onStats);
	props.connection.off('statsLog', onStatsLog);
});

function onStats(connStats: Misskey.entities.ServerStats) {
	stats.value.push(connStats);
	if (stats.value.length > 50) stats.value.shift();

	const inValues = stats.value.map(s => positiveFinite(s.net?.rx));
	const outValues = stats.value.map(s => positiveFinite(s.net?.tx));
	const inPeak = getPeak(inValues);
	const outPeak = getPeak(outValues);

	const inPolylinePointsStats = inValues.map((value, i) => [getPointX(i), getPointY(value, inPeak)]);
	const outPolylinePointsStats = outValues.map((value, i) => [getPointX(i), getPointY(value, outPeak)]);
	inPolylinePoints.value = inPolylinePointsStats.map(xy => `${xy[0]},${xy[1]}`).join(' ');
	outPolylinePoints.value = outPolylinePointsStats.map(xy => `${xy[0]},${xy[1]}`).join(' ');

	inPolygonPoints.value = `${viewBoxX.value - (stats.value.length - 1)},${viewBoxY.value} ${inPolylinePoints.value} ${viewBoxX.value},${viewBoxY.value}`;
	outPolygonPoints.value = `${viewBoxX.value - (stats.value.length - 1)},${viewBoxY.value} ${outPolylinePoints.value} ${viewBoxX.value},${viewBoxY.value}`;

	const inHead = inPolylinePointsStats.at(-1) ?? [viewBoxX.value, viewBoxY.value];
	const outHead = outPolylinePointsStats.at(-1) ?? [viewBoxX.value, viewBoxY.value];
	inHeadX.value = inHead[0];
	inHeadY.value = inHead[1];
	outHeadX.value = outHead[0];
	outHeadY.value = outHead[1];

	inRecent.value = positiveFinite(connStats.net?.rx);
	outRecent.value = positiveFinite(connStats.net?.tx);
}

function onStatsLog(statsLog: Misskey.entities.ServerStatsLog) {
	for (const revStats of statsLog.toReversed()) {
		onStats(revStats);
	}
}

function getPointX(index: number): number {
	return viewBoxX.value - ((stats.value.length - 1) - index);
}

function getPointY(value: number, peak: number): number {
	return (1 - clampRatio(peak > 0 ? value / peak : 0)) * viewBoxY.value;
}

function getPeak(values: number[]): number {
	const peak = Math.max(1024 * 64, ...values);
	return peak > 0 && Number.isFinite(peak) ? peak : 1024 * 64;
}

function positiveFinite(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampRatio(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
</script>

<style lang="scss" scoped>
.oxxrhrto {
	display: flex;

	> svg {
		display: block;
		padding: 10px;
		width: 50%;

		&:first-child {
			padding-right: 5px;
		}

		&:last-child {
			padding-left: 5px;
		}

		> text {
			font-size: 4.5px;
			fill: currentColor;

			> tspan {
				opacity: 0.5;
			}
		}
	}
}
</style>
