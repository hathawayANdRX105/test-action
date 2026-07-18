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
	<MkInfo v-if="muteState != null" warn>
		<template v-if="muteState.type === 'silenced'">{{ i18n.ts._chat.roomIsSilenced }}</template>
		<template v-else-if="muteState.until == null">{{ i18n.ts._chat.mutedForever }}</template>
		<template v-else>{{ i18n.tsx._chat.youAreMutedInRoomUntil({ time: dateString(muteState.until) }) }}</template>
	</MkInfo>
	<div v-if="chatFormUploadings.length > 0 || files.length > 0" :class="$style.files" aria-live="polite">
		<div v-for="ctx in chatFormUploadings" :key="ctx.id" :class="$style.uploadingFile" data-chat-uploading-file>
			<div :class="$style.uploadingThumbnail" :style="{ backgroundImage: `url(${ctx.img})` }">
				<i class="ti ti-file-upload"></i>
			</div>
			<div :class="$style.uploadingBody">
				<div :class="$style.fileName">{{ ctx.name }}</div>
				<div :class="$style.uploadingStatus">
					<span v-if="ctx.progressValue === undefined">{{ i18n.ts.uploading }}</span>
					<span v-else>{{ Math.floor((ctx.progressValue / (ctx.progressMax || 1)) * 100) }}%</span>
				</div>
				<progress :value="ctx.progressValue ?? undefined" :max="ctx.progressMax ?? undefined" :class="{ [$style.uploadingProgressIndeterminate]: ctx.progressValue === undefined }"></progress>
			</div>
		</div>
		<div v-for="(attachedFile, index) in files" :key="attachedFile.id" :class="$style.file" data-chat-attached-file>
			<i class="ti ti-paperclip"></i>
			<span :class="$style.fileName">{{ attachedFile.name }}</span>
			<button class="_button" :class="$style.fileRemove" type="button" :title="i18n.ts.attachCancel" :aria-label="i18n.ts.attachCancel" @click="removeAttachedFile(index)">
				<i class="ti ti-x"></i>
			</button>
		</div>
	</div>
	<div :class="$style.composer">
		<button class="_button" :class="$style.button" :title="i18n.ts.attachFile" @click="chooseFile"><i class="ti ti-paperclip"></i></button>
		<textarea
			ref="textareaEl"
			v-model="text"
			:class="$style.textarea"
			:placeholder="muteState != null ? (muteState.type === 'silenced' ? i18n.ts._chat.roomIsSilenced : i18n.ts._chat.youAreMutedInRoom) : i18n.ts.inputMessageHere"
			:readonly="textareaReadOnly"
			:disabled="muteState != null"
			@keydown="onKeydown"
			@keyup="onKeyup"
			@compositionstart="onCompositionStart"
			@compositionend="onCompositionEnd"
			@focus="onFocus"
			@paste="onPaste"
		></textarea>
		<button class="_button" :class="$style.button" @click="insertEmoji"><i class="ti ti-mood-happy"></i></button>
		<button class="_button" :class="[$style.button, $style.send]" :disabled="!canSend || sending || isUploading" :title="i18n.ts.send" @click="send">
			<template v-if="!sending"><i class="ti ti-send"></i></template><template v-if="sending"><MkLoading :em="true"/></template>
		</button>
	</div>
	<input ref="fileEl" style="display: none;" type="file" multiple @change="onChangeFile"/>
</div>
</template>

<script lang="ts" setup>
import { onMounted, watch, ref, shallowRef, computed, nextTick, onBeforeUnmount } from 'vue';
import * as Misskey from 'misskey-js';
//import insertTextAtCursor from 'insert-text-at-cursor';
import { formatTimeString } from '@@/js/format-time-string.js';
import { useInterval } from '@@/js/use-interval.js';
import type { NormalizedChatMessage } from './room.vue';
import MkInfo from '@/components/MkInfo.vue';
import { selectFiles } from '@/utility/select-file.js';
import { dateString } from '@/filters/date.js';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { uploadFile, uploads } from '@/utility/upload.js';
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
const files = ref<Misskey.entities.DriveFile[]>([]);
const uploadingIds = ref<string[]>([]);
const sending = ref(false);
const textareaReadOnly = ref(false);
const isImeComposing = ref(false);
const suppressEnterUntilKeyup = ref(false);
const compositionEndedRecently = ref(false);
// Some IMEs emit the Enter keydown that confirmed a candidate after compositionend.
const IME_COMPOSITION_END_GUARD_MS = 200;
let autocompleteInstance: Autocomplete | null = null;
let focusScrollTimers: number[] = [];
let compositionEndGuardTimer: number | undefined;
let sendSerial = 0;

