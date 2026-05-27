/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as Misskey from 'misskey-js';
import { $i } from '@/i.js';

export function chatMessageContextPath(message: Misskey.entities.ChatMessage, currentUserId?: string | null): string {
	if (message.toRoomId != null) {
		return `/chat/room/${message.toRoomId}?messageId=${message.id}`;
	}

	if (currentUserId != null) {
		return `/chat/user/${currentUserId}?messageId=${message.id}`;
	}

	if (message.toUserId != null) {
		const otherId = message.fromUserId === $i?.id ? message.toUserId : message.fromUserId;
		return `/chat/user/${otherId}?messageId=${message.id}`;
	}

	return `/chat/messages/${message.id}`;
}

export function isSameChatMessageContext(message: Misskey.entities.ChatMessage, context: {
	userId?: string | null;
	roomId?: string | null;
}): boolean {
	if (message.toRoomId != null) {
		return context.roomId === message.toRoomId;
	}

	if (context.userId == null) return false;

	if (message.toUserId != null) {
		const otherId = message.fromUserId === $i?.id ? message.toUserId : message.fromUserId;
		return context.userId === otherId;
	}

	return false;
}
