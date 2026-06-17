/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MetasRepository, MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { RoleService } from '@/core/RoleService.js';
import { TimeService } from '@/global/TimeService.js';
import { bindThis } from '@/decorators.js';

// 帖子相关的紧急控制（全部隐藏 / 冻结发帖）。
// meta 热更新在本实例失效，紧急开关需即时生效 → 5s TTL 直读 DB 取新鲜 meta（同 ChatService 做法）。
@Injectable()
export class NoteControlService {
	private controlMetaCache: { at: number; meta: MiMeta } | null = null;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.metasRepository)
		private metasRepository: MetasRepository,

		private roleService: RoleService,
		private readonly timeService: TimeService,
	) {}

	@bindThis
	public async getControlMeta(): Promise<MiMeta> {
		const now = this.timeService.now;
		if (this.controlMetaCache != null && (now - this.controlMetaCache.at) < 5000) {
			return this.controlMetaCache.meta;
		}
		const fresh = await this.metasRepository.findOneByOrFail({ id: this.meta.id }).catch(() => this.meta);
		this.controlMetaCache = { at: now, meta: fresh };
		return fresh;
	}

	// 帖子紧急隐藏：开启且当前用户非管理员/审核员 → 应隐藏（匿名亦隐藏）。
	@bindThis
	public async isHiddenFor(user: { id: MiUser['id'] } | null): Promise<boolean> {
		const meta = await this.getControlMeta();
		if (!meta.notesHideEmergencyMode) return false;
		return !(await this.roleService.isModerator(user));
	}

	// 冻结发帖：开启且当前用户非管理员/审核员 → 禁止发帖/回复/转发。
	@bindThis
	public async isPostingFrozenFor(user: { id: MiUser['id'] } | null): Promise<boolean> {
		const meta = await this.getControlMeta();
		if (!meta.notesPostingFrozen) return false;
		return !(await this.roleService.isModerator(user));
	}
}