// ミュート期限切れの自動解除のために定期的に更新する
const now = ref(Date.now());
useInterval(() => {
	now.value = Date.now();
}, 1000 * 30, { immediate: false, afterMounted: true });

const muteState = computed<{ type: 'silenced' } | { type: 'muted'; until: string | null } | null>(() => {
	const room = props.room;
	if (room == null || room.ownerId === $i.id) return null;
	if (room.isSilenced) return { type: 'silenced' };
	if (room.myMutedUntil != null && Date.parse(room.myMutedUntil) > now.value) {
		const isPermanent = new Date(room.myMutedUntil).getFullYear() >= 9999;
		return { type: 'muted', until: isPermanent ? null : room.myMutedUntil };
	}
	return null;
});

const chatFormUploadings = computed(() => uploads.value.filter(ctx => uploadingIds.value.includes(ctx.id)));
const isUploading = computed(() => chatFormUploadings.value.length > 0);
const canSend = computed(() => muteState.value == null && (text.value.trim().length > 0 || files.value.length > 0 || props.replyTarget != null || props.quoteTarget != null));

function getDraftKey(): string | null {
	if (props.user) return 'user:' + props.user.id;
	if (props.room) return 'room:' + props.room.id;
	return null;
}

watch([text, files], saveDraft, { deep: true });

async function onPaste(ev: ClipboardEvent) {
	if (!ev.clipboardData) return;

	const pastedFileName = 'yyyy-MM-dd HH-mm-ss [{{number}}]';

	const clipboardData = ev.clipboardData;
	const pastedFiles = Array.from(clipboardData.items)
		.filter(item => item.kind === 'file')
		.map(item => item.getAsFile())
		.filter((file): file is File => file != null);

	if (pastedFiles.length > 0) {
		ev.preventDefault();
		for (const [index, pastedFile] of pastedFiles.entries()) {
			const lio = pastedFile.name.lastIndexOf('.');
			const ext = lio >= 0 ? pastedFile.name.slice(lio) : '';
			const formatted = formatTimeString(new Date(pastedFile.lastModified), pastedFileName).replace(/{{number}}/g, String(index + 1)) + ext;
			upload(pastedFile, formatted);
		}
	}
}

function onDragover(ev: DragEvent) {
	if (!ev.dataTransfer) return;

	const isFile = ev.dataTransfer.items[0]?.kind === 'file';
	const isDriveFile = ev.dataTransfer.types.includes(_DATA_TRANSFER_DRIVE_FILE_);
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
	if (ev.dataTransfer.files.length > 0) {
		ev.preventDefault();
		for (const droppedFile of Array.from(ev.dataTransfer.files)) {
			upload(droppedFile);
		}
		return;
	}

	//#region ドライブのファイル
	const driveFile = ev.dataTransfer.getData(_DATA_TRANSFER_DRIVE_FILE_);
	if (driveFile != null && driveFile !== '') {
		appendAttachedFiles([JSON.parse(driveFile)]);
		ev.preventDefault();
	}
	//#endregion
}

function onKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter') {
		if (shouldIgnoreEnterForIme(ev)) return;

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

function shouldIgnoreEnterForIme(ev: KeyboardEvent): boolean {
	if (isImeComposing.value || ev.isComposing || ev.keyCode === 229) {
		suppressEnterUntilKeyup.value = true;
		return true;
	}

	if (suppressEnterUntilKeyup.value || compositionEndedRecently.value) {
		suppressEnterUntilKeyup.value = true;
		clearCompositionEndGuard();
		ev.preventDefault();
		return true;
	}

	return false;
}

function onKeyup(ev: KeyboardEvent) {
	if (ev.key !== 'Enter') return;
	suppressEnterUntilKeyup.value = false;
	clearCompositionEndGuard();
}

function onCompositionStart() {
	isImeComposing.value = true;
	suppressEnterUntilKeyup.value = false;
	clearCompositionEndGuard();
}

