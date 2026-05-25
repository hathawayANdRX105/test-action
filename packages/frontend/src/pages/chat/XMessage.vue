<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar v-if="message.fromUser != null" :class="$style.avatar" :user="message.fromUser" :link="!isMe" :preview="false"/>
	<div v-else :class="[$style.avatar, $style.avatarFallback]"><i class="ti ti-user-question"></i></div>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<div :class="$style.header"><MkUserName v-if="!isMe && message.fromUser != null" :user="message.fromUser"/></div>
		<div :class="$style.bubble">
			<div v-if="message.reply || message.quote || messageWithReferenceState.replyUnavailable || messageWithReferenceState.quoteUnavailable" :class="$style.references">
				<MkA v-if="message.reply && message.reply.id !== '0'" :to="`/chat/messages/${message.reply.id}`" :class="$style.reference">
					<i class="ti ti-arrow-back-up"></i>
					<span>{{ i18n.ts.reply }}</span>
					<span :class="$style.referenceText">{{ getReferenceText(message.reply) }}</span>
				</MkA>
				<div v-else-if="message.reply || messageWithReferenceState.replyUnavailable" :class="$style.reference">
					<i class="ti ti-arrow-back-up"></i>
					<span>{{ i18n.ts.reply }}</span>
					<span :class="$style.referenceText">{{ i18n.ts.deletedNote }}</span>
				</div>
				<MkA v-if="message.quote && message.quote.id !== '0'" :to="`/chat/messages/${message.quote.id}`" :class="$style.reference">
					<i class="ti ti-quote"></i>
					<span>{{ i18n.ts.quote }}</span>
					<span :class="$style.referenceText">{{ getReferenceText(message.quote) }}</span>
				</MkA>
				<div v-else-if="message.quote || messageWithReferenceState.quoteUnavailable" :class="$style.reference">
					<i class="ti ti-quote"></i>
					<span>{{ i18n.ts.quote }}</span>
					<span :class="$style.referenceText">{{ i18n.ts.deletedNote }}</span>
				</div>
			</div>
			<Mfm
				v-if="message.text"
				ref="text"
				class="_selectable"
				:text="message.text"
				:parsedNotes="parsed"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]" :class="$style.file"/>
			<div :class="$style.bubbleMeta">
				<MkTime :class="$style.time" :time="message.createdAt"/>
				<i v-if="isMe" class="ti ti-checks"></i>
			</div>
		</div>
		<div class="_gaps_s" style="margin: 8px 0;" @click.stop>
			<SkUrlPreviewGroup :sourceNodes="parsed" :showAsQuote="!message.fromUser?.rejectQuotes"/>
		</div>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" @click="showMenu"><i class="ti ti-dots-circle-horizontal"></i></button>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<SkTransitionGroup
			:enterActiveClass="$style.transition_reaction_enterActive"
			:leaveActiveClass="$style.transition_reaction_leaveActive"
			:enterFromClass="$style.transition_reaction_enterFrom"
			:leaveToClass="$style.transition_reaction_leaveTo"
			:moveClass="$style.transition_reaction_move"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in visibleReactions" :key="record.reaction + record.user.id" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</SkTransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, provide } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@@/js/config.js';
import { isLink } from '@@/js/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/components/MkMediaList.vue';
import { reactionPicker } from '@/utility/reaction-picker.js';
import * as sound from '@/utility/sound.js';
import MkReactionIcon from '@/components/MkReactionIcon.vue';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';
import SkTransitionGroup from '@/components/SkTransitionGroup.vue';
import SkUrlPreviewGroup from '@/components/SkUrlPreviewGroup.vue';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
	enableReferenceActions?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'reply', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'quote', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
}>();

type MessageReaction = NormalizedChatMessage['reactions'][number] | Misskey.entities.ChatMessage['reactions'][number];
type VisibleReaction = Omit<MessageReaction, 'user'> & {
	user: Misskey.entities.UserLite;
};
type MessageWithReferenceState = typeof props.message & {
	replyUnavailable?: boolean;
	quoteUnavailable?: boolean;
};

const isMe = computed(() => props.message.fromUserId === $i.id);
const parsed = computed(() => props.message.text ? mfm.parse(props.message.text) : []);
const messageWithReferenceState = computed<MessageWithReferenceState>(() => props.message);
const visibleReactions = computed<VisibleReaction[]>(() => {
	const records: VisibleReaction[] = [];
	for (const record of props.message.reactions) {
		if (record.user == null) continue;
		records.push({ ...record, user: record.user });
	}
	return records;
});

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if ($i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	});
});

