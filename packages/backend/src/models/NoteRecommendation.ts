/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiNote } from './Note.js';
import { MiUser } from './User.js';

/**
 * 管理者によるおすすめ(推薦)タイムラインの上書き設定。
 * 設定のある投稿のみ行を持つ（ピン留め or スコア調整）。
 */
@Entity('note_recommendation')
export class MiNoteRecommendation {
	@PrimaryColumn(id())
	public noteId: MiNote['id'];

	@ManyToOne(type => MiNote, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public note: MiNote | null;

	// ホーム推薦の最上部に固定するか
	@Index()
	@Column('boolean', {
		default: false,
	})
	public pinned: boolean;

	@Column('timestamp with time zone', {
		nullable: true,
	})
	public pinnedAt: Date | null;

	// 管理者による手動スコア加算/減算（推薦スコアに加算される。正で上げ、負で下げる）
	@Column('real', {
		default: 0,
	})
	public scoreBoost: number;

	@Column('timestamp with time zone')
	public updatedAt: Date;

	@Column({
		...id(),
		nullable: true,
	})
	public updatedBy: MiUser['id'] | null;
}
