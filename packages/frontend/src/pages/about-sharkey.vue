<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkStickyContainer>
	<template #header><MkPageHeader :actions="headerActions" :tabs="headerTabs"/></template>
	<div style="overflow: clip;">
		<div class="_spacer" style="--MI_SPACER-w: 600px; --MI_SPACER-min: 20px;">
			<div class="_gaps_m znqjceqz">
				<div v-panel class="about">
					<div ref="containerEl" class="container" :class="{ playing: easterEggEngine != null }">
						<img src="/client-assets/about-icon.png" alt="" class="icon" draggable="false" @load="iconLoaded" @click="gravity"/>
						<div class="misskey">hhhl</div>
						<div class="version">v{{ version }}</div>
						<span v-for="emoji in easterEggEmojis" :key="emoji.id" class="emoji" :data-physics-x="emoji.left" :data-physics-y="emoji.top" :class="{ _physics_circle_: !emoji.emoji.startsWith(':') }">
							<MkCustomEmoji v-if="emoji.emoji[0] === ':'" class="emoji" :name="emoji.emoji" :normal="true" :noStyle="true" :fallbackToImage="true"/>
							<MkEmoji v-else class="emoji" :emoji="emoji.emoji" :normal="true" :noStyle="true"/>
						</span>
					</div>
					<button v-if="thereIsTreasure" class="_button treasure" @click="getTreasure"><img src="/fluent-emoji/1f3c6.png" class="treasureImg"></button>
				</div>
				<div style="text-align: center;">
					{{ instance.name ?? host }}
				</div>
				<div v-if="$i != null" style="text-align: center;">
					<MkButton primary rounded inline @click="iLoveMisskey">I <Mfm text="$[jelly ❤]"/> #hhhl</MkButton>
				</div>
				<FormSection v-for="section in everyone" :key="section.heading">
					<template #label>{{ section.heading }}</template>
					<div :class="$style.contributors" style="margin-bottom: 8px;">
						<a v-for="person in section.people" :key="person.handle" :href="person.link" target="_blank" :class="$style.contributor">
							<img :src="person.avatar" :class="$style.contributorAvatar">
							<span :class="$style.contributorUsername">{{ person.handle }}</span>
						</a>
					</div>
					<template v-if="section.link" #description><MkLink :url="section.link.url">{{ section.link.label }}</MkLink></template>
				</FormSection>
			</div>
		</div>
	</div>
</MkStickyContainer>
</template>

<script lang="ts" setup>
import { nextTick, onBeforeUnmount, ref, computed, useTemplateRef } from 'vue';
import { host, version } from '@@/js/config.js';
import FormSection from '@/components/form/section.vue';
import MkButton from '@/components/MkButton.vue';
import MkLink from '@/components/MkLink.vue';
import { physics } from '@/utility/physics.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import * as os from '@/os.js';
import { claimAchievement, claimedAchievements } from '@/utility/achievements.js';
import { $i } from '@/i';
import { definePage } from '@/page';
import { store } from '@/store.js';

type Section = {
	heading: string,
	link?: {
		label: string,
		url: string,
	},
	people: {
		handle: string,
		avatar: string,
		link?: string
	}[],
};

const thereIsTreasure = ref($i && !claimedAchievements.includes('foundTreasure'));

