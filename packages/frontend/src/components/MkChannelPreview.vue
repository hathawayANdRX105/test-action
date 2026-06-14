<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.wrap">
	<MkA :to="`/channels/${channel.id}`" :class="$style.card" class="_panel" :style="cardStyle" @click="updateLastReadedAt">
		<div :class="$style.banner" :style="bannerStyle">
			<div :class="$style.bannerFade"></div>
			<div :class="$style.name"><i class="ti ti-device-tv"></i> <span>{{ channel.name }}</span></div>
			<div v-if="channel.category" :class="$style.category"><i class="ti ti-folder"></i> {{ channel.category }}</div>
			<div v-if="channel.isSensitive" :class="$style.sensitive">{{ i18n.ts.sensitive }}</div>
			<div :class="$style.stats">
				<span><i class="ti ti-users"></i> {{ number(channel.usersCount) }}</span>
				<span><i class="ti ti-pencil"></i> {{ number(channel.notesCount) }}</span>
			</div>
		</div>
		<article :class="$style.body">
			<p v-if="channel.description" :class="$style.desc" :title="channel.description">{{ channel.description.length > 90 ? channel.description.slice(0, 90) + '…' : channel.description }}</p>
			<p v-else :class="[$style.desc, $style.descEmpty]">—</p>
		</article>
		<footer :class="$style.footer">
			<span v-if="channel.lastNotedAt"><i class="ti ti-clock"></i> <MkTime :time="channel.lastNotedAt"/></span>
			<span v-else><i class="ti ti-clock"></i> -</span>
		</footer>
	</MkA>
	<div
		v-if="channel.lastNotedAt && (channel.isFavorited || channel.isFollowing) && (!lastReadedAt || Date.parse(channel.lastNotedAt) > lastReadedAt)"
		:class="$style.indicator"
	></div>
</div>
</template>

<script lang="ts" setup>
import { computed, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import number from '@/filters/number.js';
import { miLocalStorage } from '@/local-storage.js';

const props = defineProps<{
	channel: Misskey.entities.Channel;
}>();

const getLastReadedAt = (): number | null => {
	return miLocalStorage.getItemAsJson(`channelLastReadedAt:${props.channel.id}`) ?? null;
};

const lastReadedAt = ref(getLastReadedAt());

watch(() => props.channel.id, () => {
	lastReadedAt.value = getLastReadedAt();
});

const updateLastReadedAt = () => {
	lastReadedAt.value = props.channel.lastNotedAt ? Date.parse(props.channel.lastNotedAt) : Date.now();
};

const cardStyle = computed(() => ({ '--ch-color': props.channel.color || 'var(--MI_THEME-accent)' }));

const bannerStyle = computed(() => {
	if (props.channel.bannerUrl) {
		return { backgroundImage: `url(${props.channel.bannerUrl})` };
	} else {
		return { background: `linear-gradient(135deg, ${props.channel.color || '#4c5e6d'}, color-mix(in srgb, ${props.channel.color || '#4c5e6d'} 55%, #000))` };
	}
});
</script>

<style lang="scss" module>
.wrap {
	position: relative;
	container-type: inline-size;
}

.card {
	display: flex;
	flex-direction: column;
	position: relative;
	overflow: hidden;
	width: 100%;
	height: 100%;
	border-radius: var(--MI-radius);
	transition: transform 0.18s ease, box-shadow 0.18s ease;

	&:hover {
		text-decoration: none;
		transform: translateY(-3px);
		box-shadow: 0 8px 24px color(from var(--ch-color) srgb r g b / 0.22);
	}

	&:focus-within {
		outline: none;

		&::after {
			content: '';
			position: absolute;
			inset: 0;
			border-radius: inherit;
			pointer-events: none;
			box-shadow: inset 0 0 0 2px var(--MI_THEME-focus);
		}
	}
}

.banner {
	position: relative;
	width: 100%;
	height: 150px;
	background-position: center;
	background-size: cover;
	flex-shrink: 0;
}

.bannerFade {
	position: absolute;
	inset: auto 0 0 0;
	height: 72px;
	background: linear-gradient(0deg, var(--MI_THEME-panel), color(from var(--MI_THEME-panel) srgb r g b / 0));
}

.name {
	position: absolute;
	top: 12px;
	left: 12px;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	max-width: calc(100% - 24px);
	padding: 7px 12px;
	box-sizing: border-box;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(6px);
	border-radius: var(--MI-radius-sm);
	color: #fff;
	font-size: 1.05em;
	font-weight: 700;

	> span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.category {
	position: absolute;
	top: 12px;
	right: 12px;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	max-width: 50%;
	padding: 4px 9px;
	box-sizing: border-box;
	background: color(from var(--ch-color) srgb r g b / 0.92);
	color: #fff;
	border-radius: var(--MI-radius-full);
	font-size: 0.72em;
	font-weight: 700;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.sensitive {
	position: absolute;
	z-index: 1;
	bottom: 12px;
	left: 12px;
	background: rgba(0, 0, 0, 0.7);
	color: var(--MI_THEME-warn);
	border-radius: var(--MI-radius-sm);
	font-weight: bold;
	font-size: 0.8em;
	padding: 3px 7px;
}

.stats {
	position: absolute;
	z-index: 1;
	bottom: 10px;
	right: 12px;
	display: flex;
	gap: 10px;
	padding: 5px 10px;
	font-size: 0.78em;
	background: rgba(0, 0, 0, 0.6);
	backdrop-filter: blur(6px);
	border-radius: var(--MI-radius-full);
	color: #fff;

	> span {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
}

.body {
	flex: 1 1 auto;
	padding: 12px 14px;
	min-height: 0;
}

.desc {
	margin: 0;
	font-size: 0.92em;
	line-height: 1.5;
	color: var(--MI_THEME-fg);
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.descEmpty {
	opacity: 0.4;
}

.footer {
	padding: 9px 14px;
	border-top: solid 0.5px var(--MI_THEME-divider);
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.82em;

	> span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}
}

.indicator {
	position: absolute;
	top: 0;
	right: 0;
	transform: translate(25%, -25%);
	background-color: var(--MI_THEME-accent);
	border: solid var(--MI_THEME-bg) 4px;
	border-radius: var(--MI-radius-full);
	width: 1.4rem;
	height: 1.4rem;
	aspect-ratio: 1 / 1;
}

/* 容器查询: 卡片窄时压缩(横滑行/窄网格/手机都适用) */
@container (max-width: 300px) {
	.banner { height: 104px; }
	.stats { display: none; }
	.name { font-size: 0.95em; padding: 5px 9px; }
	.footer { display: none; }
	.body { padding: 10px 12px; }
}
</style>
