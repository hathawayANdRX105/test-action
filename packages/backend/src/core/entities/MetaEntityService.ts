/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Brackets } from 'typeorm';
import { Inject, Injectable } from '@nestjs/common';
import JSON5 from 'json5';
import type { Packed } from '@/misc/json-schema.js';
import type { MiMeta } from '@/models/Meta.js';
import type { AdsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import type { Config } from '@/config.js';
import { DI } from '@/di-symbols.js';
import { DEFAULT_POLICIES } from '@/core/RoleService.js';
import { TimeService } from '@/global/TimeService.js';
import { normalizeInstanceBrandName, normalizeInstanceBrandUrl } from '@/misc/brand-name.js';

const UNIVERSE_FEDERATION_DARK_THEME = {
	id: 'd-universe-federation',
	name: 'Universe Federation Dark',
	author: 'Universe Federation',
	desc: 'Dark-first community theme with Telegram blue signals and X-style information density.',
	base: 'dark',
	props: {
		accent: '#2AABEE',
		accentedBg: ':alpha<0.17<@accent',
		bg: '#05070B',
		fg: '#E7EEF5',
		fgHighlighted: '#FFFFFF',
		fgOnAccent: '#FFFFFF',
		fgOnWhite: '@accent',
		divider: 'rgba(255, 255, 255, 0.11)',
		indicator: '@accent',
		panel: '#0D1118',
		panelHighlight: '#141B24',
		panelHeaderBg: '#101721',
		panelHeaderFg: '@fg',
		panelBorder: '" solid 1px rgba(255, 255, 255, 0.1)',
		thread: '#182231',
		windowHeader: 'rgba(13, 17, 24, 0.86)',
		popup: '#111923',
		shadow: 'rgba(0, 0, 0, 0.42)',
		header: 'rgba(13, 17, 24, 0.76)',
		navBg: '#06090E',
		navFg: '#E7EEF5',
		navActive: '#FFFFFF',
		navIndicator: '@accent',
		pageHeaderBg: '#05070B',
		pageHeaderFg: '@fg',
		link: '#2AABEE',
		hashtag: '#29E6C8',
		mention: '#2AABEE',
		mentionMe: '#29E6C8',
		renote: '#29E6C8',
		modalBg: 'rgba(0, 0, 0, 0.58)',
		scrollbarHandle: 'rgba(231, 238, 245, 0.22)',
		scrollbarHandleHover: 'rgba(42, 171, 238, 0.48)',
		dateLabelFg: '#94A3B8',
		infoBg: '#0F2231',
		infoFg: '#E8F7FF',
		infoWarnBg: '#342A12',
		infoWarnFg: '#FFD166',
		folderHeaderBg: 'rgba(255, 255, 255, 0.05)',
		folderHeaderHoverBg: 'rgba(255, 255, 255, 0.09)',
		buttonBg: '#141B24',
		buttonHoverBg: '#1A2531',
		buttonGradateA: '#2AABEE',
		buttonGradateB: '#29E6C8',
		switchBg: 'rgba(255, 255, 255, 0.16)',
		switchOffBg: 'rgba(255, 255, 255, 0.1)',
		switchOffFg: ':alpha<0.8<@fg',
		switchOnBg: ':alpha<0.2<@accent',
		switchOnFg: '@accent',
		inputBorder: 'rgba(255, 255, 255, 0.12)',
		inputBorderHover: 'rgba(42, 171, 238, 0.42)',
		driveFolderBg: ':alpha<0.25<@accent',
		badge: '#29E6C8',
		messageBg: '#05070B',
		success: '#29E6C8',
		error: '#F05252',
		warn: '#FFD166',
		htmlThemeColor: '#05070B',
		codeString: '#98E6C7',
		codeNumber: '#8BD3FF',
		codeBoolean: '#D7B9FF',
		deckBg: '#05070B',
	},
	codeHighlighter: {
		base: 'dark-plus',
	},
};

const DEFAULT_BRAND_THEME_COLOR = '#2AABEE';
const DEFAULT_BRAND_ICON = '/client-assets/about-icon.png?v=uf3';
const DEFAULT_BRAND_APP_192_ICON = '/static-assets/icons/192.png';
const DEFAULT_BRAND_APP_512_ICON = '/static-assets/icons/512.png';
const DEFAULT_BRAND_BACKGROUND = '/client-assets/universe-federation-bg.webp?v=uf3';

@Injectable()
export class MetaEntityService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.adsRepository)
		private adsRepository: AdsRepository,

		private systemAccountService: SystemAccountService,
		private readonly timeService: TimeService,
	) { }

	@bindThis
	public async pack(meta?: MiMeta): Promise<Packed<'MetaLite'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		// TODO quantum-cache for ads
		const ads = await this.adsRepository.createQueryBuilder('ads')
			.where('ads.expiresAt > :now', { now: this.timeService.date })
			.andWhere('ads.startsAt <= :now', { now: this.timeService.date })
			.andWhere(new Brackets(qb => {
				// 曜日のビットフラグを確認する
				qb.where('ads.dayOfWeek & :dayOfWeek > 0', { dayOfWeek: 1 << this.timeService.date.getDay() })
					.orWhere('ads.dayOfWeek = 0');
			}))
			.getMany();

		// クライアントの手間を減らすためあらかじめJSONに変換しておく
		let defaultLightTheme: string | null = null;
		let defaultDarkTheme: string | null = null;
		if (instance.defaultLightTheme) {
			try {
				defaultLightTheme = JSON.stringify(JSON5.parse(instance.defaultLightTheme));
			} catch (e) {
			}
		}
		if (instance.defaultDarkTheme) {
			try {
				defaultDarkTheme = JSON.stringify(JSON5.parse(instance.defaultDarkTheme));
			} catch (e) {
			}
		} else {
			defaultDarkTheme = JSON.stringify(UNIVERSE_FEDERATION_DARK_THEME);
		}

		const packed: Packed<'MetaLite'> = {
			maintainerName: instance.maintainerName,
			maintainerEmail: instance.maintainerEmail,

			version: this.config.version,
			providesTarball: this.config.publishTarballInsteadOfProvideRepositoryUrl,

			name: normalizeInstanceBrandName(instance.name),
			shortName: normalizeInstanceBrandName(instance.shortName),
			uri: this.config.url,
			description: instance.description,
			about: instance.about,
			langs: instance.langs,
			tosUrl: instance.termsOfServiceUrl,
			repositoryUrl: normalizeInstanceBrandUrl(instance.repositoryUrl),
			feedbackUrl: normalizeInstanceBrandUrl(instance.feedbackUrl),
			impressumUrl: instance.impressumUrl,
			donationUrl: instance.donationUrl,
			privacyPolicyUrl: instance.privacyPolicyUrl,
			inquiryUrl: instance.inquiryUrl,
			disableRegistration: instance.disableRegistration,
			emailRequiredForSignup: instance.emailRequiredForSignup,
			approvalRequiredForSignup: instance.approvalRequiredForSignup,
			signupEmailRestriction: instance.signupEmailRestriction,
			signupEmailAllowedDomains: (instance.signupEmailRules ?? []).map(r => r.domain),
			enableHcaptcha: instance.enableHcaptcha,
			hcaptchaSiteKey: instance.hcaptchaSiteKey,
			enableMcaptcha: instance.enableMcaptcha,
			mcaptchaSiteKey: instance.mcaptchaSitekey,
			mcaptchaInstanceUrl: instance.mcaptchaInstanceUrl,
			enableRecaptcha: instance.enableRecaptcha,
			enableAchievements: instance.enableAchievements,
			robotsTxt: instance.robotsTxt,
			recaptchaSiteKey: instance.recaptchaSiteKey,
			enableTurnstile: instance.enableTurnstile,
			turnstileSiteKey: instance.turnstileSiteKey,
			enableFC: instance.enableFC,
			fcSiteKey: instance.fcSiteKey,
			enableTestcaptcha: instance.enableTestcaptcha,
			swPublickey: instance.swPublicKey,
			themeColor: instance.themeColor ?? DEFAULT_BRAND_THEME_COLOR,
			mascotImageUrl: instance.mascotImageUrl ?? '/assets/ai.png',
			bannerUrl: instance.bannerUrl,
			infoImageUrl: instance.infoImageUrl,
			serverErrorImageUrl: instance.serverErrorImageUrl,
			notFoundImageUrl: instance.notFoundImageUrl,
			iconUrl: instance.iconUrl ?? DEFAULT_BRAND_ICON,
			app192IconUrl: instance.app192IconUrl ?? DEFAULT_BRAND_APP_192_ICON,
			app512IconUrl: instance.app512IconUrl ?? DEFAULT_BRAND_APP_512_ICON,
			sidebarLogoUrl: instance.sidebarLogoUrl,
			backgroundImageUrl: instance.backgroundImageUrl ?? DEFAULT_BRAND_BACKGROUND,
			logoImageUrl: instance.logoImageUrl,
			maxNoteTextLength: this.config.maxNoteLength,
			maxRemoteNoteTextLength: this.config.maxRemoteNoteLength,
			maxCwLength: this.config.maxCwLength,
			maxRemoteCwLength: this.config.maxRemoteCwLength,
			maxAltTextLength: this.config.maxAltTextLength,
			maxRemoteAltTextLength: this.config.maxRemoteAltTextLength,
			maxBioLength: this.config.maxBioLength,
			maxRemoteBioLength: this.config.maxRemoteBioLength,
			defaultLightTheme,
			defaultDarkTheme,
			defaultLike: instance.defaultLike,
			ads: ads.map(ad => ({
				id: ad.id,
				url: ad.url,
				place: ad.place,
				ratio: ad.ratio,
				imageUrl: ad.imageUrl,
				dayOfWeek: ad.dayOfWeek,
			})),
			trustedLinkUrlPatterns: instance.trustedLinkUrlPatterns,
			notesPerOneAd: instance.notesPerOneAd,
			enableEmail: instance.enableEmail,
			enableServiceWorker: instance.enableServiceWorker,
			enableAi: instance.enableAi,
			showAiInNavbar: instance.showAiInNavbar,

			translatorAvailable: instance.deeplAuthKey != null || instance.libreTranslateURL != null || instance.deeplFreeMode && instance.deeplFreeInstance != null,

			serverRules: instance.serverRules,

			policies: { ...DEFAULT_POLICIES, ...instance.policies },

			sentryForFrontend: this.config.sentryForFrontend ?? null,
			mediaProxy: this.config.mediaProxy,
			enableUrlPreview: instance.urlPreviewEnabled,
			noteSearchableScope: (this.config.meilisearch == null || this.config.meilisearch.scope !== 'local') ? 'global' : 'local',
			maxFileSize: this.config.maxFileSize,
			federation: this.meta.federation,
		};

		return packed;
	}

	@bindThis
	public async packDetailed(meta?: MiMeta): Promise<Packed<'MetaDetailed'>> {
		let instance = meta;

		if (!instance) {
			instance = this.meta;
		}

		const [packed, proxyAccount] = await Promise.all([
			this.pack(instance),
			this.systemAccountService.fetch('proxy'),
		]);

		const packDetailed: Packed<'MetaDetailed'> = {
			...packed,
			cacheRemoteFiles: instance.cacheRemoteFiles,
			cacheRemoteSensitiveFiles: instance.cacheRemoteSensitiveFiles,
			requireSetup: this.meta.rootUserId == null,
			proxyAccountName: proxyAccount.username,
			features: {
				localTimeline: instance.policies.ltlAvailable,
				globalTimeline: instance.policies.gtlAvailable,
				registration: !instance.disableRegistration,
				emailRequiredForSignup: instance.emailRequiredForSignup,
				hcaptcha: instance.enableHcaptcha,
				recaptcha: instance.enableRecaptcha,
				turnstile: instance.enableTurnstile,
				objectStorage: instance.useObjectStorage,
				serviceWorker: instance.enableServiceWorker,
				miauth: true,
			},
			allowUnsignedFetch: instance.allowUnsignedFetch,
		};

		return packDetailed;
	}
}