function react(ev: MouseEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.message.id,
			reaction: reaction,
		});
	});
}

function onReactionClick(record: VisibleReaction) {
	if ($i.policies.chatAvailability !== 'available') return;

	if (record.user.id === $i.id) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.message.id,
			reaction: record.reaction,
		});
	} else {
		if (!props.message.reactions.some(r => r.user != null && r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			misskeyApi('chat/messages/react', {
				messageId: props.message.id,
				reaction: record.reaction,
			});
		}
	}
}

function onContextmenu(ev: MouseEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: MouseEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (props.enableReferenceActions && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reply,
			icon: 'ti ti-arrow-back-up',
			action: () => emit('reply', props.message),
		});

		menu.push({
			text: i18n.ts.quote,
			icon: 'ti ti-quote',
			action: () => emit('quote', props.message),
		});

		menu.push({
			type: 'divider',
		});
	}

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reaction,
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.message.id,
				});
			},
		});
	}

	if (!isMe.value && props.message.fromUser != null) {
		menu.push({
			text: i18n.ts.reportAbuse,
			icon: 'ti ti-exclamation-circle',
			action: () => {
				const localUrl = `${url}/chat/messages/${props.message.id}`;
				const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkAbuseReportWindow.vue')), {
					user: props.message.fromUser!,
					initialComment: `${localUrl}\n-----\n`,
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}

function getReferenceText(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage) {
	return message.text ?? message.file?.name ?? i18n.ts.file;
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;
	align-items: flex-end;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.avatar {
			display: none;
		}

		.footer {
			flex-direction: row-reverse;
		}
	}
}

.avatar {
	display: block;
	width: 36px;
	height: 36px;
	margin-bottom: 4px;
}

.avatarFallback {
	display: grid;
	place-items: center;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--MI_THEME-fgTransparentWeak);
}

@container (max-width: 450px) {
	.root {
		&.isMe {
			.avatar {
				display: none;
			}
		}
	}

	.avatar {
		width: 42px;
		height: 42px;
	}

	.body {
		max-width: calc(100% - 52px);
	}
}

.body {
	margin: 0 8px;
	max-width: min(76%, 640px);

	// https://stackoverflow.com/questions/36230944/prevent-flex-items-from-overflowing-a-container
	min-width: 0;
}

.header {
	min-height: 4px;
	font-size: 80%;
	color: light-dark(#168acd, #6ab7f5);
}

.bubble {
	position: relative;
	display: inline-block;
	min-width: 72px;
	max-width: 100%;
	padding: 8px 12px 18px;
	border-radius: 18px 18px 18px 6px;
	text-align: left;
	background: light-dark(#ffffff, #182533);
	color: var(--MI_THEME-fg);
	box-shadow: 0 1px 2px rgb(0 0 0 / 0.16);

	&::before {
		content: "";
		position: absolute;
		left: -5px;
		bottom: 0;
		width: 10px;
		height: 12px;
		background: inherit;
		clip-path: polygon(100% 0, 100% 100%, 0 100%);
	}
}

.isMe .bubble {
	border-radius: 18px 18px 6px 18px;
	background: light-dark(#effdde, #2b5278);

	&::before {
		left: auto;
		right: -5px;
		clip-path: polygon(0 0, 100% 100%, 0 100%);
	}
}

.references {
	display: grid;
	gap: 6px;
	margin-bottom: 8px;
}

.reference {
	display: grid;
	grid-template-columns: auto auto minmax(0, 1fr);
	gap: 6px;
	align-items: center;
	width: 100%;
	min-width: 0;
	padding: 7px 9px;
	border-left: solid 3px var(--MI_THEME-accent);
	border-radius: var(--MI-radius-xs);
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.06);
	color: var(--MI_THEME-fg);
	font-size: 85%;
	text-align: left;
}

.bubbleMeta {
	position: absolute;
	right: 10px;
	bottom: 4px;
	display: inline-flex;
	align-items: center;
	gap: 3px;
	font-size: 72%;
	color: light-dark(#7e8b94, #abc4d8);
	user-select: none;
}

.referenceText {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--MI_THEME-fgTransparentWeak);
}

.content {
	overflow: clip;
	overflow-wrap: break-word;
	word-break: break-word;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin: 4px 6px 0;
	font-size: 75%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.time {
	opacity: 1;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-top: 8px;

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: 999px;
	padding: 4px 8px;
	background: light-dark(#ffffff, #182533);

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: 8px;
}

.reactionIcon {
	width: 24px;
	height: 24px;
}
</style>
