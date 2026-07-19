/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { NotesRepository, UsersRepository, PollsRepository, PollVotesRepository, MiUser } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import { MiPoll } from '@/models/Poll.js';
import { MiPollVote } from '@/models/PollVote.js';
import { RelayService } from '@/core/RelayService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { bindThis } from '@/decorators.js';
import { isLocalUser } from '@/models/User.js';
import { CacheService } from '@/core/CacheService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { isDuplicateKeyValueError } from '@/misc/is-duplicate-key-value-error.js';

@Injectable()
export class PollService {
	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.pollsRepository)
		private pollsRepository: PollsRepository,

		@Inject(DI.pollVotesRepository)
		private pollVotesRepository: PollVotesRepository,

		@Inject(DI.db)
		private readonly db: DataSource,

		private idService: IdService,
		private relayService: RelayService,
		private globalEventService: GlobalEventService,
		private userBlockingService: UserBlockingService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
		private readonly cacheService: CacheService,
	) {
	}

	@bindThis
	public async vote(user: MiUser, note: MiNote, choice: number): Promise<MiPollVote> {
		// Check blocking (outside lock; not the race we serialize)
		if (note.userId !== user.id) {
			const blocked = await this.userBlockingService.checkBlocked(note.userId, user.id);
			if (blocked) {
				throw new Error('blocked');
			}
		}

		let vote: MiPollVote;
		try {
			vote = await this.db.transaction(async tem => {
				// Serialize votes on this poll (multiple distinct choices still allowed when poll.multiple)
				const poll = await tem
					.getRepository(MiPoll)
					.createQueryBuilder('poll')
					.setLock('pessimistic_write')
					.where('poll.noteId = :noteId', { noteId: note.id })
					.getOne();

				if (poll == null) throw new Error('poll not found');

				// Check whether is valid choice
				if (poll.choices[choice] == null) throw new Error('invalid choice param');

				const exist = await tem.getRepository(MiPollVote).findBy({
					noteId: note.id,
					userId: user.id,
				});

				if (poll.multiple) {
					if (exist.some(x => x.choice === choice)) {
						throw new Error('already voted');
					}
				} else if (exist.length !== 0) {
					throw new Error('already voted');
				}

				const inserted = await tem.getRepository(MiPollVote).save({
					id: this.idService.gen(),
					noteId: note.id,
					userId: user.id,
					choice: choice,
				});

				// Increment votes count (1-based array index; parameterized noteId)
				const index = choice + 1;
				await tem.query(
					`UPDATE poll SET votes[${index}] = votes[${index}] + 1 WHERE "noteId" = $1`,
					[poll.noteId],
				);

				return inserted;
			});
		} catch (e) {
			// Same-choice race on multiple (unique userId+noteId+choice) or any 23505
			if (isDuplicateKeyValueError(e)) {
				throw new Error('already voted');
			}
			throw e;
		}

		this.globalEventService.publishNoteStream(note.id, 'pollVoted', {
			id: note.id,
			userId: note.userId,
			body: {
				choice: choice,
				userId: user.id,
			},
		});

		return vote;
	}

	@bindThis
	public async deliverQuestionUpdate(note: MiNote) {
		if (note.localOnly) return;

		const user = note.user ?? await this.cacheService.findUserById(note.userId);

		if (isLocalUser(user)) {
			const content = this.apRendererService.addContext(this.apRendererService.renderUpdate(await this.apRendererService.renderNote(note, user, false), user));
			await this.apDeliverManagerService.deliverToFollowers(user, content);
			await this.relayService.deliverToRelays(user, content);
		}
	}
}
