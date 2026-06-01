<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe }]">
	<MkAvatar v-if="message.fromUser != null" :class="$style.avatar" :user="message.fromUser" :link="!isMe" :preview="false" @contextmenu.prevent.stop="onAvatarContextmenu"/>
	<div v-else :class="[$style.avatar, $style.avatarFallback]"><i class="ti ti-user-question"></i></div>
	<div :class="$style.body" @contextmenu.stop="onContextmenu">
		<div :class="$style.header">
			<MkUserName v-if="message.fromUser != null" :user="message.fromUser" :class="$style.sender"/>
			<div :class="$style.headerMeta" @click.stop>
				<button v-if="!isPending" class="_button" :class="$style.menuButton" @click="showMenu">
					<i class="ti ti-dots-circle-horizontal"></i>
				</button>
				<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :class="$style.contextLink" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
				<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :class="$style.contextLink" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
				<MkTime :class="$style.time" :time="message.createdAt" mode="absolute"/>
				<MkLoading v-if="isPending" :class="$style.pendingIcon" :em="true"/>
				<i v-else-if="isMe" class="ti ti-checks" :class="$style.sentIcon"></i>
			</div>
		</div>
		<div :class="[$style.bubble, { [$style.mentionedBubble]: isMentionedMe }]">
			<div v-if="isMentionedMe" :class="$style.mentionNotice"><i class="ti ti-at"></i><span>{{ i18n.ts.you }}</span></div>
			<div v-if="message.reply || message.quote || messageWithReferenceState.replyUnavailable || messageWithReferenceState.quoteUnavailable" :class="$style.references">
				<button v-if="message.reply && message.reply.id !== '0'" class="_button" :class="[$style.reference, $style.referenceButton]" @click.stop="openReference(message.reply.id)">
					<i class="ti ti-arrow-back-up"></i>
					<span>{{ i18n.ts.reply }}</span>
					<span :class="$style.referenceText">{{ getReferenceText(message.reply) }}</span>
				</button>
				<div v-else-if="message.reply || messageWithReferenceState.replyUnavailable" :class="$style.reference">
					<i class="ti ti-arrow-back-up"></i>
					<span>{{ i18n.ts.reply }}</span>
					<span :class="$style.referenceText">{{ i18n.ts.deletedNote }}</span>
				</div>
				<button v-if="message.quote && message.quote.id !== '0'" class="_button" :class="[$style.reference, $style.referenceButton]" @click.stop="openReference(message.quote.id)">
					<i class="ti ti-quote"></i>
					<span>{{ i18n.ts.quote }}</span>
					<span :class="$style.referenceText">{{ getReferenceText(message.quote) }}</span>
				</button>
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
	canDeleteAnyMessage?: boolean;
	canManageRoomUsers?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'reply', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'quote', message: NormalizedChatMessage | Misskey.entities.ChatMessage): void;
	(ev: 'openReference', messageId: string): void;
	(ev: 'deletedMany', messageIds: string[]): void;
}>();

type MessageReaction = NormalizedChatMessage['reactions'][number] | Misskey.entities.ChatMessage['reactions'][number];
type VisibleReaction = Omit<MessageReaction, 'user'> & {
	user: Misskey.entities.UserLite;
};
type MessageWithReferenceState = typeof props.message & {
	replyUnavailable?: boolean;
	quoteUnavailable?: boolean;
};
type MessageWithSendState = typeof props.message & {
	sendStatus?: 'pending';
};
type MessageWithMentionState = typeof props.message & {
	mentionedUserIds?: string[];
	hasMentionForMe?: boolean;
};

const isMe = computed(() => props.message.fromUserId === $i.id);
const isPending = computed(() => (props.message as MessageWithSendState).sendStatus === 'pending');
const canDelete = computed(() => !isPending.value && (isMe.value || props.canDeleteAnyMessage === true) && $i.policies.chatAvailability === 'available');
const canManageSender = computed(() => !isPending.value && props.canManageRoomUsers === true && !isMe.value && props.message.fromUser != null && props.message.toRoomId != null && $i.policies.chatAvailability === 'available');
const parsed = computed(() => props.message.text ? mfm.parse(props.message.text) : []);
const messageWithReferenceState = computed<MessageWithReferenceState>(() => props.message);
const isMentionedMe = computed(() => {
	const message = props.message as MessageWithMentionState;
	if (isMe.value || message.toRoomId == null) return false;
	if (message.hasMentionForMe === true) return true;
	return message.mentionedUserIds?.includes($i.id) === true;
});
const visibleReactions = computed<VisibleReaction[]>(() => {
	const records: VisibleReaction[] = [];
	for (const record of props.message.reactions) {
		if (record.user == null) continue;
		records.push({ ...record, user: record.user });
	}
	return records;
});

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if (isPending.value || $i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	});
});

