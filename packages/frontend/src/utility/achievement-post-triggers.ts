/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const lovePattern = /\blove\b|[❤♥💖💗💓💞💕💘]/iu;
const universeFederationHashtagPattern = /(^|\W)#universefederation($|\W)/iu;
const legacyLoveTargetPattern = /(^|\W)#(?:misskey|sharkey)($|\W)|sharkey/iu;

export function isILoveUniverseFederationAchievementText(text: string): boolean {
	return lovePattern.test(text) && (
		universeFederationHashtagPattern.test(text)
		|| legacyLoveTargetPattern.test(text)
	);
}
