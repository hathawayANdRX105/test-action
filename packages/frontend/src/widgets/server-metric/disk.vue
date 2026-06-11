<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="zbwaqsat">
	<XPie class="pie" :value="usage"/>
	<div>
		<p><i class="ti ti-database"></i>Disk</p>
		<p>Total: {{ bytes(total, 1) }}</p>
		<p>Free: {{ bytes(available, 1) }}</p>
		<p>Used: {{ bytes(used, 1) }}</p>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
import * as Misskey from 'misskey-js';
import XPie from './pie.vue';
import bytes from '@/filters/bytes.js';

const props = defineProps<{
	meta: Misskey.entities.ServerInfoResponse;
}>();

const usage = computed(() => {
	const diskTotal = total.value;
	return diskTotal > 0 ? clampRatio(used.value / diskTotal) : 0;
});
const total = computed(() => positiveFinite(props.meta.fs?.total));
const used = computed(() => positiveFinite(props.meta.fs?.used));
const available = computed(() => Math.max(0, total.value - used.value));

function positiveFinite(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function clampRatio(value: number): number {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}
</script>

<style lang="scss" scoped>
.zbwaqsat {
	display: flex;
	padding: 16px;

	> .pie {
		height: 82px;
		flex-shrink: 0;
		margin-right: 16px;
	}

	> div {
		flex: 1;

		> p {
			margin: 0;
			font-size: 0.8em;

			&:first-child {
				font-weight: bold;
				margin-bottom: 4px;

				> i {
					margin-right: 4px;
				}
			}
		}
	}
}
</style>
