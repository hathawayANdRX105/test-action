/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 帖子翻译结果的本地缓存。
 * 关键设计:
 * - key = `${noteId}::${targetLang}`,同一帖子翻成不同语言互不覆盖
 * - LRU 淘汰(最近用过的留下),最大 800 条
 * - 7 天 TTL,过期自动清
 * - localStorage 持久化(刷新页面缓存仍在);写入用懒批(setTimeout)减少 jank
 * - 容错:任何 localStorage 异常都吞掉,不抛
 */

import type * as Misskey from 'misskey-js';

const STORAGE_KEY = 'noteTranslationCache:v1';
const MAX_ENTRIES = 800;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

type CachedEntry = {
	text: string;
	sourceLang?: string;
	targetLang: string;
	ts: number; // 写入时间戳
};

let memoryCache: Map<string, CachedEntry> | null = null;
let saveScheduled = false;

function load(): Map<string, CachedEntry> {
	if (memoryCache) return memoryCache;
	memoryCache = new Map();
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const obj = JSON.parse(raw) as Record<string, CachedEntry>;
			const now = Date.now();
			for (const [k, v] of Object.entries(obj)) {
				if (v && typeof v === 'object' && typeof v.text === 'string' && (now - v.ts) < TTL_MS) {
					memoryCache.set(k, v);
				}
			}
		}
	} catch {
		// 解析失败就当空表
	}
	return memoryCache;
}

function scheduleSave(): void {
	if (saveScheduled) return;
	saveScheduled = true;
	// 用 setTimeout 让多次写入合并到一次 JSON 序列化
	setTimeout(() => {
		saveScheduled = false;
		const m = load();
		try {
			// LRU 淘汰:Map 按插入顺序,前面的是最旧的;超 MAX 时砍头
			if (m.size > MAX_ENTRIES) {
				const overflow = m.size - MAX_ENTRIES;
				const it = m.keys();
				for (let i = 0; i < overflow; i++) m.delete(it.next().value as string);
			}
			const obj: Record<string, CachedEntry> = {};
			for (const [k, v] of m) obj[k] = v;
			localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
		} catch {
			// quota 满或被禁,放弃
		}
	}, 800);
}

function key(noteId: string, targetLang: string): string {
	return `${noteId}::${targetLang.toLowerCase()}`;
}

export function getCachedTranslation(noteId: string, targetLang: string): Misskey.entities.NotesTranslateResponse | null {
	const m = load();
	const k = key(noteId, targetLang);
	const v = m.get(k);
	if (!v) return null;
	// 命中后 reinsert 以维持 LRU
	m.delete(k);
	m.set(k, v);
	return { text: v.text, sourceLang: v.sourceLang } as Misskey.entities.NotesTranslateResponse;
}

export function setCachedTranslation(noteId: string, targetLang: string, translation: Misskey.entities.NotesTranslateResponse): void {
	if (!translation || !translation.text) return;
	const m = load();
	const k = key(noteId, targetLang);
	m.delete(k); // 重新插到尾部
	m.set(k, {
		text: translation.text,
		sourceLang: translation.sourceLang,
		targetLang,
		ts: Date.now(),
	});
	scheduleSave();
}

export function clearTranslationCache(): void {
	memoryCache = new Map();
	try {
		localStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

export function getCacheStats(): { size: number; max: number } {
	return { size: load().size, max: MAX_ENTRIES };
}
