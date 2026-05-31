<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div
	:class="$style.root"
	@dragover.stop="onDragover"
	@drop.stop="onDrop"
>
	<div v-if="replyTarget || quoteTarget" :class="$style.references">
		<div v-if="replyTarget" :class="$style.reference">
			<div :class="$style.referenceLabel"><i class="ti ti-arrow-back-up"></i> {{ i18n.ts.reply }}</div>
			<div :class="$style.referenceText">{{ getReferenceText(replyTarget) }}</div>
			<button class="_button" :class="$style.referenceButton" :title="i18n.ts.cancel" @click="emit('clearReply')"><i class="ti ti-x"></i></button>
		</div>
		<div v-if="quoteTarget" :class="$style.reference">
			<div :class="$style.referenceLabel"><i class="ti ti-quote"></i> {{ i18n.ts.quote }}</div>
			<div :class="$style.referenceText">{{ getReferenceText(quoteTarget) }}</div>
			<button class="_button" :class="$style.referenceButton" :title="i18n.ts.cancel" @click="emit('clearQuote')"><i class="ti ti-x"></i></button>
		</div>
	</div>
	<div v-if="file" :class="$style.file" @click="file = null"><i class="ti ti-paperclip"></i>{{ file.name }}</div>
	<div :class="$style.composer">
		<button class="_button" :class="$style.button" :title="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-paperclip"></i></button>
		<textarea
			ref="textareaEl"
			v-model="text"
			:class="$style.textarea"
			:placeholder="i18n.ts.inputMessageHere"
			:readonly="textareaReadOnly"
			@keydown="onKeydown"
			@focus="onFocus"
			@paste="onPaste"
		></textarea>
		<button class="_button" :class="$style.button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
		<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :title="i18n.ts.send" @click="send">
			<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
		</button>
	</div>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@@/js/format-time-string.js';
import type { NormalizedChatMessage } from './room.vue';
import { selectFile } from '@/utility/select-file.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { uploadFile } from '@/utility/upload.js';
import { miLocalStorage } from '@/local-storage.js';
import { misskeyApi, printError } from '@/utility/misskey-api.js';
import { prefer } from '@/preferences.js';
import { Autocomplete } from '@/utility/autocomplete.js';
import { emojiPicker } from '@/utility/emoji-picker.js';
import { ensureSignin } from '@/i.js';

const $i = ensureSignin();

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTarget?: NormalizedChatMessage | null;
	quoteTarget?: NormalizedChatMessage | null;
}>();

const emit = defineEmits<{
	(ev: 'sending', message: NormalizedChatMessage): void;
	(ev: 'sent', message: Misskey.entities.ChatMessageLite, clientId: string): void;
	(ev: 'sendFailed', clientId: string): void;
	(ev: 'restoreReferences', payload: { replyTarget: NormalizedChatMessage | null; quoteTarget: NormalizedChatMessage | null }): void;
	(ev: 'clearReply'): void;
	(ev: 'clearQuote'): void;
}>();

type SendTarget =
	| { type: 'user'; user: Misskey.entities.UserDetailed }
	| { type: 'room'; room: Misskey.entities.ChatRoom };

type SendSnapshot = {
	clientId: string;
	target: SendTarget;
	text: string;
	file: Misskey.entities.DriveFile | null;
	replyTarget: NormalizedChatMessage | null;
	quoteTarget: NormalizedChatMessage | null;
};

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;
let focusScrollTimers: number[] = [];
let sendSerial = 0;

const canSend = computed(() => (text.value != null && text.value !== '') || file.value != null);

function getDraftKey(): string | null {
	if (props.user) return 'user:' + props.user.id;
	if (props.room) return 'room:' + props.room.id;
	return null;
}

watch([text, file], saveDraft);

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const items = clipboardData.items;

	if (items.length === 1) {
		if (items[0].kind === 'file') {
			const pastedFile = items[0].getAsFile();
			if (!pastedFile) return;
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formatted = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, '1') + ext;
			if (formatted) upload(pastedFile, formatted);
		}
	} else {
		if (items[0].kind === 'file') {
			os.alert({
				type: 'error',
				text: i18n.ts.onlyOneFileCanBeAttached,
			});
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0].kind === 'file';
	const isDriveFile = ev.dataTransfer.types[0] === _DATA_TRANSFER_DRIVE_FILE_;
	if (isFile || isDriveFile) {
		ev.preventDefault();
		switch (ev.dataTransfer.effectAllowed) {
			case 'all':
			case 'uninitialized':
			case 'copy':
			case 'copyLink':
			case 'copyMove':
				ev.dataTransfer.dropEffect = 'copy';
				break;
			case 'linkMove':
			case 'move':
				ev.dataTransfer.dropEffect = 'move';
				break;
			default:
				ev.dataTransfer.dropEffect = 'none';
				break;
		}
	}
}

