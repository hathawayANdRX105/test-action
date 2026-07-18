/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiDriveFile } from './DriveFile.js';

export const chatRoomJoinModes = ['inviteOnly', 'open', 'closed'] as const;

export type ChatRoomJoinMode = typeof chatRoomJoinModes[number];

@Entity('chat_room')
export class MiChatRoom {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 256,
	})
	public name: string;

	@Index()
	@Column({
		...id(),
	})
	public ownerId: MiUser['id'];

	@ManyToOne(type => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public owner: MiUser | null;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public description: string;

	@Index()
	@Column({
		...id(),
		nullable: true,
	})
	public avatarId: MiDriveFile['id'] | null;

	@ManyToOne(type => MiDriveFile, {
		onDelete: 'SET NULL',
	})
	@JoinColumn()
	public avatar: MiDriveFile | null;

	// avatarId が null でない場合のみ有効
	@Column('varchar', {
		length: 512, nullable: true,
	})
	public avatarUrl: string | null;

	@Column('boolean', {
		default: false,
	})
	public isSilenced: boolean;

	@Column('varchar', {
		length: 2048, default: '',
	})
	public announcement: string;

	@Column('boolean', {
		default: false,
	})
	public announcementPinned: boolean;

	/**
	 * Previous room announcements, newest first.
	 * Each entry: { id, text, createdAt, pinned }
	 */
	@Column('jsonb', {
		default: [],
	})
	public announcementHistory: {
		id: string;
		text: string;
		createdAt: string;
		pinned: boolean;
	}[];

	@Column('boolean', {
		default: false,
	})
	public isArchived: boolean;

	@Column('varchar', {
		length: 32, default: 'inviteOnly',
	})
	public joinMode: ChatRoomJoinMode;

	@Column('integer', {
		nullable: true,
	})
	public memberLimitOverride: number | null;

	@Column('integer', {
		nullable: true,
	})
	public messageRetentionDays: number | null;

	// 慢速模式：同一成员两条消息之间的最小间隔（秒）。0 = 关闭。
	@Column('integer', {
		default: 0,
	})
	public slowModeSeconds: number;

	// 关键字拦截：命中其一即拦截该消息（不入库）并按 keywordMuteSeconds 禁言发送者。
	@Column('varchar', {
		array: true, length: 256, default: '{}',
	})
	public bannedKeywords: string[];

	// 命中关键字后的禁言时长（秒）。0 = 仅拦截不禁言；<0 = 永久禁言；>0 = 禁言该秒数。
	@Column('integer', {
		default: 0,
	})
	public keywordMuteSeconds: number;
}
