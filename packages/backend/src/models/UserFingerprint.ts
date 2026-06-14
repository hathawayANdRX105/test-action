/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Entity, Index, Column, PrimaryGeneratedColumn } from 'typeorm';
import { id } from './util/id.js';
import type { MiUser } from './User.js';

@Entity('user_fingerprint')
@Index(['userId', 'fingerprint'], { unique: true })
export class MiUserFingerprint {
	@PrimaryGeneratedColumn()
	public id: string;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Index()
	@Column('timestamp with time zone')
	public lastSeenAt: Date;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	// 客户端浏览器指纹哈希（canvas/webgl/audio/screen/timezone/fonts 等综合）
	@Index()
	@Column('varchar', {
		length: 64,
	})
	public fingerprint: string;

	// 最近一次见到该指纹时的 IP
	@Column('varchar', {
		length: 128, nullable: true,
	})
	public ip: string | null;

	// 该指纹被记录的次数（用于溯源）
	@Column('integer', {
		default: 1,
	})
	public seenCount: number;

	// 指纹各分量明细（canvas/webgl/audio/screen/timezone/fonts/languages/platform/userAgent 等），可搜索
	@Column('jsonb', {
		nullable: true,
	})
	public components: Record<string, unknown> | null;
}
