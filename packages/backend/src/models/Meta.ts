/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Column, PrimaryColumn, ManyToOne } from 'typeorm';
import { apiAccessModes, defaultApiPublicPermissions, type ApiAccessMode, type InstanceUnsignedFetchOption, instanceUnsignedFetchOptions } from '@/const.js';
import { id } from './util/id.js';
import { MiUser } from './User.js';

@Entity('meta')
export class MiMeta {
	@PrimaryColumn({
		type: 'varchar',
		length: 32,
	})
	public id: string;

	@Column({
		...id(),
		nullable: true,
	})
	public rootUserId: MiUser['id'] | null;

	@ManyToOne(type => MiUser, {
		onDelete: 'SET NULL',
		nullable: true,
	})
	public rootUser: MiUser | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public name: string | null;

	@Column('varchar', {
		length: 64, nullable: true,
	})
	public shortName: string | null;

	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public description: string | null;

	@Column('text', {
		nullable: true,
	})
	public about: string | null;

	/**
	 * メンテナの名前
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerName: string | null;

	/**
	 * メンテナの連絡先
	 */
	@Column('varchar', {
		length: 1024, nullable: true,
	})
	public maintainerEmail: string | null;

	@Column('boolean', {
		default: true,
	})
	public disableRegistration: boolean;

	@Column('enum', {
		enum: apiAccessModes,
		enumName: 'meta_apiaccessmode_enum',
		default: 'open',
	})
	public apiAccessMode: ApiAccessMode;

	@Column('boolean', {
		default: true,
	})
	public enableOAuthLogin: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableOidc: boolean;

	@Column('boolean', {
		default: false,
	})
	public apiRequireAppApproval: boolean;

	@Column('varchar', {
		length: 64,
		array: true,
		default: defaultApiPublicPermissions,
	})
	public apiPublicPermissions: string[];

	@Column('integer', {
		default: 60,
	})
	public apiDefaultTokenRateLimit: number;

	@Column('integer', {
		default: 20,
	})
	public apiWriteTokenRateLimit: number;

	// 免申请权限白名单：apiAccessMode='approval' 时，若令牌/应用请求的 scope 全在此集合内，
	// 则跳过「需管理员审批」这一步（低风险只读放行；写/敏感/admin 仍需审批）。
	@Column('varchar', {
		length: 64,
		array: true,
		default: '{}',
	})
	public apiNoApprovalPermissions: string[];

	// 是否允许普通用户创建个人开发者令牌（关掉可从源头封堵第三方"API中转"收割账号令牌）。
	@Column('boolean', {
		default: true,
	})
	public apiAllowDeveloperTokens: boolean;

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public langs: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public pinnedUsers: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public hiddenTags: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public hiddenSearchTrendTerms: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public blockedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public sensitiveWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWords: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public prohibitedWordsForNameOfUser: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public silencedHosts: string[];

	@Column('varchar', {
		length: 1024, array: true, default: '{}',
	})
	public mediaSilencedHosts: string[];

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public themeColor: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mascotImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public bannerUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public backgroundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public logoImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public iconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app192IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public app512IconUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public sidebarLogoUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public serverErrorImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public notFoundImageUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public infoImageUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public cacheRemoteFiles: boolean;

	@Column('boolean', {
		default: true,
	})
	public cacheRemoteSensitiveFiles: boolean;

	@Column('boolean', {
		default: false,
	})
	public emailRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public approvalRequiredForSignup: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableHcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public hcaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableMcaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSitekey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaSecretKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public mcaptchaInstanceUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableRecaptcha: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public recaptchaSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTurnstile: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public turnstileSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableFC: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public fcSiteKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public fcSecretKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTestcaptcha: boolean;

	// chaptcha系を追加した際にはnodeinfoのレスポンスに追加するのを忘れないようにすること

	@Column('enum', {
		enum: ['none', 'all', 'local', 'remote'],
		default: 'none',
	})
	public sensitiveMediaDetection: 'none' | 'all' | 'local' | 'remote';

