/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed, onBeforeUnmount, ref, watch, type ComputedRef, type Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { instance, policies } from '@/instance.js';
import { miLocalStorage } from '@/local-storage.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { getCachedTranslation, setCachedTranslation } from '@/utility/note-translation-cache.js';

const MIN_LEN = 2;
const BATCH_SIZE = 4;
const FLUSH_DELAY_MS = 200;
const FAILURE_RETRY_DELAY_MS = 70_000;
const MAX_FAILURE_RETRIES = 2;

type BatchTranslationResponse = {
	translations: Record<string, Misskey.entities.NotesTranslateResponse | false>;
};

type PreviewTranslationState = {
	note: Ref<Misskey.entities.Note>;
	translation: Ref<Misskey.entities.NotesTranslateResponse | false | null>;
	translating: Ref<boolean>;
	retryCount: Ref<number>;
	retryTimer: number | null;
};

const pending = new Map<string, Set<PreviewTranslationState>>();
let flushTimer: number | null = null;
let flushing = false;

function normalizedNoteText(note: Misskey.entities.Note): string {
	return (note.text ?? '').replace(/\s+/g, ' ').trim();
}

function getTargetLang(): string {
	return miLocalStorage.getItem('lang') ?? navigator.language;
}

function canTranslate(note: Misskey.entities.Note): boolean {
	if (!prefer.r.autoTranslateNotes.value) return false;
	if (!policies.value?.canUseTranslator) return false;
	if (!instance.translatorAvailable) return false;
	if (note.cw != null) return false;
	const text = normalizedNoteText(note);
	return text.length >= MIN_LEN;
}

function removeState(state: PreviewTranslationState): void {
	for (const [noteId, states] of pending) {
		states.delete(state);
		if (states.size === 0) pending.delete(noteId);
	}
	clearRetryTimer(state);
}

function clearRetryTimer(state: PreviewTranslationState): void {
	if (state.retryTimer === null) return;
	window.clearTimeout(state.retryTimer);
	state.retryTimer = null;
}

function scheduleRetry(state: PreviewTranslationState): void {
	if (state.retryCount.value >= MAX_FAILURE_RETRIES) {
		state.translation.value = false;
		return;
	}
	if (state.retryTimer !== null) return;

	state.translation.value = false;
	state.retryCount.value += 1;
	state.retryTimer = window.setTimeout(() => {
		state.retryTimer = null;
		if (!canTranslate(state.note.value)) return;
		state.translation.value = null;
		state.translating.value = false;
		enqueue(state);
	}, FAILURE_RETRY_DELAY_MS * state.retryCount.value);
}

function scheduleFlush(): void {
	if (flushTimer !== null || flushing || pending.size === 0) return;
	flushTimer = window.setTimeout(() => {
		flushTimer = null;
		void flushPending();
	}, FLUSH_DELAY_MS);
}

async function flushPending(): Promise<void> {
	if (flushing || pending.size === 0) return;
	flushing = true;
	const targetLang = getTargetLang();
	const noteIds = [...pending.keys()].slice(0, BATCH_SIZE);
	const statesByNoteId = new Map<string, Set<PreviewTranslationState>>();

	for (const noteId of noteIds) {
		const states = pending.get(noteId);
		if (!states) continue;
		pending.delete(noteId);
		statesByNoteId.set(noteId, states);
		for (const state of states) {
			state.translating.value = true;
		}
	}

	try {
		const response = await misskeyApi('notes/translate-batch', {
			noteIds,
			targetLang,
		}) as BatchTranslationResponse;

		for (const noteId of noteIds) {
			const translation = response.translations[noteId] ?? false;
			const states = statesByNoteId.get(noteId);
			if (!states) continue;

			if (translation && translation.text) {
				setCachedTranslation(noteId, targetLang, translation);
			}

			for (const state of states) {
				if (state.note.value.id !== noteId) continue;
				if (translation === false) {
					scheduleRetry(state);
				} else {
					state.retryCount.value = 0;
					state.translation.value = translation;
				}
			}
		}
	} catch (err) {
		console.error('Failed to translate timeline preview batch: ', err);
		for (const [noteId, states] of statesByNoteId) {
			for (const state of states) {
				if (state.note.value.id !== noteId) continue;
				scheduleRetry(state);
			}
		}
	} finally {
		for (const [noteId, states] of statesByNoteId) {
			for (const state of states) {
				if (state.note.value.id !== noteId) continue;
				state.translating.value = false;
			}
		}
		flushing = false;
		scheduleFlush();
	}
}

function enqueue(state: PreviewTranslationState): void {
	const note = state.note.value;
	removeState(state);

	if (!canTranslate(note)) return;
	if (state.translating.value || state.translation.value !== null) return;

	const targetLang = getTargetLang();
	const cached = getCachedTranslation(note.id, targetLang);
	if (cached) {
		state.translation.value = cached;
		return;
	}

	const states = pending.get(note.id) ?? new Set<PreviewTranslationState>();
	states.add(state);
	pending.set(note.id, states);
	scheduleFlush();
}

export function useTimelinePreviewTranslation(note: Ref<Misskey.entities.Note>): {
	translation: Ref<Misskey.entities.NotesTranslateResponse | false | null>;
	translating: Ref<boolean>;
	previewTranslationText: ComputedRef<string>;
	translatedPreview: ComputedRef<string>;
	shouldReplacePreviewText: ComputedRef<boolean>;
} {
	const translation = ref<Misskey.entities.NotesTranslateResponse | false | null>(null);
	const translating = ref(false);
	const retryCount = ref(0);
	const state: PreviewTranslationState = {
		note,
		translation,
		translating,
		retryCount,
		retryTimer: null,
	};

	const previewTranslationText = computed(() => {
		const value = translation.value;
		if (value == null || value === false || !value.text) return '';
		return value.text.replace(/\s+/g, ' ').trim();
	});
	const shouldReplacePreviewText = computed(() => prefer.r.autoTranslateReplaceOriginal.value && previewTranslationText.value.length > 0);
	const translatedPreview = computed(() => shouldReplacePreviewText.value ? previewTranslationText.value : normalizedNoteText(note.value));

	watch(
		[
			() => prefer.r.autoTranslateNotes.value,
			() => policies.value?.canUseTranslator,
			() => instance.translatorAvailable,
			() => note.value.id,
			() => note.value.text,
		],
		() => {
			clearRetryTimer(state);
			retryCount.value = 0;
			translation.value = null;
			translating.value = false;
			enqueue(state);
		},
		{ immediate: true },
	);

	onBeforeUnmount(() => {
		removeState(state);
	});

	return {
		translation,
		translating,
		previewTranslationText,
		translatedPreview,
		shouldReplacePreviewText,
	};
}
