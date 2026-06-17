/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryGeneratedColumn } from 'typeorm';
import { id } from './util/id.js';
import type { MiUser } from './User.js';
import type { MiNote } from './Note.js';

// 帖子删除归档：仅当「管理/审核删除」（deleter !== 作者）且为本地帖时写入。
// 用于管理员事后查看/恢复被删内容。用户自删不归档。
@Entity('note_archive')
export class MiNoteArchive {
	@PrimaryGeneratedColumn()
	public id: string;

	// 原帖 id（删除前的）
	@Index()
	@Column(id())
	public noteId: MiNote['id'];

	// 作者
	@Index()
	@Column(id())
	public userId: MiUser['id'];

	@Column('varchar', { length: 128, nullable: true })
	public username: string | null;

	@Column('varchar', { length: 128, nullable: true })
	public userHost: string | null;

	@Column('text', { nullable: true })
	public text: string | null;

	@Column('text', { nullable: true })
	public cw: string | null;

	@Column('varchar', { length: 64 })
	public visibility: string;

	@Column({
		...id(),
		array: true, default: '{}',
	})
	public fileIds: string[];

	// 附件快照（name/type/url），删帖不删 drive 文件，故一般仍可引用
	@Column('jsonb', { nullable: true })
	public files: any; // eslint-disable-line @typescript-eslint/no-explicit-any

	@Column({ ...id(), nullable: true })
	public replyId: string | null;

	@Column({ ...id(), nullable: true })
	public renoteId: string | null;

	@Column({ ...id(), nullable: true })
	public channelId: string | null;

	@Column('varchar', { length: 128, array: true, default: '{}' })
	public tags: string[];

	// 发帖者 IP / 浏览器指纹（仅本地帖记录，便于关联排查）
	@Column('varchar', { length: 128, nullable: true })
	public ip: string | null;

	@Column('varchar', { length: 64, nullable: true })
	public fingerprint: string | null;

	// 原帖发布时间（由 id 解析得到）
	@Column('timestamp with time zone')
	public noteCreatedAt: Date;

	@Index()
	@Column('timestamp with time zone')
	public deletedAt: Date;

	// 执行删除的管理员/审核员
	@Index()
	@Column(id())
	public deletedById: MiUser['id'];

	@Column('varchar', { length: 128, nullable: true })
	public deletedByUsername: string | null;

	@Column('varchar', { length: 1024, nullable: true })
	public reason: string | null;

	// 完整快照（恢复用）
	@Column('jsonb', { nullable: true })
	public raw: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}
