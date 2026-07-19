/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'node:assert';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { CoreModule } from '@/core/CoreModule.js';
import { PollService } from '@/core/PollService.js';
import { IdService } from '@/core/IdService.js';
import { DI } from '@/di-symbols.js';
import { MiNote } from '@/models/Note.js';
import { MiPoll } from '@/models/Poll.js';
import type {
	NotesRepository,
	PollsRepository,
	PollVotesRepository,
	UserProfilesRepository,
	UsersRepository,
	MiUser,
} from '@/models/_.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';

describe('PollService.vote concurrency', () => {
	let app: TestingModule;
	let pollService: PollService;
	let idService: IdService;
	let usersRepository: UsersRepository;
	let userProfilesRepository: UserProfilesRepository;
	let notesRepository: NotesRepository;
	let pollsRepository: PollsRepository;
	let pollVotesRepository: PollVotesRepository;

	async function createUser(data: Partial<MiUser> = {}): Promise<MiUser> {
		const user = await usersRepository
			.insert({
				id: idService.gen(),
				username: data.username ?? 'u' + idService.gen().slice(0, 8),
				usernameLower: (data.username ?? 'u' + idService.gen().slice(0, 8)).toLowerCase(),
				...data,
			})
			.then(x => usersRepository.findOneByOrFail(x.identifiers[0]));

		await userProfilesRepository.insert({
			userId: user.id,
		});

		return user;
	}

	async function createPollNote(author: MiUser, multiple: boolean) {
		const note = await notesRepository
			.insert({
				id: idService.gen(),
				userId: author.id,
				visibility: 'public',
				localOnly: false,
				text: 'poll',
				cw: null,
				renoteCount: 0,
				repliesCount: 0,
				clippedCount: 0,
				reactions: {},
				fileIds: [],
				attachedFileTypes: [],
				visibleUserIds: [],
				mentions: [],
				mentionedRemoteUsers: '[]',
				reactionAndUserPairCache: [],
				emojis: [],
				tags: [],
				hasPoll: true,
			})
			.then(x => notesRepository.findOneByOrFail(x.identifiers[0]));

		await pollsRepository.insert({
			noteId: note.id,
			userId: author.id,
			userHost: null,
			channelId: null,
			noteVisibility: 'public',
			multiple,
			choices: ['a', 'b', 'c'],
			votes: [0, 0, 0],
			expiresAt: null,
		});

		return note;
	}

	beforeAll(async () => {
		app = await Test.createTestingModule({
			imports: [GlobalModule, CoreModule],
		})
			.overrideProvider(GlobalEventService)
			.useValue({ publishNoteStream: () => {} })
			.overrideProvider(UserBlockingService)
			.useValue({ checkBlocked: async () => false })
			.compile();

		await app.init();
		app.enableShutdownHooks();

		pollService = app.get(PollService);
		idService = app.get(IdService);
		usersRepository = app.get(DI.usersRepository);
		userProfilesRepository = app.get(DI.userProfilesRepository);
		notesRepository = app.get(DI.notesRepository);
		pollsRepository = app.get(DI.pollsRepository);
		pollVotesRepository = app.get(DI.pollVotesRepository);
	}, 120_000);

	afterAll(async () => {
		await app.close();
	});

	afterEach(async () => {
		await pollVotesRepository.deleteAll();
		await pollsRepository.deleteAll();
		await notesRepository.deleteAll();
		await userProfilesRepository.deleteAll();
		await usersRepository.deleteAll();
	});

	test('non-multiple concurrent distinct choices: only one succeeds', async () => {
		const author = await createUser({ username: 'author1', usernameLower: 'author1' });
		const voter = await createUser({ username: 'voter1', usernameLower: 'voter1' });
		const note = await createPollNote(author, false);

		const results = await Promise.allSettled([
			pollService.vote(voter, note, 0),
			pollService.vote(voter, note, 1),
		]);

		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');
		assert.strictEqual(fulfilled.length, 1, `expected 1 success, got ${JSON.stringify(results)}`);
		assert.strictEqual(rejected.length, 1);
		assert.ok(
			rejected[0].status === 'rejected' &&
				rejected[0].reason instanceof Error &&
				rejected[0].reason.message === 'already voted',
		);

		const rows = await pollVotesRepository.findBy({ noteId: note.id, userId: voter.id });
		assert.strictEqual(rows.length, 1);

		const poll = await pollsRepository.findOneByOrFail({ noteId: note.id });
		const sum = poll.votes.reduce((a, b) => a + b, 0);
		assert.strictEqual(sum, 1);
		assert.strictEqual(poll.votes[rows[0].choice], 1);
	});

	test('multiple concurrent distinct choices: both succeed', async () => {
		const author = await createUser({ username: 'author2', usernameLower: 'author2' });
		const voter = await createUser({ username: 'voter2', usernameLower: 'voter2' });
		const note = await createPollNote(author, true);

		const results = await Promise.allSettled([
			pollService.vote(voter, note, 0),
			pollService.vote(voter, note, 1),
		]);

		assert.strictEqual(results.filter(r => r.status === 'fulfilled').length, 2, JSON.stringify(results));

		const rows = await pollVotesRepository.findBy({ noteId: note.id, userId: voter.id });
		assert.strictEqual(rows.length, 2);

		const poll = await pollsRepository.findOneByOrFail({ noteId: note.id });
		assert.strictEqual(poll.votes[0], 1);
		assert.strictEqual(poll.votes[1], 1);
		assert.strictEqual(poll.votes[2], 0);
	});

	test('multiple concurrent same choice: only one succeeds', async () => {
		const author = await createUser({ username: 'author3', usernameLower: 'author3' });
		const voter = await createUser({ username: 'voter3', usernameLower: 'voter3' });
		const note = await createPollNote(author, true);

		const results = await Promise.allSettled([
			pollService.vote(voter, note, 2),
			pollService.vote(voter, note, 2),
		]);

		const fulfilled = results.filter(r => r.status === 'fulfilled');
		const rejected = results.filter(r => r.status === 'rejected');
		assert.strictEqual(fulfilled.length, 1, JSON.stringify(results));
		assert.strictEqual(rejected.length, 1);
		assert.ok(
			rejected[0].status === 'rejected' &&
				rejected[0].reason instanceof Error &&
				rejected[0].reason.message === 'already voted',
		);

		const rows = await pollVotesRepository.findBy({ noteId: note.id, userId: voter.id });
		assert.strictEqual(rows.length, 1);

		const poll = await pollsRepository.findOneByOrFail({ noteId: note.id });
		assert.strictEqual(poll.votes[2], 1);
		assert.strictEqual(poll.votes.reduce((a, b) => a + b, 0), 1);
	});
});
