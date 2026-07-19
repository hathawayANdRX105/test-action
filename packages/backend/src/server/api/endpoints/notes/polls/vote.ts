/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { PollsRepository } from '@/models/_.js';
import type { MiRemoteUser } from '@/models/User.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GetterService } from '@/server/api/GetterService.js';
import { QueueService } from '@/core/QueueService.js';
import { PollService } from '@/core/PollService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { DI } from '@/di-symbols.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { CacheService } from '@/core/CacheService.js';
import { TimeService } from '@/global/TimeService.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { ApiError } from '../../../error.js';

export const meta = {
	tags: ['notes'],

	requireCredential: true,

	prohibitMoved: true,

	kind: 'write:votes',

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'ecafbd2e-c283-4d6d-aecb-1a0a33b75396',
		},

		noPoll: {
			message: 'The note does not attach a poll.',
			code: 'NO_POLL',
			id: '5f979967-52d9-4314-a911-1c673727f92f',
		},

		invalidChoice: {
			message: 'Choice ID is invalid.',
			code: 'INVALID_CHOICE',
			id: 'e0cc9a04-f2e8-41e4-a5f1-4127293260cc',
		},

		alreadyVoted: {
			message: 'You have already voted.',
			code: 'ALREADY_VOTED',
			id: '0963fc77-efac-419b-9424-b391608dc6d8',
		},

		alreadyExpired: {
			message: 'The poll is already expired.',
			code: 'ALREADY_EXPIRED',
			id: '1022a357-b085-4054-9083-8f8de358337e',
		},

		youHaveBeenBlocked: {
			message: 'You cannot vote this poll because you have been blocked by this user.',
			code: 'YOU_HAVE_BEEN_BLOCKED',
			id: '85a5377e-b1e9-4617-b0b9-5bea73331e49',
		},
	},

	// 10 calls per 5 seconds
	limit: {
		duration: 1000 * 5,
		max: 10,
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		noteId: { type: 'string', format: 'misskey:id' },
		choice: { type: 'integer' },
	},
	required: ['noteId', 'choice'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		private getterService: GetterService,
		private queueService: QueueService,
		private pollService: PollService,
		private apRendererService: ApRendererService,
		private userBlockingService: UserBlockingService,
		private readonly timeService: TimeService,
		private readonly cacheService: CacheService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const createdAt = this.timeService.date;

			// Get votee
			const note = await this.getterService.getNote(ps.noteId).catch(err => {
				if (err.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
				throw err;
			});

			if (!note.hasPoll) {
				throw new ApiError(meta.errors.noPoll);
			}

			// Check blocking (ApiError mapping; PollService also checks)
			if (note.userId !== me.id) {
				const blocked = await this.userBlockingService.checkBlocked(note.userId, me.id);
				if (blocked) {
					throw new ApiError(meta.errors.youHaveBeenBlocked);
				}
			}

			const poll = await this.pollsRepository.findOneByOrFail({ noteId: note.id });

			if (poll.expiresAt && poll.expiresAt < createdAt) {
				throw new ApiError(meta.errors.alreadyExpired);
			}

			if (poll.choices[ps.choice] == null) {
				throw new ApiError(meta.errors.invalidChoice);
			}

			// Shared mutator: transaction + row lock + insert + count (race-safe)
			let vote;
			try {
				vote = await this.pollService.vote(me, note, ps.choice);
			} catch (e) {
				if (e instanceof Error) {
					if (e.message === 'already voted') throw new ApiError(meta.errors.alreadyVoted);
					if (e.message === 'invalid choice param') throw new ApiError(meta.errors.invalidChoice);
					if (e.message === 'blocked') throw new ApiError(meta.errors.youHaveBeenBlocked);
					if (e.message === 'poll not found') throw new ApiError(meta.errors.noPoll);
				}
				throw e;
			}

			// リモート投票の場合リプライ送信
			if (note.userHost != null) {
				const pollOwner = await this.cacheService.findRemoteUserById(note.userId);

				this.queueService.deliver(me, this.apRendererService.addContext(this.apRendererService.renderVote(me, vote, note, poll, pollOwner)), pollOwner.inbox, false);
			}

			// リモートフォロワーにUpdate配信
			trackPromise(this.pollService.deliverQuestionUpdate(note));
		});
	}
}
