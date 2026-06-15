/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ChatService } from '@/core/ChatService.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';

export const meta = {
	tags: ['admin', 'chat'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:meta',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			deleted: { type: 'integer', optional: false, nullable: false },
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		// 省略时使用后台已配置的全站违禁关键词。
		keywords: { type: 'array', items: { type: 'string' }, nullable: true },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private chatService: ChatService,
		private moderationLogService: ModerationLogService,
	) {
		super(meta, paramDef, async (ps, me) => {
			let keywords = (ps.keywords ?? []).map(k => k.trim()).filter(k => k.length > 0);
			if (keywords.length === 0) {
				const controlMeta = await this.chatService.getChatControlMeta();
				keywords = controlMeta.chatBannedKeywords ?? [];
			}
			if (keywords.length === 0) return { deleted: 0 };

			const deleted = await this.chatService.purgeMessagesByKeywords(keywords);

			await this.moderationLogService.log(me, 'chatPurgeByKeyword', {
				keywords,
				deleted,
			});

			return { deleted };
		});
	}
}
