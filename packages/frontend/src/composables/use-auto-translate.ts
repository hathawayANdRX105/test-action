/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 帖子自动翻译 composable。
 * 在 SkNote / SkNoteSub 里调用。当 prefer.autoTranslateNotes=true 且策略允许时,
 * 自动调 translateNote(已带本地缓存)拉译文,挂到 translation ref 上。
 */

import { watch, type Ref } from 'vue';
import type * as Misskey from 'misskey-js';
import { prefer } from '@/preferences.js';
import { instance, policies } from '@/instance.js';
import { translateNote } from '@/utility/get-note-menu.js';

const MIN_LEN = 2;

export function useAutoTranslate(opts: {
	note: Ref<Misskey.entities.Note>;
	translation: Ref<Misskey.entities.NotesTranslateResponse | false | null>;
	translating: Ref<boolean>;
}): void {
	function tryTranslate(): void {
		if (!prefer.r.autoTranslateNotes.value) return;
		if (opts.translating.value) return;
		// 已有结果(成功或失败)就不再请求
		if (opts.translation.value !== null) return;
		// 策略/服务器不允许就不发请求
		if (!policies.value?.canUseTranslator) return;
		if (!instance.translatorAvailable) return;
		const n = opts.note.value;
		if (!n || !n.id || !n.text) return;
		if (n.text.length < MIN_LEN) return;
		// 触发(其内部已带缓存,有缓存就 sync 命中,无缓存才打 API)
		translateNote(n.id, opts.translation, opts.translating);
	}

	// 帖子换了 / 总开关被打开 都要重新评估
	watch(
		[
			() => prefer.r.autoTranslateNotes.value,
			() => opts.note.value?.id,
		],
		tryTranslate,
		{ immediate: true },
	);
}