function onDrop(ev: DragEvent): void {
	if (!ev.dataTransfer) return;

	// ファイルだったら
	if (ev.dataTransfer.files.length === 1) {
		ev.preventDefault();
		upload(ev.dataTransfer.files[0]);
		return;
	} else if (ev.dataTransfer.files.length > 1) {
		ev.preventDefault();
		os.alert({
			type: 'error',
			text: i18n.ts.onlyOneFileCanBeAttached,
		});
		return;
	}

	//#region ドライブのファイル
	const driveFile = ev.dataTransfer.getData(_DATA_TRANSFER_DRIVE_FILE_);
	if (driveFile != null && driveFile !== '') {
		file.value = JSON.parse(driveFile);
		ev.preventDefault();
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (prefer.s['chat.sendOnEnter']) {
			if (!(ev.ctrlKey || ev.metaKey || ev.shiftKey)) {
				ev.preventDefault();
				send();
			}
		} else {
			if ((ev.ctrlKey || ev.metaKey)) {
				ev.preventDefault();
				send();
			}
		}
	}
}

function onFocus() {
	scrollTextareaIntoViewAfterFocus();
}

function focus() {
	textareaEl.value?.focus();
}

function scrollTextareaIntoViewAfterFocus() {
	for (const timer of focusScrollTimers) {
		window.clearTimeout(timer);
	}

	focusScrollTimers = [0, 120, 320, 640].map(delay => window.setTimeout(() => {
		textareaEl.value?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}, delay));
}

function onVisualViewportChange() {
	if (window.document.activeElement === textareaEl.value) {
		scrollTextareaIntoViewAfterFocus();
	}
}

