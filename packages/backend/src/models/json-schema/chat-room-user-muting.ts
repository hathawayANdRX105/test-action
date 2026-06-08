/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export const packedChatRoomUserMutingSchema = {
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
		roomId: {
			type: 'string',
			optional: false, nullable: false,
		},
		muterId: {
			type: 'string',
			optional: false, nullable: false,
		},
		muteeId: {
			type: 'string',
			optional: false, nullable: false,
		},
		user: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'UserLite',
		},
	},
} as const;
