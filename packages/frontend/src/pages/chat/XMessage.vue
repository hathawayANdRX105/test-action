<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar v-if="message.fromUser != null" :class="$style.avatar" :user="message.fromUser" :link="!isMe" :preview="false"/>
	<div v-else :class="[$style.avatar, $style.avatarFallback]"><i class="ti ti-user-question"></i></div>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<div :class="$style.header">
			<MkUserName v-if="message.fromUser != null" :user="message.fromUser" :class="$style.sender"/>
			<div :class="$style.headerMeta" @click.stop>
				<button class="_button" :class="$style.menuButton" @click="showMenu">
					<i class="ti ti-dots-circle-horizontal"></i>
				</button>
				<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :class="$style.contextLink" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
				<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :class="$style.contextLink" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
				<MkTime :class="$style.time" :time="message.createdAt" mode="absolute"/>
				<i v-if="isMe" class="ti ti-checks" :class="$style.sentIcon"></i>
			</div>
		</div>
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
		</div>
		<div class="_gaps_s" style="margin: 8px 0;" @click.stop>
			<SkUrlPreviewGroup :sourceNodes="parsed" :showAsQuote="!message.fromUser?.rejectQuotes"/>
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
	align-items: flex-start;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
	overflow: clip;

	&.isMe {
		flex-direction: row-reverse;
		justify-content: flex-start;
		text-align: right;

		.avatar {
			display: none;
		}
	}
}

.avatar {
	flex: 0 0 36px;
	display: block;
	width: 36px;
	height: 36px;
	margin-top: 24px;
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
	flex: 0 1 min(76%, 640px);
	margin: 0 8px;
	max-width: min(76%, 640px);
	box-sizing: border-box;

	// https://stackoverflow.com/questions/36230944/prevent-flex-items-from-overflowing-a-container
	min-width: 0;
}

.isMe .body {
	display: flex;
	flex-direction: column;
	align-items: flex-end;
	flex-basis: min(76%, 640px);
	max-width: min(76%, 640px);
}

.header {
	display: flex;
	align-items: center;
	gap: 8px;
	width: fit-content;
	max-width: 100%;
	min-height: 20px;
	margin: 0 4px 4px;
	font-size: 80%;
	color: light-dark(#168acd, #6ab7f5);
}

.sender {
	flex: 0 1 auto;
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.headerMeta {
	display: inline-flex;
	flex: 0 1 auto;
	align-items: center;
	gap: 4px;
	min-width: 0;
	color: light-dark(#7e8b94, #abc4d8);
	line-height: 1.3;
	white-space: nowrap;
	user-select: none;
}

.menuButton {
	display: inline-grid;
	flex: 0 0 auto;
	place-items: center;
	width: 18px;
	height: 18px;
	border-radius: 999px;
	color: currentColor;
	font-size: 1em;

	&:hover {
		background: color(from var(--MI_THEME-fg) srgb r g b / 0.08);
	}
}

.contextLink {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	color: inherit;
}

.time,
.sentIcon {
	flex: 0 0 auto;
}

.bubble {
	position: relative;
	display: inline-block;
	width: fit-content;
	min-width: 72px;
	max-width: 100%;
	min-inline-size: 0;
	box-sizing: border-box;
	padding: 8px 12px;
	border-radius: 18px 18px 18px 6px;
	text-align: left;
	overflow-wrap: break-word;
	word-break: break-word;
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

.bubble > :global(*) {
	max-width: 100%;
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

.isMe .header {
	align-self: flex-end;
	flex-direction: row-reverse;
	justify-content: flex-start;
	text-align: right;
}

.isMe .sender {
	display: none;
}

.references {
	display: grid;
	gap: 6px;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	margin-bottom: 8px;
	overflow: hidden;
}

.reference {
	display: grid;
	grid-template-columns: auto auto minmax(0, 1fr);
	gap: 6px;
	align-items: center;
	width: 100%;
	max-width: 100%;
	min-width: 0;
	box-sizing: border-box;
	padding: 7px 9px;
	border-left: solid 3px var(--MI_THEME-accent);
	border-radius: var(--MI-radius-xs);
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.06);
	color: var(--MI_THEME-fg);
	font-size: 85%;
	text-align: left;
	overflow: hidden;
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
	max-width: 100%;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	max-width: 100%;
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
