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

	// 联邦/关键词紧急过滤:针对一批待打包的帖子,返回应屏蔽的 noteId 集合(仅对非管理员/版主生效)。
	// 三类条件,任一命中即应屏蔽:
	//   ① notesHideRemoteEmergency:屏蔽所有 userHost 非空(远程)的帖子;
	//   ② notesRemoteKeywordBlocklist:远程帖 text/cw 命中任一关键词(小写子串);
	//   ③ notesLocalKeywordBlocklist:本地帖 text/cw 命中任一关键词。
	// 仅在有非空开关/关键词时才调 isModerator,避免空查询时的开销。
	@bindThis
	public async filterHiddenNoteIds(
		notes: { id: string; userHost: string | null; text: string | null; cw: string | null }[],
		me: { id: MiUser['id'] } | null,
	): Promise<Set<string>> {
		if (notes.length === 0) return new Set();

		const meta = await this.getControlMeta();
		const hideRemote = meta.notesHideRemoteEmergency === true;
		const remoteKw = (meta.notesRemoteKeywordBlocklist ?? []).map(k => k.toLowerCase()).filter(k => k.length > 0);
		const localKw = (meta.notesLocalKeywordBlocklist ?? []).map(k => k.toLowerCase()).filter(k => k.length > 0);

		if (!hideRemote && remoteKw.length === 0 && localKw.length === 0) return new Set();

		// 管理员/版主豁免:与现有紧急隐藏/冻结发帖的语义一致。
		const exempt = await this.roleService.isModerator(me);
		if (exempt) return new Set();

		const hidden = new Set<string>();
		for (const n of notes) {
			const isRemote = n.userHost != null;
			if (isRemote && hideRemote) { hidden.add(n.id); continue; }
			const haystack = ((n.text ?? '') + ' ' + (n.cw ?? '')).toLowerCase();
			if (haystack.length === 0) continue;
			const kws = isRemote ? remoteKw : localKw;
			if (kws.length === 0) continue;
			for (const kw of kws) {
				if (haystack.includes(kw)) { hidden.add(n.id); break; }
			}
		}
		return hidden;
	}
}
