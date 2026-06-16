/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { i18n } from '@/i18n.js';

export type ApiScopeGroup = {
	key: string;
	title: string;
	icon: string;
	scopes: string[];
};

// 非 admin 的可申请 scope 按用途分组（用于开发者中心/管理后台统一的权限选择器）。
export const API_SCOPE_GROUPS: ApiScopeGroup[] = [
	{ key: 'account', title: '登录与账号', icon: 'ti ti-user-circle', scopes: ['read:profile', 'read:account', 'write:account'] },
	{ key: 'notes', title: '帖子与互动', icon: 'ti ti-pencil', scopes: ['write:notes', 'read:notes-schedule', 'write:notes-schedule', 'write:votes', 'read:reactions', 'write:reactions'] },
	{ key: 'drive', title: '网盘文件', icon: 'ti ti-cloud', scopes: ['read:drive', 'write:drive'] },
	{ key: 'chat', title: '聊天与私信', icon: 'ti ti-messages', scopes: ['read:chat', 'write:chat', 'read:messaging', 'write:messaging'] },
	{ key: 'social', title: '社交关系', icon: 'ti ti-users', scopes: ['read:following', 'write:following', 'read:user-groups', 'write:user-groups'] },
	{ key: 'moderation', title: '屏蔽与静音', icon: 'ti ti-shield', scopes: ['read:blocks', 'write:blocks', 'read:mutes', 'write:mutes'] },
	{ key: 'notifications', title: '通知', icon: 'ti ti-bell', scopes: ['read:notifications', 'write:notifications'] },
	{ key: 'favorites', title: '收藏与书签', icon: 'ti ti-bookmark', scopes: ['read:favorites', 'write:favorites', 'read:clip-favorite', 'write:clip-favorite'] },
	{ key: 'channels', title: '频道', icon: 'ti ti-device-tv', scopes: ['read:channels', 'write:channels'] },
	{ key: 'pages', title: '页面', icon: 'ti ti-news', scopes: ['read:pages', 'write:pages', 'read:page-likes', 'write:page-likes'] },
	{ key: 'gallery', title: '画廊', icon: 'ti ti-photo', scopes: ['read:gallery', 'write:gallery', 'read:gallery-likes', 'write:gallery-likes'] },
	{ key: 'flash', title: 'Play', icon: 'ti ti-player-play', scopes: ['read:flash', 'write:flash', 'read:flash-likes', 'write:flash-likes'] },
	{ key: 'invite', title: '邀请码', icon: 'ti ti-ticket', scopes: ['read:invite-codes', 'write:invite-codes'] },
	{ key: 'misc', title: '其他', icon: 'ti ti-dots', scopes: ['read:federation', 'write:report-abuse'] },
];

// 全部非 admin 的可选 scope（按分组顺序展开），用于管理后台的权限配置选择器。
export const ALL_API_SCOPES: string[] = API_SCOPE_GROUPS.flatMap(g => g.scopes);

// scope 的人类可读用途（复用 Misskey 的 _permissions 文案；缺失则回退原始 scope）。
export function scopeLabel(scope: string): string {
	return (i18n.ts._permissions as Record<string, string>)[scope] ?? scope;
}

// 给定可选 scope 列表，按 API_SCOPE_GROUPS 分组（仅保留可选的），未归类的归入「其他」，保持顺序。
export function buildScopeGroups(available: readonly string[]): ApiScopeGroup[] {
	const set = new Set(available);
	const used = new Set<string>();
	const groups: ApiScopeGroup[] = [];

	for (const group of API_SCOPE_GROUPS) {
		const scopes = group.scopes.filter(s => set.has(s));
		if (scopes.length === 0) continue;
		for (const s of scopes) used.add(s);
		groups.push({ ...group, scopes });
	}

	const ungrouped = available.filter(s => !used.has(s));
	if (ungrouped.length > 0) {
		const misc = groups.find(g => g.key === 'misc');
		if (misc) {
			misc.scopes = [...misc.scopes, ...ungrouped];
		} else {
			groups.push({ key: 'misc', title: '其他', icon: 'ti ti-dots', scopes: [...ungrouped] });
		}
	}

	return groups;
}
