/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAiConversation } from './AiConversation.js';

export type AiMessageRole = 'system' | 'user' | 'assistant';

export type AiMessageAttachment = {
	fileId?: string;
	name?: string;
	type?: string;
	url?: string;
};

@Entity('ai_message')
export class MiAiMessage {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public conversationId: MiAiConversation['id'];

	@ManyToOne(type => MiAiConversation, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public conversation: MiAiConversation | null;

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

	@Column('varchar', {
		length: 32,
	})
	public role: AiMessageRole;

	@Column('text', {
		nullable: true,
	})
	public content: string | null;

	@Column('jsonb', {
		default: [],
	})
	public attachments: AiMessageAttachment[];

	@Column('jsonb', {
		nullable: true,
	})
	public usage: Record<string, unknown> | null;

	@Column('text', {
		nullable: true,
	})
	public error: string | null;

	@Column('timestamp with time zone')
	public createdAt: Date;
}
