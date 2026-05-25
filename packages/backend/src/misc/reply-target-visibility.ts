/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { IsNull } from 'typeorm';
import type { FollowingsRepository, NotesRepository } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

export async function getReplyTargetVisibleUserIds(
	note: MiNote,
	notesRepository: NotesRepository,
	followingsRepository: FollowingsRepository,
): Promise<ReadonlySet<MiUser['id']> | null> {
	const reply = note.reply ?? (note.replyId != null ? await notesRepository.findOne({
		where: { id: note.replyId },
		select: ['id', 'userId', 'visibility', 'visibleUserIds', 'mentions'],
	}) : null);

	if (reply == null || reply.visibility === 'public' || reply.visibility === 'home') {
		return null;
	}

	const visibleUserIds = new Set<MiUser['id']>([reply.userId, ...reply.visibleUserIds, ...reply.mentions]);

	if (reply.visibility === 'followers') {
		const followings = await followingsRepository.find({
			where: {
				followeeId: reply.userId,
				followerHost: IsNull(),
				isFollowerHibernated: false,
			},
			select: ['followerId'],
		});

		for (const following of followings) {
			visibleUserIds.add(following.followerId);
		}
	}

	return visibleUserIds;
}
