/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { MiRegistryItem, RegistryItemsRepository } from '@/models/_.js';
import { MiRegistryItem as RegistryItemEntity } from '@/models/RegistryItem.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { bindThis } from '@/decorators.js';
import { TimeService } from '@/global/TimeService.js';

// Per (userId, domain) cap for new keys only. Existing keys remain updateable at the limit.
// 1024 matches plan (no product constant elsewhere; key column is varchar(1024)).
export const MAX_REGISTRY_KEYS_PER_DOMAIN = 1024;

// Scoped advisory-lock namespace; key2 uses userId + '\0' + domain so pairs stay distinct.
const REGISTRY_KEY_BOUND_LOCK_NS = 'registry-key-bound';

@Injectable()
export class RegistryApiService {
	constructor(
		@Inject(DI.registryItemsRepository)
		private registryItemsRepository: RegistryItemsRepository,

		@Inject(DI.db)
		private readonly db: DataSource,

		private idService: IdService,
		private globalEventService: GlobalEventService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public async set(userId: MiUser['id'], domain: string | null, scope: string[], key: string, value: any) {
		const now = this.timeService.date;
		const id = this.idService.gen();

		await this.db.transaction(async tem => {
			// Serialize capacity check + upsert for this (userId, domain) partition only.
			await tem.query(
				'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
				[REGISTRY_KEY_BOUND_LOCK_NS, `${userId}\0${domain ?? ''}`],
			);

			const existing = await tem.createQueryBuilder(RegistryItemEntity, 'item')
				.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain })
				.andWhere('item.userId = :userId', { userId: userId })
				.andWhere('item.key = :key', { key: key })
				.andWhere('item.scope = :scope', { scope: scope })
				.orderBy('item.updatedAt', 'DESC')
				.addOrderBy('item.id', 'DESC')
				.getOne();

			if (existing == null) {
				const count = await tem.createQueryBuilder(RegistryItemEntity, 'item')
					.where('item.userId = :userId', { userId: userId })
					.andWhere(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain })
					.getCount();
				if (count >= MAX_REGISTRY_KEYS_PER_DOMAIN) {
					throw new IdentifiableError('4f1c8a2e-9b3d-4e7a-8c1f-2d6e9a0b5c74', 'Too many registry keys.');
				}
			}

			// NULLS NOT DISTINCT unique index makes domain-null upsert safe concurrent with same key.
			await tem.createQueryBuilder()
				.insert()
				.into(RegistryItemEntity)
				.values({
					id: id,
					updatedAt: now,
					userId: userId,
					domain: domain,
					scope: scope,
					key: key,
					value: value,
				})
				.orUpdate(
					['updatedAt', 'value'],
					['userId', 'key', 'scope', 'domain'],
					{ upsertType: 'on-conflict-do-update' },
				)
				.execute();
		});

		if (domain == null) {
			// MainChannel drops this for third-party tokens; native sessions still sync (pizzax).
			this.globalEventService.publishMainStream(userId, 'registryUpdated', {
				scope: scope,
				key: key,
				value: value,
			});
		}
	}

	@bindThis
	public async getItem(userId: MiUser['id'], domain: string | null, scope: string[], key: string): Promise<MiRegistryItem | null> {
		const query = this.registryItemsRepository.createQueryBuilder('item')
			.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain })
			.andWhere('item.userId = :userId', { userId: userId })
			.andWhere('item.key = :key', { key: key })
			.andWhere('item.scope = :scope', { scope: scope })
			.orderBy('item.updatedAt', 'DESC')
			.addOrderBy('item.id', 'DESC');

		const item = await query.getOne();

		return item;
	}

	@bindThis
	public async getAllItemsOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<MiRegistryItem[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item');
		query.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain });
		query.andWhere('item.userId = :userId', { userId: userId });
		query.andWhere('item.scope = :scope', { scope: scope });
		query.orderBy('item.updatedAt', 'ASC');
		query.addOrderBy('item.id', 'ASC');

		const items = await query.getMany();

		return items;
	}

	@bindThis
	public async getAllKeysOfScope(userId: MiUser['id'], domain: string | null, scope: string[]): Promise<string[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item');
		query.select('item.key');
		query.where(domain == null ? 'item.domain IS NULL' : 'item.domain = :domain', { domain: domain });
		query.andWhere('item.userId = :userId', { userId: userId });
		query.andWhere('item.scope = :scope', { scope: scope });

		const items = await query.getMany();

		return items.map(x => x.key);
	}

	@bindThis
	public async getAllScopeAndDomains(userId: MiUser['id']): Promise<{ domain: string | null; scopes: string[][] }[]> {
		const query = this.registryItemsRepository.createQueryBuilder('item')
			.select(['item.scope', 'item.domain'])
			.where('item.userId = :userId', { userId: userId });

		const items = await query.getMany();

		const res = [] as { domain: string | null; scopes: string[][] }[];

		for (const item of items) {
			const target = res.find(x => x.domain === item.domain);
			if (target) {
				if (target.scopes.some(scope => scope.join('.') === item.scope.join('.'))) continue;
				target.scopes.push(item.scope);
			} else {
				res.push({
					domain: item.domain,
					scopes: [item.scope],
				});
			}
		}

		return res;
	}

	@bindThis
	public async remove(userId: MiUser['id'], domain: string | null, scope: string[], key: string) {
		const query = this.registryItemsRepository.createQueryBuilder().delete();
		if (domain) {
			query.where('domain = :domain', { domain: domain });
		} else {
			query.where('domain IS NULL');
		}
		query.andWhere('userId = :userId', { userId: userId });
		query.andWhere('key = :key', { key: key });
		query.andWhere('scope = :scope', { scope: scope });

		await query.execute();
	}
}
