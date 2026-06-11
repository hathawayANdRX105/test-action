<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="lcfyofjk">
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<defs>
			<linearGradient :id="cpuGradientId" x1="0" x2="0" y1="1" y2="0">
				<stop offset="0%" stop-color="hsl(180, 80%, 70%)"></stop>
				<stop offset="100%" stop-color="hsl(0, 80%, 70%)"></stop>
			</linearGradient>
			<mask :id="cpuMaskId" x="0" y="0" :width="viewBoxX" :height="viewBoxY">
				<polygon
					:points="cpuPolygonPoints"
					fill="#fff"
					fill-opacity="0.5"
				/>
				<polyline
					:points="cpuPolylinePoints"
					fill="none"
					stroke="#fff"
					stroke-width="1"
				/>
				<circle
					:cx="cpuHeadX"
					:cy="cpuHeadY"
					r="1.5"
					fill="#fff"
				/>
			</mask>
		</defs>
		<rect
			x="-2" y="-2"
			:width="viewBoxX + 4" :height="viewBoxY + 4"
			:style="{ stroke: 'none', fill: `url(#${ cpuGradientId })`, mask: `url(#${ cpuMaskId })` }"
		/>
		<text x="1" y="5">CPU <tspan>{{ cpuP }}%</tspan></text>
	</svg>
	<svg :viewBox="`0 0 ${ viewBoxX } ${ viewBoxY }`">
		<defs>
			<linearGradient :id="memGradientId" x1="0" x2="0" y1="1" y2="0">
				<stop offset="0%" stop-color="hsl(180, 80%, 70%)"></stop>
				<stop offset="100%" stop-color="hsl(0, 80%, 70%)"></stop>
			</linearGradient>
			<mask :id="memMaskId" x="0" y="0" :width="viewBoxX" :height="viewBoxY">
				<polygon
					:points="memPolygonPoints"
					fill="#fff"
					fill-opacity="0.5"
				/>
				<polyline
					:points="memPolylinePoints"
					fill="none"
					stroke="#fff"
					stroke-width="1"
				/>
				<circle
					:cx="memHeadX"
					:cy="memHeadY"
					r="1.5"
					fill="#fff"
				/>
			</mask>
		</defs>
		<rect
			x="-2" y="-2"
			:width="viewBoxX + 4" :height="viewBoxY + 4"
			:style="{ stroke: 'none', fill: `url(#${ memGradientId })`, mask: `url(#${ memMaskId })` }"
		/>
		<text x="1" y="5">MEM <tspan>{{ memP }}%</tspan></text>
	</svg>
</div>
</template>

<script lang="ts" setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { v4 as uuid } from 'uuid';

const props = defineProps<{
	connection: Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
	meta: Misskey.entities.ServerInfoResponse
}>();

const viewBoxX = ref<number>(50);
const viewBoxY = ref<number>(30);
const stats = ref<Misskey.entities.ServerStats[]>([]);
const cpuGradientId = uuid();
const cpuMaskId = uuid();
const memGradientId = uuid();
const memMaskId = uuid();
const cpuPolylinePoints = ref<string>('');
const memPolylinePoints = ref<string>('');
const cpuPolygonPoints = ref<string>('');
const memPolygonPoints = ref<string>('');
const cpuHeadX = ref<number>(viewBoxX.value);
const cpuHeadY = ref<number>(viewBoxY.value);
const memHeadX = ref<number>(viewBoxX.value);
const memHeadY = ref<number>(viewBoxY.value);
const cpuP = ref<string>('');
const memP = ref<string>('');

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

	const totalMem = positiveFinite(props.meta.mem?.total);
	const cpuPolylinePointsStats = stats.value.map((s, i) => [getPointX(i), getPointY(getCpuRatio(s))]);
	const memPolylinePointsStats = stats.value.map((s, i) => [getPointX(i), getPointY(getMemRatio(s, totalMem))]);
	cpuPolylinePoints.value = cpuPolylinePointsStats.map(xy => `${xy[0]},${xy[1]}`).join(' ');
	memPolylinePoints.value = memPolylinePointsStats.map(xy => `${xy[0]},${xy[1]}`).join(' ');

	cpuPolygonPoints.value = `${viewBoxX.value - (stats.value.length - 1)},${viewBoxY.value} ${cpuPolylinePoints.value} ${viewBoxX.value},${viewBoxY.value}`;
	memPolygonPoints.value = `${viewBoxX.value - (stats.value.length - 1)},${viewBoxY.value} ${memPolylinePoints.value} ${viewBoxX.value},${viewBoxY.value}`;

	const cpuHead = cpuPolylinePointsStats.at(-1) ?? [viewBoxX.value, viewBoxY.value];
	const memHead = memPolylinePointsStats.at(-1) ?? [viewBoxX.value, viewBoxY.value];
	cpuHeadX.value = cpuHead[0];
	cpuHeadY.value = cpuHead[1];
	memHeadX.value = memHead[0];
	memHeadY.value = memHead[1];

	cpuP.value = (getCpuRatio(connStats) * 100).toFixed(0);
	memP.value = (getMemRatio(connStats, totalMem) * 100).toFixed(0);
}

function onStatsLog(statsLog: Misskey.entities.ServerStatsLog) {
	for (const revStats of statsLog.toReversed()) {
		onStats(revStats);
	}
}

function getPointX(index: number): number {
	return viewBoxX.value - ((stats.value.length - 1) - index);
}

function getPointY(ratio: number): number {
	return (1 - clampRatio(ratio)) * viewBoxY.value;
}

function getCpuRatio(statsItem: Misskey.entities.ServerStats): number {
	return clampRatio(finiteNumber(statsItem.cpu));
}

function getMemRatio(statsItem: Misskey.entities.ServerStats, totalMem: number): number {
	return totalMem > 0 ? clampRatio(finiteNumber(statsItem.mem?.active) / totalMem) : 0;
}

function finiteNumber(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function positiveFinite(value: unknown): number {
	const number = finiteNumber(value);
	return number > 0 ? number : 0;
}

function clampRatio(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
</script>

<style lang="scss" scoped>
.lcfyofjk {
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
