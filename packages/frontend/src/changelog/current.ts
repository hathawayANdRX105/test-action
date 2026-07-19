/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Hand-maintained "what's new" content for the left-nav changelog badge.
 * Update this when bumping package.json version so the green-dot panel stays useful.
 */
export type ChangelogLine = {
	en: string;
	zh: string;
};

export type ChangelogRelease = {
	/** Must match (or be a base of) the running client version for display. */
	version: string;
	highlights: ChangelogLine[];
	tips: ChangelogLine[];
};

export const currentChangelog: ChangelogRelease = {
	version: '2025.5.2-dev',
	highlights: [
		{
			en: 'Timeline: middle-click drag to pull-to-refresh (can be disabled in accessibility settings).',
			zh: '时间线：可用鼠标中键拖拽下拉刷新（可在无障碍设置中关闭）。',
		},
		{
			en: 'Timeline performance improvements.',
			zh: '时间线性能优化。',
		},
		{
			en: 'You can delete profiles from backed-up settings.',
			zh: '可删除已备份的设置配置档。',
		},
		{
			en: 'Dialog announcements no longer overflow the screen; several UI glitches fixed.',
			zh: '公告对话框不再超出屏幕，并修复了若干界面问题。',
		},
		{
			en: 'Server: frozen users’ notes hidden from timelines; federation delivery can be stopped by software/version.',
			zh: '服务端：冻结用户的帖子不再出现在时间线；可按软件/版本停发联邦。',
		},
	],
	tips: [
		{
			en: 'Open Settings → Accessibility to toggle pull-to-refresh with the mouse middle button.',
			zh: '打开「设置 → 无障碍」，可开关中键下拉刷新。',
		},
		{
			en: 'Unread site announcements still show under the speakerphone nav item; open and tap “Got it” to clear them.',
			zh: '全站未读公告仍显示在导航「公告」上；打开后点「好」即可消除。',
		},
		{
			en: 'Tap the version under the instance logo anytime to re-open this update panel.',
			zh: '随时点击左上角实例标志下方的版本号，可再次打开本更新面板。',
		},
	],
};
