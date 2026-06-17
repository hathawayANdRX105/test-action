/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function normalizePrimaryMenu(items: string[], available: Record<string, { show?: unknown }>): string[] {
	// search(検索)・drive(ドライブ)・achievements(実績) はプライマリメニューから外し、
	// 「もっと(ランチパッド)」へ集約する。項目が多すぎてスクロールバーが出るのを防ぐため。
	// explore(探索) は左メニューに常設する(ユーザーが消していても復活させる)。
	const movedToLaunchPad = ['search', 'drive', 'achievements'];
	let next = items.filter(item => !movedToLaunchPad.includes(item));
	next = ensureAfter(next, 'channels', null);
	if (available.chat?.show !== false) {
		next = ensureAfter(next, 'chat', null);
	}
	if (available.ai?.show !== false) {
		next = ensureAfter(next, 'ai', null);
	}
	// 探索を左メニュー先頭に常設(過去に movedToLaunchPad で抜かれ保存済みのメニューにも復活させる)
	next = ensureAfter(next, 'explore', null);
	return next;
}

function ensureAfter(items: string[], item: string, after: string | null): string[] {
	const withoutItem = items.filter(value => value !== item);
	if (after == null) return [item, ...withoutItem];
	const afterIndex = withoutItem.indexOf(after);
	if (afterIndex < 0) return [item, ...withoutItem];
	return [
		...withoutItem.slice(0, afterIndex + 1),
		item,
		...withoutItem.slice(afterIndex + 1),
	];
}
