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
	<textarea
		ref="textareaEl"
		v-model="text"
		:class="$style.textarea"
		class="_acrylic"
		:placeholder="i18n.ts.inputMessageHere"
		:readonly="textareaReadOnly"
		@keydown="onKeydown"
		@focus="onFocus"
		@paste="onPaste"
	></textarea>
	<footer :class="$style.footer">
		<div v-if="file" :class="$style.file" @click="file = null">{{ file.name }}</div>
		<div :class="$style.buttons">
			<button class="_button" :class="$style.button" @click="chooseFile"><i class="ti ti-photo-plus"></i></button>
			<button class="_button" :class="$style.button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
			<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending" :title="i18n.ts.send" @click="send">
				<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
			</button>
		</div>
	</footer>
	<input ref="fileEl" style="display: none;" type="file" @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, readonly, onBeforeUnmount } from 'vue';
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

const props = defineProps<{
	user?: Misskey.entities.UserDetailed | null;
	room?: Misskey.entities.ChatRoom | null;
	replyTarget?: NormalizedChatMessage | null;
	quoteTarget?: NormalizedChatMessage | null;
}>();

const emit = defineEmits<{
	(ev: 'sent', message: Misskey.entities.ChatMessageLite): void;
	(ev: 'clearReply'): void;
	(ev: 'clearQuote'): void;
}>();

const textareaEl = shallowRef<HTMLTextAreaElement>();
const fileEl = shallowRef<HTMLInputElement>();

const text = ref<string>('');
const file = ref<Misskey.entities.DriveFile | null>(null);
const sending = ref(false);
const textareaReadOnly = ref(false);
let autocompleteInstance: Autocomplete | null = null;
let focusScrollTimers: number[] = [];

const canSend = computed(() => (text.value != null && text.value !== '') || file.value != null);

function getDraftKey() {
	return props.user ? 'user:' + props.user.id : 'room:' + props.room?.id;
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

function send() {
	if (!canSend.value) return;

	sending.value = true;

	if (props.user) {
		misskeyApi('chat/messages/create-to-user', {
			toUserId: props.user.id,
			text: text.value ? text.value : undefined,
			fileId: file.value ? file.value.id : undefined,
			replyId: props.replyTarget?.id,
			quoteId: props.quoteTarget?.id,
		}).then(message => {
			emit('sent', message);
			clear();
		}).catch(err => {
			console.error('Error in chat:', err);
			return os.alert({
				type: 'error',
				title: i18n.ts.error,
				text: printError(err),
			});
		}).finally(() => {
			sending.value = false;
		});
	} else if (props.room) {
		misskeyApi('chat/messages/create-to-room', {
			toRoomId: props.room.id,
			text: text.value ? text.value : undefined,
			fileId: file.value ? file.value.id : undefined,
			replyId: props.replyTarget?.id,
			quoteId: props.quoteTarget?.id,
		}).then(message => {
			emit('sent', message);
			clear();
		}).catch(err => {
			console.error('Error in chat:', err);
			return os.alert({
				type: 'error',
				title: i18n.ts.error,
				text: printError(err),
			});
		}).finally(() => {
			sending.value = false;
		});
	}
}

function clear() {
	text.value = '';
	file.value = null;
	emit('clearReply');
	emit('clearQuote');
	deleteDraft();
}

function getReferenceText(message: NormalizedChatMessage | Misskey.entities.ChatMessageLite) {
	return message.text ?? message.file?.name ?? i18n.ts.file;
}

function saveDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	drafts[getDraftKey()] = {
		updatedAt: new Date(),
		data: {
			text: text.value,
			file: file.value,
		},
	};

	miLocalStorage.setItem('chatMessageDrafts', JSON.stringify(drafts));
}

function deleteDraft() {
	const drafts = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}');

	delete drafts[getDraftKey()];

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
	);
}

onMounted(() => {
	if (textareaEl.value != null) {
		autocompleteInstance = new Autocomplete(textareaEl.value, text);
	}

	window.visualViewport?.addEventListener('resize', onVisualViewportChange);
	window.visualViewport?.addEventListener('scroll', onVisualViewportChange);

	// 書きかけの投稿を復元
	const draft = JSON.parse(miLocalStorage.getItem('chatMessageDrafts') || '{}')[getDraftKey()];
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
	border-radius: 14px 14px 0 0;
	overflow: clip;
}

.references {
	display: grid;
	gap: 6px;
	padding: 10px 12px 0;
	background: var(--MI_THEME-panel);
}

.reference {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: center;
	gap: 8px;
	padding: 8px 10px;
	border-left: solid 3px var(--MI_THEME-accent);
	border-radius: var(--MI-radius-xs);
	background: var(--MI_THEME-buttonBg);
	font-size: 90%;
	text-align: left;
}

.referenceLabel {
	font-weight: 700;
	color: var(--MI_THEME-accent);
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
	min-height: 80px;
	margin: 0;
	padding: 16px 16px 0 16px;
	resize: none;
	font-size: 1em;
	font-family: inherit;
	outline: none;
	border: none;
	border-radius: 0;
	box-shadow: none;
	box-sizing: border-box;
	color: var(--MI_THEME-fg);
	field-sizing: content;
}

.footer {
	position: sticky;
	bottom: 0;
	background: var(--MI_THEME-panel);
}

.file {
	padding: 8px;
	cursor: pointer;
}

.buttons {
	display: flex;
	flex-wrap: wrap;
	gap: 4px;
}

.button {
	height: 50px;
	aspect-ratio: 1;

	&:hover {
		color: var(--MI_THEME-accent);
	}
}
.send {
	margin-left: auto;
	color: var(--MI_THEME-accent);
}
</style>
