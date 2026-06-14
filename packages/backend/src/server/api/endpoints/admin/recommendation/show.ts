/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { NotesRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { IdService } from '@/core/IdService.js';
import { TimeService } from '@/global/TimeService.js';
import { RecommendationService } from '@/core/RecommendationService.js';
import { ApiError } from '@/server/api/error.js';

const PROMO_PATTERN = /(加.{0,3}(微信|威信|vx|wx|q\s*群|qq\s*群|电报|飞机|tg|telegram))|(返利|佣金|返佣|分销|代理|招商|加盟|拉新|地推|带货|变现|副业|兼职|日入|月入|躺赚|薅羊毛|割韭菜)|(\baff\b|affiliate|联盟营销|推广链接|邀请链接|优惠码|折扣码)/i;
const LOW_VALUE_PATTERN = /^(签到|打卡|水|路过|测试|1|11|111|。|，|哈)+$/i;

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'read:admin:recommendation',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			noteId: { type: 'string', optional: false, nullable: false },
			ageHours: { type: 'number', optional: false, nullable: false },
			engagement: {
				type: 'object', optional: false, nullable: false,
				properties: {
					reactions: { type: 'number', optional: false, nullable: false },
					replies: { type: 'number', optional: false, nullable: false },
					renotes: { type: 'number', optional: false, nullable: false },
					clips: { type: 'number', optional: false, nullable: false },
					total: { type: 'number', optional: false, nullable: false },
				},
			},
			author: {
				type: 'object', optional: false, nullable: false,
				properties: {
					id: { type: 'string', optional: false, nullable: false },
					username: { type: 'string', optional: false, nullable: false },
					name: { type: 'string', optional: false, nullable: true },
					accountAgeDays: { type: 'number', optional: false, nullable: false },
					followersCount: { type: 'number', optional: false, nullable: false },
					followingCount: { type: 'number', optional: false, nullable: false },
					notesCount: { type: 'number', optional: false, nullable: false },
					isBot: { type: 'boolean', optional: false, nullable: false },
					trustScore: { type: 'number', optional: false, nullable: false },
				},
			},
			flags: {
				type: 'object', optional: false, nullable: false,
				properties: {
					textLength: { type: 'number', optional: false, nullable: false },
					hasMedia: { type: 'boolean', optional: false, nullable: false },
					lowValueSuspected: { type: 'boolean', optional: false, nullable: false },
					promoSuspected: { type: 'boolean', optional: false, nullable: false },
				},
			},
			exposureCount: { type: 'number', optional: false, nullable: false },
			pinned: { type: 'boolean', optional: false, nullable: false },
			scoreBoost: { type: 'number', optional: false, nullable: false },
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'd3a1f0b2-7c4e-4f9a-8b2d-1e3c5a7f9b02',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['noteId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		private idService: IdService,
		private recommendationService: RecommendationService,
		private readonly timeService: TimeService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const note = await this.notesRepository.findOne({
				where: { id: ps.noteId },
				relations: { user: true },
			});
			if (note == null || note.user == null) {
				throw new ApiError(meta.errors.noSuchNote);
			}

			const now = this.timeService.now;
			const user = note.user;
			const text = (note.text ?? '').trim();
			const compactText = text.replace(/\s+/g, '');
			const reactions = Object.values(note.reactions ?? {}).reduce((acc, value) => acc + Number(value), 0);
			const replies = note.repliesCount ?? 0;
			const renotes = note.renoteCount ?? 0;
			const clips = note.clippedCount ?? 0;

			const accountAgeDays = Math.max(0, (now - this.idService.parse(user.id).date.getTime()) / (1000 * 60 * 60 * 24));
			// recommended-timeline の authorTrust と同じ口径
			let trustScore = 0;
			if (accountAgeDays < 1) trustScore -= 8;
			else if (accountAgeDays >= 30) trustScore += 6;
			else if (accountAgeDays >= 7) trustScore += 3;
			trustScore += Math.min(Number(user.followersCount ?? 0), 100) / 100 * 8;
			if (user.avatarId != null) trustScore += 2;
			if (user.isBot === true) trustScore -= 6;

			const [exposureCounts, override] = await Promise.all([
				this.recommendationService.getNoteExposureCounts([ps.noteId]),
				this.recommendationService.getNoteOverride(ps.noteId),
			]);

			return {
				noteId: ps.noteId,
				ageHours: Math.round((now - this.idService.parse(ps.noteId).date.getTime()) / (1000 * 60 * 60) * 10) / 10,
				engagement: {
					reactions,
					replies,
					renotes,
					clips,
					total: reactions + replies + renotes + clips,
				},
				author: {
					id: user.id,
					username: user.username,
					name: user.name,
					accountAgeDays: Math.round(accountAgeDays * 10) / 10,
					followersCount: user.followersCount ?? 0,
					followingCount: user.followingCount ?? 0,
					notesCount: user.notesCount ?? 0,
					isBot: user.isBot === true,
					trustScore: Math.round(trustScore * 10) / 10,
				},
				flags: {
					textLength: compactText.length,
					hasMedia: (note.fileIds?.length ?? 0) > 0,
					lowValueSuspected: LOW_VALUE_PATTERN.test(compactText) || (compactText.length < 6 && (note.fileIds?.length ?? 0) === 0),
					promoSuspected: PROMO_PATTERN.test(text),
				},
				exposureCount: exposureCounts.get(ps.noteId) ?? 0,
				pinned: override?.pinned ?? false,
				scoreBoost: override?.scoreBoost ?? 0,
			};
		});
	}
}
