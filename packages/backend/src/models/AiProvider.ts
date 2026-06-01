/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Column } from 'typeorm';
import { id } from './util/id.js';

@Entity('ai_provider')
export class MiAiProvider {
	@PrimaryColumn(id())
	public id: string;

	@Column('varchar', {
		length: 128,
	})
	public name: string;

	@Column('varchar', {
		length: 1024,
	})
	public baseUrl: string;

	@Column('varchar', {
		length: 4096,
	})
	public apiKey: string;

	@Column('boolean', {
		default: true,
	})
	public isEnabled: boolean;

	@Column('varchar', {
		length: 512,
		array: true,
		default: '{}',
	})
	public models: string[];

	@Column('varchar', {
		length: 512,
		nullable: true,
	})
	public defaultModel: string | null;

	@Column('varchar', {
		length: 512,
		array: true,
		default: '{}',
	})
	public allowedModels: string[];

	@Column('integer', {
		default: 30000,
	})
	public timeoutMs: number;

	@Column('integer', {
		default: 1024,
	})
	public maxTokens: number;

	@Column('real', {
		default: 0.7,
	})
	public temperature: number;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone')
	public updatedAt: Date;
}