function onCompositionEnd() {
	isImeComposing.value = false;
	armCompositionEndGuard();
}

function armCompositionEndGuard() {
	clearCompositionEndGuard();
	compositionEndedRecently.value = true;
	compositionEndGuardTimer = window.setTimeout(() => {
		compositionEndedRecently.value = false;
		compositionEndGuardTimer = undefined;
	}, IME_COMPOSITION_END_GUARD_MS);
}

function clearCompositionEndGuard() {
	if (compositionEndGuardTimer !== undefined) {
		window.clearTimeout(compositionEndGuardTimer);
		compositionEndGuardTimer = undefined;
	}
	compositionEndedRecently.value = false;
}

function onFocus() {
	scrollTextareaIntoViewAfterFocus();
}

function focus() {
	textareaEl.value?.focus();
}

function insertText(value: string) {
	const textarea = textareaEl.value;
	const start = textarea?.selectionStart ?? text.value.length;
	const end = textarea?.selectionEnd ?? text.value.length;
	text.value = text.value.substring(0, start) + value + text.value.substring(end);
	nextTick(() => {
		if (textareaEl.value == null) return;

		const position = start + value.length;
		textareaEl.value.focus();
		textareaEl.value.setSelectionRange(position, position);
	});
}

function insertMention(user: Misskey.entities.UserLite) {
	const acct = user.host == null ? user.username : `${user.username}@${user.host}`;
	const prefix = text.value.length === 0 || /\s$/.test(text.value) ? '' : ' ';
	insertText(`${prefix}@${acct} `);
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
	selectFiles(ev.currentTarget ?? ev.target, i18n.ts.selectFile).then(selectedFiles => {
		appendAttachedFiles(selectedFiles);
	});
}

function onChangeFile() {
	if (fileEl.value == null || fileEl.value.files == null) return;

	for (const selectedFile of Array.from(fileEl.value.files)) {
		upload(selectedFile);
	}
	fileEl.value.value = '';
}

function upload(fileToUpload: File, name?: string) {
	const uploading = uploadFile(fileToUpload, prefer.s.uploadFolder, name);
	uploadingIds.value.push(uploading.id);
	uploading.then(res => {
		appendAttachedFiles([res]);
	}).catch(() => {
		// uploadFile already shows the error dialog.
	}).finally(() => {
		uploadingIds.value = uploadingIds.value.filter(id => id !== uploading.id);
	});
}

function appendAttachedFiles(selectedFiles: Array<Misskey.entities.DriveFile | null | undefined>) {
	for (const selectedFile of selectedFiles) {
		if (selectedFile == null) continue;
		files.value.push(selectedFile);
	}
}

function removeAttachedFile(index: number) {
	files.value.splice(index, 1);
	if (fileEl.value != null) {
		fileEl.value.value = '';
	}
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
		file: null,
		replyTarget: props.replyTarget ?? null,
		quoteTarget: props.quoteTarget ?? null,
	};
}

function createSendSnapshots(target: SendTarget): SendSnapshot[] {
	if (files.value.length === 0) {
		return [createSendSnapshot(target)];
	}

	return files.value.map((attachedFile, index) => ({
		clientId: `${Date.now()}-${++sendSerial}`,
		target,
		text: index === 0 ? text.value : '',
		file: attachedFile,
		replyTarget: index === 0 ? props.replyTarget ?? null : null,
		quoteTarget: index === 0 ? props.quoteTarget ?? null : null,
	}));
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
	if (sending.value || isUploading.value || !canSend.value || muteState.value != null) return;

	const target = getSendTarget();
	if (target == null) return;

	const snapshots = createSendSnapshots(target);
	if (snapshots.length === 0) return;

	sending.value = true;
	clear();

	try {
		for (const [index, snapshot] of snapshots.entries()) {
			emit('sending', createOptimisticMessage(snapshot));

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
				emit('sendFailed', snapshot.clientId);
				restoreSnapshotsIfIdle(snapshots.slice(index));
				throw err;
			}
		}
	} catch (err) {
		const code = (err as { code?: string } | null)?.code;
		if (code === 'SLOW_MODE') {
			const retryAfter = (err as { info?: { retryAfter?: number | null } } | null)?.info?.retryAfter;
			void os.alert({
				type: 'warning',
				text: retryAfter != null ? i18n.tsx._chat.slowModeActive({ n: retryAfter }) : i18n.ts._chat.slowMode,
			});
		} else if (code === 'BLOCKED_BY_KEYWORD') {
			void os.alert({
				type: 'warning',
				text: i18n.ts._chat.blockedByKeyword,
			});
		} else if (code === 'RECIPIENT_CANNOT_CHAT' || code === 'RECIPIENT_CHAT_UNAVAILABLE') {
			void os.alert({
				type: 'warning',
				title: i18n.ts._chat.cannotChatWithTheUser,
				text: i18n.ts._chat.cannotChatWithTheUser_description,
			});
		} else {
			console.error('Error in chat:', err);
			void os.alert({
				type: 'error',
				title: i18n.ts.error,
				text: printError(err),
			});
		}
	} finally {
		sending.value = false;
	}
}