	@Column('enum', {
		enum: ['medium', 'low', 'high', 'veryLow', 'veryHigh'],
		default: 'medium',
	})
	public sensitiveMediaDetectionSensitivity: 'medium' | 'low' | 'high' | 'veryLow' | 'veryHigh';

	@Column('boolean', {
		default: false,
	})
	public setSensitiveFlagAutomatically: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableSensitiveMediaDetectionForVideos: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableBotTrending: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableEmail: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public email: string | null;

	@Column('boolean', {
		default: false,
	})
	public smtpSecure: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpHost: string | null;

	@Column('integer', {
		nullable: true,
	})
	public smtpPort: number | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpUser: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public smtpPass: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableServiceWorker: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPublicKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public swPrivateKey: string | null;

	@Column('integer', {
		default: 5000,
		comment: 'Timeout in milliseconds for translation API requests',
	})
	public translationTimeout: number;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public deeplIsPro: boolean;

	@Column('boolean', {
		default: false,
	})
	public deeplFreeMode: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public deeplFreeInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public libreTranslateURL: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public libreTranslateKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public termsOfServiceUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/universe-federation/universe-federation',
		nullable: true,
	})
	public repositoryUrl: string | null;

	@Column('varchar', {
		length: 1024,
		default: 'https://github.com/universe-federation/universe-federation/issues/new',
		nullable: true,
	})
	public feedbackUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public impressumUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public privacyPolicyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public donationUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public inquiryUrl: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultLightTheme: string | null;

	@Column('varchar', {
		length: 8192,
		nullable: true,
	})
	public defaultDarkTheme: string | null;

	@Column('boolean', {
		default: false,
	})
	public useObjectStorage: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBucket: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStoragePrefix: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageBaseUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageEndpoint: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageRegion: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageAccessKey: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public objectStorageSecretKey: string | null;

	@Column('integer', {
		nullable: true,
	})
	public objectStoragePort: number | null;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseSSL: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageUseProxy: boolean;

	@Column('boolean', {
		default: false,
	})
	public objectStorageSetPublicRead: boolean;

	@Column('boolean', {
		default: true,
	})
	public objectStorageS3ForcePathStyle: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableIpLogging: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableActiveEmailValidation: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableVerifymailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public verifymailAuthKey: string | null;

	@Column('boolean', {
		default: false,
	})
	public enableTruemailApi: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailInstance: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public truemailAuthKey: string | null;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForRemoteUser: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableChartsForFederatedInstances: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableStatsForFederatedInstances: boolean;

	@Column('boolean', {
		default: false,
	})
	public enableServerMachineStats: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableIdenticonGeneration: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableAchievements: boolean;

	@Column('integer', {
		default: 500,
	})
	public chatRoomDefaultMemberLimit: number;

	// 紧急模式：开启后除站点管理员外，任何人都不能收发/查看任何聊天消息。
	@Column('boolean', {
		default: false,
	})
	public chatEmergencyMode: boolean;

	// 帖子紧急隐藏（黑屏）：开启后除管理员/审核员外，任何人在所有时间线/单帖处都看不到任何帖子。
	@Column('boolean', {
		default: false,
	})
	public notesHideEmergencyMode: boolean;

	// 冻结全站发帖：开启后除管理员/审核员外，任何人不能发帖/回复/转发。
	@Column('boolean', {
		default: false,
	})
	public notesPostingFrozen: boolean;

	// 统一聊天保持期（天）。>0 时，早于该时长的聊天消息不可查看并会被自动清理。0=不限制。
	@Column('integer', {
		default: 0,
	})
	public chatMessageRetentionDays: number;

	// 全站聊天违禁关键词：命中的消息在所有群聊/私聊中都会被拦截（并可一键清理历史）。
	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public chatBannedKeywords: string[];

	@Column('boolean', {
		default: false,
	})
	public enableAi: boolean;

	@Column('boolean', {
		default: false,
	})
	public showAiInNavbar: boolean;

	@Column({
		...id(),
		nullable: true,
	})
	public aiDefaultProviderId: string | null;

	@Column('integer', {
		default: 20,
	})
	public aiMaxContextMessages: number;

	@Column('text', {
		nullable: true,
	})
	public robotsTxt: string | null;

	@Column('jsonb', {
		default: { },
	})
	public policies: Record<string, any>;

	@Column('jsonb', {
		default: { },
	})
	public recommendationConfig: Record<string, any>;

	@Column('text', {
		array: true,
		default: '{}',
	})
	public serverRules: string[];

	@Column('varchar', {
		length: 8192,
		default: '{}',
	})
	public manifestJsonOverride: string;

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public bannedEmailDomains: string[];

	// 注册邮箱白名单限制：开启后，注册/换绑邮箱仅允许 signupEmailRules 中列出的域名，
	// 且本地部分(@前)需匹配该域名的正则(用于防 qq 别名、gmail 的 . / + 别名等)。
	@Column('boolean', {
		default: false,
	})
	public signupEmailRestriction: boolean;

	@Column('jsonb', {
		default: [],
	})
	public signupEmailRules: { domain: string; localPartRegex: string; }[];

	@Column('varchar', {
		length: 1024, array: true, default: '{admin,administrator,root,system,maintainer,host,mod,moderator,owner,superuser,staff,auth,i,me,everyone,all,mention,mentions,example,user,users,account,accounts,official,help,helps,support,supports,info,information,informations,announce,announces,announcement,announcements,notice,notification,notifications,dev,developer,developers,tech,misskey}',
	})
	public preservedUsernames: string[];

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimeline: boolean;

	@Column('boolean', {
		default: true,
	})
	public enableFanoutTimelineDbFallback: boolean;

	@Column('integer', {
		default: 800,
	})
	public perLocalUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perRemoteUserUserTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perUserHomeTimelineCacheMax: number;

	@Column('integer', {
		default: 800,
	})
	public perUserListTimelineCacheMax: number;

	@Column('boolean', {
		default: false,
	})
	public enableReactionsBuffering: boolean;

	@Column('integer', {
		default: 0,
	})
	public notesPerOneAd: number;

	@Column('varchar', {
		length: 500,
		default: '❤️',
	})
	public defaultLike: string;

	@Column('varchar', {
		length: 256, array: true, default: '{}',
	})
	public bubbleInstances: string[];

	@Column('boolean', {
		default: true,
	})
	public urlPreviewEnabled: boolean;

	@Column('integer', {
		default: 10000,
	})
	public urlPreviewTimeout: number;

	@Column('bigint', {
		default: 1024 * 1024 * 10,
	})
	public urlPreviewMaximumContentLength: number;

	@Column('boolean', {
		default: false,
	})
	public urlPreviewRequireContentLength: boolean;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewSummaryProxyUrl: string | null;

	@Column('varchar', {
		length: 1024,
		nullable: true,
	})
	public urlPreviewUserAgent: string | null;

	@Column('varchar', {
		length: 3072,
		array: true,
		default: '{}',
		comment: 'An array of URL strings or regex that can be used to omit warnings about redirects to external sites. Separate them with spaces to specify AND, and enclose them with slashes to specify regular expressions. Each item is regarded as an OR.',
	})
	public trustedLinkUrlPatterns: string[];

	@Column('varchar', {
		length: 128,
		default: 'all',
	})
	public federation: 'all' | 'specified' | 'none';

	@Column('varchar', {
		length: 1024,
		array: true,
		default: '{}',
	})
	public federationHosts: string[];

	/**
	 * In combination with user.allowUnsignedFetch, controls enforcement of HTTP signatures for inbound ActivityPub fetches (GET requests).
	 */
	@Column('enum', {
		enum: instanceUnsignedFetchOptions,
		default: 'always',
	})
	public allowUnsignedFetch: InstanceUnsignedFetchOption;

	@Column('boolean', {
		default: false,
	})
	public enableProxyAccount: boolean;

	@Column('jsonb', {
		default: [],
	})
	public deliverSuspendedSoftware: SoftwareSuspension[];

	constructor(data?: Partial<MiMeta>) {
		if (data) {
			Object.assign(this, data);
		}
	}
}

export type SoftwareSuspension = {
	software: string,
	versionRange: string,
};
