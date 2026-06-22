/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 房间 → shard 路由:把 chatRoom 的 fanout 拆到 N 个 worker。
 *
 * 配置:env `SHARKEY_CHAT_SHARDS`(默认 1,等价于关闭分片);worker 自己从 env 拿
 * `SHARKEY_SHARD_ID`(默认 0)。生产推荐 SHARKEY_CHAT_SHARDS=N、cluster 起 ≥ N 个 worker,
 * systemd 给每个 worker 注入不同的 SHARKEY_SHARD_ID(0..N-1)。
 *
 * 当 SHARKEY_CHAT_SHARDS=1 时(默认),所有房间 shard 都是 0,所有 worker 的 shardId 也是 0,
 * 行为与旧版完全一致 —— 不开就跟没改一样。
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import type { MiChatRoom } from '@/models/_.js';

const TOTAL_SHARDS = Math.max(1, Math.floor(Number(process.env.SHARKEY_CHAT_SHARDS ?? '1')) || 1);
const MY_SHARD = ((Math.floor(Number(process.env.SHARKEY_SHARD_ID ?? '0')) || 0) % TOTAL_SHARDS + TOTAL_SHARDS) % TOTAL_SHARDS;

// 32-bit FNV-1a,够均匀且非常便宜。chat room id 是 ULID,固定 26 字符
function fnv1a(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = (h * 16777619) | 0;
	}
	return h >>> 0;
}

@Injectable()
export class ChatRoomShardRouter {
	public readonly totalShards = TOTAL_SHARDS;
	public readonly myShardId = MY_SHARD;

	@bindThis
	public shardOf(roomId: MiChatRoom['id']): number {
		if (TOTAL_SHARDS === 1) return 0;
		return fnv1a(roomId) % TOTAL_SHARDS;
	}

	@bindThis
	public channelFor(roomId: MiChatRoom['id']): string {
		// shard=0 时不加前缀,跟旧的 `chatRoomStream:${roomId}` 完全兼容(无缝升级)
		if (TOTAL_SHARDS === 1) return `chatRoomStream:${roomId}`;
		return `chatRoomStream:s${this.shardOf(roomId)}:${roomId}`;
	}

	@bindThis
	public isOwnedByMe(roomId: MiChatRoom['id']): boolean {
		return this.shardOf(roomId) === this.myShardId;
	}
}
