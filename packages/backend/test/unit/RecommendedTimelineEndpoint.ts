/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import RecommendedTimelineEndpoint from '@/server/api/endpoints/notes/recommended-timeline.js';

describe('recommended timeline endpoint', () => {
	function createQueryBuilder(rows: any[]) {
		return {
			andWhere: jest.fn(function (this: any) { return this; }),
			innerJoinAndSelect: jest.fn(function (this: any) { return this; }),
			leftJoinAndSelect: jest.fn(function (this: any) { return this; }),
			addSelect: jest.fn(function (this: any) { return this; }),
			setParameter: jest.fn(function (this: any) { return this; }),
			setParameters: jest.fn(function (this: any) { return this; }),
			orderBy: jest.fn(function (this: any) { return this; }),
			offset: jest.fn(function (this: any) { return this; }),
			limit: jest.fn(function (this: any) { return this; }),
			getMany: jest.fn(async () => rows),
		};
	}

	function createEndpoint(rows: any[]) {
		const queryBuilder = createQueryBuilder(rows);
		const notesRepository: any = {
			createQueryBuilder: jest.fn(() => queryBuilder),
			query: jest.fn(async () => []),
		};
		const noteEntityService: any = {
			packMany: jest.fn(async (notes: any[]) => notes.map(note => ({ id: note.id }))),
		};
		const queryService: any = {
			generateExcludedRepliesQueryForNotes: jest.fn(),
			generateVisibilityQuery: jest.fn(),
			generateReplyTargetVisibilityQuery: jest.fn(),
			generateBlockedHostQueryForNote: jest.fn(),
			generateSuspendedUserQueryForNote: jest.fn(),
			generateSilencedUserQueryForNotes: jest.fn(),
			generateMutedUserQueryForNotes: jest.fn(),
			generateBlockedUserQueryForNotes: jest.fn(),
			generateMutedNoteThreadQuery: jest.fn(),
			generateExcludedRenotesQueryForNotes: jest.fn(),
			generateMutedUserRenotesQueryForNotes: jest.fn(),
		};
		const roleService: any = {
			getUserPolicies: jest.fn(async () => ({
				ltlAvailable: true,
				gtlAvailable: true,
			})),
		};
		const idService: any = {
			gen: jest.fn((value?: number) => String(value ?? 0).padStart(16, '0')),
		};
		const userService: any = {
			markUserActive: jest.fn(),
		};
		const recommendationService: any = {
			recordDelivery: jest.fn(),
		};
		const timeService: any = {
			now: 1700000000000,
		};

		return {
			endpoint: new RecommendedTimelineEndpoint(
				notesRepository,
				noteEntityService,
				queryService,
				roleService,
				idService,
				userService,
				recommendationService,
				timeService,
			),
			notesRepository,
			noteEntityService,
			queryBuilder,
		};
	}

	test('latestReply skips stale candidates whose reply or renote target cannot be packed', async () => {
		const goodNote = {
			id: '0000000000000003',
			userId: 'author',
			user: { id: 'author' },
			text: 'valid note',
			channelId: null,
			replyId: null,
			reply: null,
			renoteId: null,
			renote: null,
		};
		const staleReply = {
			...goodNote,
			id: '0000000000000002',
			text: 'reply target was deleted',
			replyId: '0000000000000001',
			replyUserId: 'author',
			reply: null,
		};
		const staleRenote = {
			...goodNote,
			id: '0000000000000004',
			text: null,
			renoteId: '0000000000000001',
			renoteUserId: 'author',
			renote: null,
		};
		const ctx = createEndpoint([staleReply, goodNote, staleRenote]);

		await expect(ctx.endpoint.exec({
			scope: 'mixed',
			surface: 'home',
			category: 'forYou',
			sort: 'latestReply',
			rankMode: 'personalized',
			withRenotes: true,
			withBots: true,
			limit: 10,
		}, { id: 'me' } as never, null)).resolves.toEqual([{ id: goodNote.id }]);

		expect(ctx.notesRepository.query).toHaveBeenCalledWith(expect.stringContaining('MAX("id")'), [[goodNote.id]]);
		expect(ctx.noteEntityService.packMany).toHaveBeenCalledWith([goodNote], { id: 'me' });
	});

	test('latestReply skips nested boosts whose inner renote target cannot be packed', async () => {
		const goodNote = {
			id: '0000000000000005',
			userId: 'author',
			user: { id: 'author' },
			text: 'valid note',
			cw: null,
			fileIds: [],
			hasPoll: false,
			channelId: null,
			replyId: null,
			reply: null,
			renoteId: null,
			renote: null,
		};
		const nestedStaleBoost = {
			id: '0000000000000004',
			userId: 'booster',
			user: { id: 'booster' },
			text: null,
			cw: null,
			fileIds: [],
			hasPoll: false,
			channelId: null,
			replyId: null,
			reply: null,
			renoteId: '0000000000000003',
			renote: {
				id: '0000000000000003',
				userId: 'inner-booster',
				user: { id: 'inner-booster' },
				text: null,
				cw: null,
				fileIds: [],
				hasPoll: false,
				replyId: null,
				reply: null,
				renoteId: '0000000000000001',
				renote: null,
			},
		};
		const ctx = createEndpoint([nestedStaleBoost, goodNote]);

		await expect(ctx.endpoint.exec({
			scope: 'mixed',
			surface: 'home',
			category: 'forYou',
			sort: 'latestReply',
			rankMode: 'personalized',
			withRenotes: true,
			withBots: true,
			limit: 10,
		}, { id: 'me' } as never, null)).resolves.toEqual([{ id: goodNote.id }]);

		expect(ctx.notesRepository.query).toHaveBeenCalledWith(expect.stringContaining('MAX("id")'), [[goodNote.id]]);
		expect(ctx.noteEntityService.packMany).toHaveBeenCalledWith([goodNote], { id: 'me' });
	});
});