let easterEggReady = false;
const easterEggEmojis = ref<{
	id: string,
	top: number,
	left: number,
	emoji: string
}[]>([]);
const easterEggEngine = ref<{ stop: () => void } | null>(null);
const everyone = ref<Section[]>([
	{
		heading: i18n.ts._aboutMisskey.projectMembers,
		link: {
			label: i18n.ts._aboutMisskey.allContributors,
			url: 'https://activitypub.software/TransFem-org/Sharkey/-/graphs/develop',
		},
		people: fisher_yates([
			{
				handle: '@CenTdemeern1',
				avatar: 'https://secure.gravatar.com/avatar/e97dd57d32caf703cea556ace6304617b7420f17f5b1aac4a1eea8e4234735bb?s=128&d=identicon',
				link: 'https://activitypub.software/CenTdemeern1',
			},
			{
				handle: '@dakkar',
				avatar: 'https://secure.gravatar.com/avatar/c71b315eed7c63ff94c42b1b3e8dbad1?s=128&d=identicon',
				link: 'https://activitypub.software/dakkar',
			},
			{
				handle: '@hazelnoot',
				avatar: 'https://activitypub.software/uploads/-/system/user/avatar/5/avatar.png?width=128',
				link: 'https://activitypub.software/fEmber',
			},
			{
				handle: '@julia',
				avatar: 'https://activitypub.software/uploads/-/system/user/avatar/41/avatar.png?width=128',
				link: 'https://activitypub.software/julia',
			},
			{
				handle: '@Luna',
				avatar: 'https://secure.gravatar.com/avatar/4faf37df86a3d93a6c19ed6abf8588eade4efb837410dbbc53021b4fd12eaae7?s=128&d=identicon',
				link: 'https://activitypub.software/luna',
			},
			{
				handle: '@Marie',
				avatar: 'https://activitypub.software/uploads/-/system/user/avatar/2/avatar.png?width=128',
				link: 'https://activitypub.software/marie',
			},
			{
				handle: '@supakaity',
				avatar: 'https://activitypub.software/uploads/-/system/user/avatar/65/avatar.png?width=128',
				link: 'https://activitypub.software/supakaity',
			},
			{
				handle: '@tess',
				avatar: 'https://activitypub.software/uploads/-/system/user/avatar/132/avatar.png?width=128',
				link: 'https://activitypub.software/tess',
			},
			{
				handle: '@bunnybeam',
				avatar: 'https://secure.gravatar.com/avatar/25736ba5847665e58884874e87042324e9233885263cb982bfa19f667b8304ae?s=128&d=identicon',
				link: 'https://activitypub.software/bunnybeam',
			},
		]),
	},
	{
		heading: i18n.ts._aboutMisskey.testers,
		people: [
			{
				handle: '@lucent',
				avatar: 'https://antani.cyou/proxy/avatar.webp?url=https%3A%2F%2Fantani.cyou%2Ffiles%2Fa2944119-024c-4abd-86e5-64bf0d30b26f&avatar=1',
				link: 'https://antani.cyou/@lucent',
			},
			{
				handle: '@privateger',
				avatar: 'https://mediaproxy.plasmatrap.com/?url=https%3A%2F%2Fplasmatrap.com%2Ffiles%2F2cf35a8f-6520-4d4c-9611-bf22ee983293&avatar=1',
				link: 'https://plasmatrap.com/@privateger',
			},
			{
				handle: '@phoenix_fairy',
				avatar: 'https://thetransagenda.gay/proxy/avatar.webp?url=https%3A%2F%2Fs3.us-east-005.backblazeb2.com%2Ftranssharkey%2Fnull%2Fd93ac6dc-2020-4b5a-bce7-84b41e97a0ac.png&avatar=1',
				link: 'https://thetransagenda.gay/@phoenix_fairy',
			},
		],
	},
]);
const containerEl = useTemplateRef('containerEl');

/**
 * Based on the pseudocode description from Wikipedia:
 * https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle
 * Modifies the array in-place, but still returns it for the sake of convenience
 */
function fisher_yates<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

function iconLoaded() {
	if (!containerEl.value) return;
	const emojis = store.s.reactions;
	const containerWidth = containerEl.value.offsetWidth;
	for (let i = 0; i < 32; i++) {
		easterEggEmojis.value.push({
			id: i.toString(),
			top: -(128 + (Math.random() * 256)),
			left: (Math.random() * containerWidth),
			emoji: emojis[Math.floor(Math.random() * emojis.length)],
		});
	}

	nextTick(() => {
		easterEggReady = true;
	});
}

function gravity() {
	if (!easterEggReady || !containerEl.value) return;
	easterEggReady = false;
	easterEggEngine.value = physics(containerEl.value);
}

function iLoveMisskey() {
	os.post({
		initialText: 'I $[jelly ❤] #hhhl',
		instant: true,
	});
}

function getTreasure() {
	thereIsTreasure.value = false;
	claimAchievement('foundTreasure');
}

onBeforeUnmount(() => {
	if (easterEggEngine.value) {
		easterEggEngine.value.stop();
	}
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: instance.name ?? host,
	icon: null,
}));
</script>

<style lang="scss" scoped>
.znqjceqz {
	> .about {
		position: relative;
		border-radius: var(--MI-radius);

		> .treasure {
			position: absolute;
			top: 60px;
			left: 0;
			right: 0;
			margin: 0 auto;
			width: min-content;

			> .treasureImg {
				width: 25px;
				vertical-align: bottom;
			}
		}

		> .container {
			position: relative;
			text-align: center;
			padding: 16px;

			&.playing {
				&, * {
					user-select: none;
				}

				* {
					will-change: transform;
				}

				> .emoji {
					visibility: visible;
				}
			}

			> .icon {
				display: block;
				width: 80px;
				margin: 0 auto;
				border-radius: var(--MI-radius-md);
				position: relative;
				z-index: 1;
				transform: translateX(-10%);
			}

			> .misskey {
				margin: 0.75em auto 0 auto;
				width: max-content;
				position: relative;
				z-index: 1;
			}

			> .version {
				margin: 0 auto;
				width: max-content;
				opacity: 0.5;
				position: relative;
				z-index: 1;
			}

			> .emoji {
				position: absolute;
				z-index: 1;
				top: 0;
				left: 0;
				visibility: hidden;

				> .emoji {
					pointer-events: none;
					font-size: 24px;
					width: 24px;
				}
			}
		}
	}
}
</style>

<style lang="scss" module>
.contributors {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.contributor {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-sm);

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.active {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.contributorAvatar {
	width: 30px;
	border-radius: var(--MI-radius-full);
}

.contributorUsername {
	margin-left: 12px;
}

.patronsWithIcon {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	grid-gap: 12px;
}

.patronWithIcon {
	display: flex;
	align-items: center;
	padding: 12px;
	background: var(--MI_THEME-buttonBg);
	border-radius: var(--MI-radius-sm);
}

.patronIcon {
	width: 24px;
	border-radius: var(--MI-radius-full);
}

.patronName {
	margin-left: 12px;
}
</style>