function clear() {
	text.value = '';
	files.value = [];
	emit('clearReply');
	emit('clearQuote');
	deleteDraft();
}

function restoreSnapshotsIfIdle(snapshots: SendSnapshot[]) {
	if (snapshots.length === 0 || text.value !== '' || files.value.length > 0) return;

	text.value = snapshots[0].text;
	files.value = snapshots
		.map(snapshot => snapshot.file)
		.filter((file): file is Misskey.entities.DriveFile => file != null);
	emit('restoreReferences', {
		replyTarget: snapshots[0].replyTarget,
		quoteTarget: snapshots[0].quoteTarget,
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
				files: files.value,
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
	insertMention,
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
		files.value = Array.isArray(draft.data.files) ? draft.data.files : (draft.data.file != null ? [draft.data.file] : []);
	}
});

onBeforeUnmount(() => {
	window.visualViewport?.removeEventListener('resize', onVisualViewportChange);
	window.visualViewport?.removeEventListener('scroll', onVisualViewportChange);
	clearCompositionEndGuard();

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
	min-width: 0;
	max-width: 100%;
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
	min-width: 0;
	max-width: 100%;
	gap: 4px;
	padding: 4px;
	border-radius: 21px;
	box-sizing: border-box;
	background: light-dark(#ffffff, #17212b);
	border: solid 1px light-dark(rgb(206 221 230), rgb(35 48 60));
	box-shadow: 0 2px 10px rgb(0 0 0 / 0.14);
}

.files {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	min-width: 0;
	max-width: 100%;
	gap: 6px;
	padding: 0 8px;
	overflow-x: hidden;
}

.file,
.uploadingFile {
	display: inline-flex;
	align-items: center;
	min-width: 0;
	gap: 6px;
	width: fit-content;
	max-width: min(420px, 100%);
	padding: 5px 6px 5px 10px;
	border-radius: 999px;
	box-sizing: border-box;
	background: light-dark(rgb(225 244 255), rgb(34 49 62));
	color: light-dark(#168acd, #6ab7f5);
	font-size: 90%;
	overflow: hidden;
	white-space: nowrap;
}

.file {
	flex: 0 1 min(420px, 100%);
	width: auto;
}

.file > i {
	flex: 0 0 auto;
}

.uploadingFile {
	display: grid;
	grid-template-columns: 30px minmax(0, 1fr);
	width: min(360px, 100%);
	padding: 5px 10px 6px 6px;
	border-radius: 14px;
}

.uploadingThumbnail {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	border-radius: 10px;
	background-color: light-dark(rgb(197 230 248), rgb(45 67 84));
	background-position: center;
	background-size: cover;
	overflow: hidden;
}

.uploadingBody {
	display: grid;
	gap: 2px;
	min-width: 0;
}

.uploadingStatus {
	font-size: 82%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.uploadingBody progress {
	width: 100%;
	height: 4px;
	border: none;
	border-radius: 999px;
	overflow: hidden;
}

.uploadingProgressIndeterminate {
	opacity: 0.75;
}

.fileName {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.file > .fileName {
	flex: 1 1 auto;
}

.fileRemove {
	display: grid;
	place-items: center;
	flex: 0 0 auto;
	width: 24px;
	height: 24px;
	border-radius: 999px;
	color: inherit;

	&:hover,
	&:focus-visible {
		color: #fff;
		background: light-dark(#168acd, #5288c1);
	}
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
