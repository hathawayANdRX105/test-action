/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomSchema = {
	type: 'object',
	properties: {
		id: {
			type: 'string',
			optional: false, nullable: false,
		},
		createdAt: {
			type: 'string',
			format: 'date-time',
			optional: false, nullable: false,
		},
		ownerId: {
			type: 'string',
			optional: false, nullable: false,
		},
		owner: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
		name: {
			type: 'string',
			optional: false, nullable: false,
		},
		description: {
			type: 'string',
			optional: false, nullable: false,
		},
		avatarUrl: {
			type: 'string',
			optional: false, nullable: true,
		},
		isSilenced: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		announcement: {
			type: 'string',
			optional: false, nullable: false,
		},
		announcementPinned: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		announcementHistory: {
			type: 'array',
			optional: true, nullable: false,
			items: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					id: { type: 'string', optional: false, nullable: false },
					text: { type: 'string', optional: false, nullable: false },
					createdAt: { type: 'string', optional: false, nullable: false },
					pinned: { type: 'boolean', optional: false, nullable: false },
				},
			},
		},
		joinMode: {
			type: 'string',
			optional: false, nullable: false,
			enum: ['inviteOnly', 'open', 'closed'],
		},
		memberLimit: {
			type: 'integer',
			optional: false, nullable: false,
		},
		memberLimitOverride: {
			type: 'integer',
			optional: true, nullable: true,
		},
		canManage: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		canModerateRoom: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		canManageRoomRoles: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		canEditRoomProfile: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		canDeleteRoom: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		messageRetentionDays: {
			type: 'integer',
			optional: true, nullable: true,
		},
		slowModeSeconds: {
			type: 'integer',
			optional: false, nullable: false,
		},
		bannedKeywords: {
			type: 'array',
			optional: true, nullable: false,
			items: {
				type: 'string',
				optional: false, nullable: false,
			},
		},
		keywordMuteSeconds: {
			type: 'integer',
			optional: true, nullable: false,
		},
		memberCount: {
			type: 'integer',
			optional: false, nullable: false,
		},
		isJoined: {
			type: 'boolean',
			optional: false, nullable: false,
		},
		isMuted: {
			type: 'boolean',
			optional: true, nullable: false,
		},
		myMutedUntil: {
			type: 'string',
			format: 'date-time',
			optional: true, nullable: true,
		},
		myNickname: {
			type: 'string',
			optional: true, nullable: true,
		},
		myFolder: {
			type: 'string',
			optional: true, nullable: true,
		},
	},
} as const;
