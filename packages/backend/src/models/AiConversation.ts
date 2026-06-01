/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiAiProvider } from './AiProvider.js';

@Entity('ai_conversation')
export class MiAiConversation {
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

	@Column('varchar', {
		length: 256,
	})
	public title: string;

	@Index()
	@Column({
		...id(),
		nullable: true,
	})
	public providerId: MiAiProvider['id'] | null;

	@ManyToOne(type => MiAiProvider, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public provider: MiAiProvider | null;

	@Column('varchar', {
		length: 512,
	})
	public model: string;

	@Column('text', {
		nullable: true,
	})
	public systemPrompt: string | null;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
