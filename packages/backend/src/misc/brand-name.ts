/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const INSTANCE_BRAND_NAME = 'Universe Federation';
export const INSTANCE_BRAND_REPOSITORY = 'github.com/universe-federation/universe-federation';

export function normalizeInstanceBrandName(name: string | null | undefined): string | null {
	if (name == null) return null;

	return name.trim().toLowerCase() === 'hhhl' ? INSTANCE_BRAND_NAME : name;
}

export function instanceBrandName(name: string | null | undefined, fallback = INSTANCE_BRAND_NAME): string {
	return normalizeInstanceBrandName(name) ?? fallback;
}

export function normalizeInstanceBrandUrl(url: string | null | undefined): string | null {
	if (url == null) return null;

	return url
		// legacy / upstream brand URLs accidentally left in meta
		.replace(/github\.com\/hhhl\/hhhl/gi, INSTANCE_BRAND_REPOSITORY)
		.replace(/activitypub\.software\/TransFem-org\/Sharkey(?:\/-\/issues\/new)?/gi, (match) =>
			match.includes('issues')
				? `${INSTANCE_BRAND_REPOSITORY}/issues/new`
				: INSTANCE_BRAND_REPOSITORY,
		)
		.replace(/github\.com\/misskey-dev\/misskey(?:\/issues\/new)?/gi, (match) =>
			match.includes('issues')
				? `${INSTANCE_BRAND_REPOSITORY}/issues/new`
				: INSTANCE_BRAND_REPOSITORY,
		);
}
