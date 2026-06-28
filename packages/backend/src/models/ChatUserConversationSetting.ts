/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChatMessage } from './ChatMessage.js';

@Entity('chat_user_conversation_setting')
@Index(['userId', 'otherUserId'], { unique: true })
export class MiChatUserConversationSetting {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
	})
	public otherUserId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public otherUser: MiUser | null;

	@Index()
	@Column({
		...id(),
	})
	public hiddenUntilMessageId: MiChatMessage['id'];

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