function react(ev: MouseEvent) {
	if (isPending.value || $i.policies.chatAvailability !== 'available') return;

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

function onAvatarContextmenu(ev: MouseEvent) {
	if (!canManageSender.value) {
		showMenu(ev, true);
		return;
	}

	os.contextMenu(getAvatarMenu(), ev);
}

function openReference(messageId: string) {
	emit('openReference', messageId);
}

function showMenu(ev: MouseEvent, contextmenu = false) {
	if (isPending.value) return;

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

	if (canDelete.value) {
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

function getAvatarMenu(): MenuItem[] {
	const user = props.message.fromUser!;
	const roomId = props.message.toRoomId!;

	return [{
		type: 'label',
		text: user.name ?? user.username,
		caption: `@${user.username}`,
	}, {
		text: i18n.ts._chat.deleteThisMessage,
		icon: 'ti ti-trash',
		danger: true,
		action: async () => {
			const confirm = await os.confirm({
				type: 'warning',
				text: i18n.ts._chat.deleteThisMessageConfirm,
			});
			if (confirm.canceled) return;

			await os.apiWithDialog('chat/messages/delete', {
				messageId: props.message.id,
			});
		},
	}, {
		text: i18n.ts._chat.deleteUserMessagesInRoom,
		icon: 'ti ti-messages-off',
		danger: true,
		action: async () => {
			const confirm = await os.confirm({
				type: 'warning',
				text: i18n.ts._chat.deleteUserMessagesInRoomConfirm,
			});
			if (confirm.canceled) return;

			const res = await os.apiWithDialog('chat/rooms/manage/delete-user-messages', {
				roomId,
				userId: user.id,
			});
			emit('deletedMany', res.deletedIds);
		},
	}, { type: 'divider' }, {
		text: i18n.ts.suspend,
		icon: 'ti ti-user-off',
		danger: true,
		action: async () => {
			const confirm = await os.confirm({
				type: 'warning',
				text: i18n.ts.suspendConfirm,
			});
			if (confirm.canceled) return;

			await os.apiWithDialog('admin/suspend-user', {
				userId: user.id,
			});
		},
	}, {
		text: i18n.ts.silence,
		icon: 'ti ti-volume-off',
		danger: true,
		action: async () => {
			const confirm = await os.confirm({
				type: 'warning',
				text: i18n.ts.silenceConfirm,
			});
			if (confirm.canceled) return;

			await os.apiWithDialog('admin/silence-user', {
				userId: user.id,
			});
		},
	}, {
		text: i18n.ts.moderation,
		icon: 'ti ti-user-exclamation',
		action: () => {
			window.location.href = `/admin/user/${user.id}`;
		},
	}, { type: 'divider' }, {
		text: i18n.ts.reportAbuse,
		icon: 'ti ti-exclamation-circle',
		action: () => {
			const localUrl = `${url}/chat/messages/${props.message.id}`;
			const { dispose } = os.popup(defineAsyncComponent(() => import('@/components/MkAbuseReportWindow.vue')), {
				user,
				initialComment: `${localUrl}\n-----\n`,
			}, {
				closed: () => dispose(),
			});
		},
	}];
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
	--chat-message-avatar-size: 36px;
	--mk-avatar-size: var(--chat-message-avatar-size);

	flex: 0 0 var(--chat-message-avatar-size);
	display: block;
	width: var(--chat-message-avatar-size);
	height: var(--chat-message-avatar-size);
	min-width: var(--chat-message-avatar-size);
	min-height: var(--chat-message-avatar-size);
	max-width: var(--chat-message-avatar-size);
	max-height: var(--chat-message-avatar-size);
	aspect-ratio: 1 / 1;
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
		--chat-message-avatar-size: 42px;
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
.sentIcon,
.pendingIcon {
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
	// Use theme vars (not CSS light-dark()) so the bubble background always
	// tracks the SAME active theme as the text color. light-dark() resolves on
	// the element's `color-scheme`, which can disagree with the app theme (e.g.
	// app=light but OS prefers-dark) → dark bubble + light-theme dark text =
	// unreadable. Theme vars never desync from --MI_THEME-fg.
	background: var(--MI_THEME-panel);
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
	// Accent-tinted own-message bubble that works in any theme; text stays
	// --MI_THEME-fg (set on .bubble above), so it's always readable.
	background:
		linear-gradient(0deg, color(from var(--MI_THEME-accent) srgb r g b / 0.16), color(from var(--MI_THEME-accent) srgb r g b / 0.16)),
		var(--MI_THEME-panel);

	&::before {
		left: auto;
		right: -5px;
		clip-path: polygon(0 0, 100% 100%, 0 100%);
	}
}

.mentionedBubble {
	border: solid 1px color(from var(--MI_THEME-accent) srgb r g b / 0.45);
	background:
		linear-gradient(0deg, color(from var(--MI_THEME-accent) srgb r g b / 0.12), color(from var(--MI_THEME-accent) srgb r g b / 0.12)),
		var(--MI_THEME-panel);
	box-shadow: 0 0 0 3px color(from var(--MI_THEME-accent) srgb r g b / 0.12), 0 1px 2px rgb(0 0 0 / 0.16);
}

.mentionNotice {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	margin: 0 0 6px;
	padding: 2px 7px;
	border-radius: var(--MI-radius-ellipse);
	background: color(from var(--MI_THEME-accent) srgb r g b / 0.16);
	color: var(--MI_THEME-accent);
	font-size: 78%;
	font-weight: 700;
	line-height: 1.4;
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

.referenceButton {
	cursor: pointer;

	&:hover,
	&:focus-visible {
		background: color(from var(--MI_THEME-accent) srgb r g b / 0.14);
		outline: none;
	}

	&:focus-visible {
		box-shadow: 0 0 0 2px color(from var(--MI_THEME-accent) srgb r g b / 0.45);
	}
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