function chooseFile(ev: MouseEvent) {
	selectFile(ev.currentTarget ?? ev.target, i18n.ts.selectFile).then(selectedFile => {
		file.value = selectedFile;
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	if (fileEl.value.files[0]) upload(fileEl.value.files[0]);
}

function upload(fileToUpload: File, name?: string) {
	uploadFile(fileToUpload, prefer.s.uploadFolder, name).then(res => {
		file.value = res;
	});
}

function getSendTarget(): SendTarget | null {
	if (props.user) return { type: 'user', user: props.user };
	if (props.room) return { type: 'room', room: props.room };
	return null;
}

function createSendSnapshot(target: SendTarget): SendSnapshot {
	return {
		clientId: `${Date.now()}-${++sendSerial}`,
		target,
		text: text.value,
		file: file.value,
		replyTarget: props.replyTarget ?? null,
		quoteTarget: props.quoteTarget ?? null,
	};
}

function createOptimisticMessage(snapshot: SendSnapshot): NormalizedChatMessage {
	return {
		id: `~chat-pending-${snapshot.clientId}`,
		clientId: snapshot.clientId,
		sendStatus: 'pending',
		createdAt: new Date().toISOString(),
		fromUserId: $i.id,
		fromUser: $i,
		toUserId: snapshot.target.type === 'user' ? snapshot.target.user.id : null,
		toRoomId: snapshot.target.type === 'room' ? snapshot.target.room.id : null,
		text: snapshot.text !== '' ? snapshot.text : null,
		fileId: snapshot.file?.id ?? null,
		file: snapshot.file,
		replyId: snapshot.replyTarget?.id ?? null,
		reply: snapshot.replyTarget,
		quoteId: snapshot.quoteTarget?.id ?? null,
		quote: snapshot.quoteTarget,
		replyUnavailable: false,
		quoteUnavailable: false,
		reactions: [],
	};
}

async function send() {
	if (sending.value || !canSend.value) return;

	const target = getSendTarget();
	if (target == null) return;

	const snapshot = createSendSnapshot(target);
	sending.value = true;
	emit('sending', createOptimisticMessage(snapshot));
	clear();

	try {
		const message = target.type === 'user' ? await misskeyApi('chat/messages/create-to-user', {
			toUserId: target.user.id,
			text: snapshot.text !== '' ? snapshot.text : undefined,
			fileId: snapshot.file?.id,
			replyId: snapshot.replyTarget?.id,
			quoteId: snapshot.quoteTarget?.id,
		}) : await misskeyApi('chat/messages/create-to-room', {
			toRoomId: target.room.id,
			text: snapshot.text !== '' ? snapshot.text : undefined,
			fileId: snapshot.file?.id,
			replyId: snapshot.replyTarget?.id,
			quoteId: snapshot.quoteTarget?.id,
		});

		emit('sent', message, snapshot.clientId);
	} catch (err) {
		console.error('Error in chat:', err);
		emit('sendFailed', snapshot.clientId);
		restoreSnapshotIfIdle(snapshot);
		void os.alert({
			type: 'error',
			title: i18n.ts.error,
			text: printError(err),
		});
	} finally {
		sending.value = false;
	}
}

function clear() {
	text.value = '';
	file.value = null;
	emit('clearReply');
	emit('clearQuote');
	deleteDraft();
}

function restoreSnapshotIfIdle(snapshot: SendSnapshot) {
	if (text.value !== '' || file.value != null) return;

	text.value = snapshot.text;
	file.value = snapshot.file;
	emit('restoreReferences', {
		replyTarget: snapshot.replyTarget,
		quoteTarget: snapshot.quoteTarget,
	});
}

function getReferenceText(message: NormalizedChatMessage | Misskey.entities.ChatMessageLite) {
	return message.text ?? message.file?.name ?? i18n.ts.file;
}

function saveDraft() {
	const draftKey = getDraftKey();
	if (draftKey == null) return;

	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	if (!canSend.value) {
		delete drafts[draftKey];
	} else {
		drafts[draftKey] = {
			updatedAt: new Date(),
			data: {
				text: text.value,
				file: file.value,
			},
		};
	}

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const draftKey = getDraftKey();
	if (draftKey == null) return;

	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[draftKey];

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

async function insertEmoji(ev: MouseEvent) {
	textareaReadOnly.value = true;
	const target = ev.currentTarget ?? ev.target;
	if (target == null) return;

	// emojiPickerはダイアログが閉じずにtextareaとやりとりするので、
	// focustrapをかけているとinsertTextAtCursorが効かない
	// そのため、投稿フォームのテキストに直接注入する
	// See: https://github.com/misskey-dev/misskey/pull/14282
	//      https://github.com/misskey-dev/misskey/issues/14274

	let pos = textareaEl.value?.selectionStart ?? 0;
	let posEnd = textareaEl.value?.selectionEnd ?? text.value.length;
	emojiPicker.show(
		target as HTMLElement,
		emoji => {
			const textBefore = text.value.substring(0, pos);
			const textAfter = text.value.substring(posEnd);
			text.value = textBefore + emoji + textAfter;
			pos += emoji.length;
			posEnd += emoji.length;
		},
		() => {
			textareaReadOnly.value = false;
			nextTick(() => focus());
		},
		true,
	);
}

defineExpose({
	focus,
});

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	window.visualViewport?.addEventListener('resize', onVisualViewportChange);
	window.visualViewport?.addEventListener('scroll', onVisualViewportChange);

	// 書きかけの投稿を復元
	const draftKey = getDraftKey();
	const draft = draftKey == null ? null : JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[draftKey];
	if (draft) {
		text.value = draft.data.text;
		file.value = draft.data.file;
	}
});

onBeforeUnmount(() => {
	window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
	window.visualViewport?.removeEventListener('scroll', onVisualViewportChange);

	for (const timer of focusScrollTimers) {
		window.clearTimeout(timer);
	}
	focusScrollTimers = [];

	if (autocompleteInstance) {
		autocompleteInstance.detach();
		autocompleteInstance = null;
	}
});
</script>

<style lang="scss" module>
.root {
	position: relative;
	border-bottom: none;
	display: grid;
	gap: 6px;
	border-radius: 0;
	background: transparent;
}

.references {
	display: grid;
	gap: 4px;
	padding: 4px 8px 0;
	background: transparent;
}

.reference {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	padding: 6px 9px;
	border-left: solid 3px light-dark(#2aabee, #6ab7f5);
	border-radius: 12px;
	background: light-dark(rgb(237 248 255), rgb(34 49 62));
	font-size: 90%;
	text-align: left;
}

.referenceLabel {
	font-weight: 700;
	color: light-dark(#168acd, #6ab7f5);
}

.referenceText {
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--MI_THEME-fgTransparentWeak);
}

.referenceButton {
	display: grid;
	place-items: center;
	width: 28px;
	height: 28px;
	border-radius: var(--MI-radius-xs);
	color: var(--MI_THEME-fg);
	background: var(--MI_THEME-buttonBg);

	&:hover,
	&:focus-visible {
		color: var(--MI_THEME-accent);
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.textarea {
	cursor: auto;
	display: block;
	width: 100%;
	min-width: 100%;
	max-width: 100%;
	min-height: 20px;
	max-height: 96px;
	margin: 0;
	padding: 7px 2px;
	resize: none;
	font-size: 0.98em;
	line-height: 1.35;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	background: transparent;
	field-sizing: content;
}

.composer {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto auto;
	align-items: end;
	gap: 4px;
	padding: 4px;
	border-radius: 21px;
	background: light-dark(#ffffff, #17212b);
	border: solid 1px light-dark(rgb(206 221 230), rgb(35 48 60));
	box-shadow: 0 2px 10px rgb(0 0 0 / 0.14);
}

.file {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	width: fit-content;
	max-width: min(420px, 100%);
	margin-left: 8px;
	padding: 5px 10px;
	cursor: pointer;
	border-radius: 999px;
	background: light-dark(rgb(225 244 255), rgb(34 49 62));
	color: light-dark(#168acd, #6ab7f5);
	font-size: 90%;
	overflow: hidden;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.button {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	aspect-ratio: 1;
	border-radius: 999px;
	color: light-dark(#7b8b96, #8fa4b8);

	&:hover {
		color: light-dark(#168acd, #6ab7f5);
		background: light-dark(rgb(225 244 255), rgb(34 49 62));
	}
}
.send {
	margin-left: auto;
	color: #fff;
	background: light-dark(#2aabee, #5288c1);

	&:hover {
		color: #fff;
		background: light-dark(#229ed9, #63a1dd);
	}

	&:disabled {
		opacity: 0.45;
		background: var(--MI_THEME-buttonBg);
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

@container (max-width: 500px) {
	.textarea {
		max-height: 72px;
	}

	.button {
		width: 32px;
		height: 32px;
	}
}
</style>
