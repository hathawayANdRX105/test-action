/*
 * SPDX-FileCopyrightText: lpHex
 * SPDX-License-Identifier: AGPL-3.0-only
 *
 * 轻量 Prometheus text-format 指标端点。不引入 prom-client,免得拖动 deps;
 * 拿 process.* + perf_hooks 自带就能算出十个主要指标。
 *
 * 端点:GET /metrics
 *   - sharkey_event_loop_lag_p50_ms / p99_ms / max_ms(每分钟滑窗)
 *   - sharkey_ws_connections{worker}
 *   - sharkey_http_requests_total{endpoint,status}
 *   - sharkey_http_request_duration_seconds_bucket{endpoint,le}
 *   - sharkey_chat_room_fanout_total{shard}
 *   - sharkey_chat_room_fanout_duration_ms{shard,quantile}
 *   - sharkey_memory_rss_bytes / sharkey_memory_heap_used_bytes
 *   - sharkey_uptime_seconds
 *   - sharkey_worker_id
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { monitorEventLoopDelay, type IntervalHistogram } from 'node:perf_hooks';
import cluster from 'node:cluster';
import { bindThis } from '@/decorators.js';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

interface BucketCounter {
	count: number;
	sum: number;
	buckets: Map<number, number>;
}

// HTTP 直方图的桶(秒):快 → 慢
const HTTP_BUCKETS_S = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

@Injectable()
export class MetricsServerService implements OnApplicationShutdown {
	private readonly eventLoopHistogram: IntervalHistogram;
	private readonly httpCounters = new Map<string, BucketCounter>();
	private wsConnections = 0;
	private readonly chatFanoutCount = new Map<string, number>();
	private readonly chatFanoutDurations = new Map<string, number[]>();
	private readonly startedAt: number;
	private readonly workerId: string;

	constructor(
		@Inject(DI.config)
		private readonly config: Config,
	) {
		this.eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
		this.eventLoopHistogram.enable();
		// Date.now() at construct time;后端的"起步时间戳"
		this.startedAt = Math.floor(performance.timeOrigin);
		this.workerId = process.env.SHARKEY_WORKER_ID ?? (cluster.worker?.id?.toString() ?? '0');
	}

	@bindThis
	public observeHttp(endpoint: string, statusCode: number, durationSec: number): void {
		const key = `${endpoint}|${statusCode}`;
		let counter = this.httpCounters.get(key);
		if (counter == null) {
			counter = { count: 0, sum: 0, buckets: new Map(HTTP_BUCKETS_S.map(b => [b, 0])) };
			this.httpCounters.set(key, counter);
		}
		counter.count++;
		counter.sum += durationSec;
		for (const b of HTTP_BUCKETS_S) {
			if (durationSec <= b) counter.buckets.set(b, (counter.buckets.get(b) ?? 0) + 1);
		}
	}

	@bindThis
	public incrWsConnections(delta: number): void {
		this.wsConnections += delta;
	}

	@bindThis
	public observeChatFanout(shard: string, durationMs: number): void {
		this.chatFanoutCount.set(shard, (this.chatFanoutCount.get(shard) ?? 0) + 1);
		let arr = this.chatFanoutDurations.get(shard);
		if (arr == null) {
			arr = [];
			this.chatFanoutDurations.set(shard, arr);
		}
		arr.push(durationMs);
		// 保留最近 1000 个样本计算分位;再多会让 GC 烦
		if (arr.length > 1000) arr.splice(0, arr.length - 1000);
	}

	private percentile(values: number[], p: number): number {
		if (values.length === 0) return 0;
		const sorted = [...values].sort((a, b) => a - b);
		const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
		return sorted[idx];
	}

	@bindThis
	private formatPrometheus(): string {
		const lines: string[] = [];
		const mem = process.memoryUsage();
		const uptimeSec = (Date.now() - this.startedAt) / 1000;

		// Event loop lag
		const elr = this.eventLoopHistogram;
		const p50 = elr.percentile(50) / 1e6; // ns → ms
		const p99 = elr.percentile(99) / 1e6;
		const max = elr.max / 1e6;
		lines.push('# HELP sharkey_event_loop_lag_p50_ms Event loop lag p50 (ms)');
		lines.push('# TYPE sharkey_event_loop_lag_p50_ms gauge');
		lines.push(`sharkey_event_loop_lag_p50_ms{worker="${this.workerId}"} ${p50.toFixed(3)}`);
		lines.push('# HELP sharkey_event_loop_lag_p99_ms Event loop lag p99 (ms)');
		lines.push('# TYPE sharkey_event_loop_lag_p99_ms gauge');
		lines.push(`sharkey_event_loop_lag_p99_ms{worker="${this.workerId}"} ${p99.toFixed(3)}`);
		lines.push('# HELP sharkey_event_loop_lag_max_ms Event loop lag max (ms)');
		lines.push('# TYPE sharkey_event_loop_lag_max_ms gauge');
		lines.push(`sharkey_event_loop_lag_max_ms{worker="${this.workerId}"} ${max.toFixed(3)}`);

		// WS conns
		lines.push('# HELP sharkey_ws_connections Active websocket connections on this worker');
		lines.push('# TYPE sharkey_ws_connections gauge');
		lines.push(`sharkey_ws_connections{worker="${this.workerId}"} ${this.wsConnections}`);

		// Memory
		lines.push('# HELP sharkey_memory_rss_bytes Resident set size');
		lines.push('# TYPE sharkey_memory_rss_bytes gauge');
		lines.push(`sharkey_memory_rss_bytes{worker="${this.workerId}"} ${mem.rss}`);
		lines.push('# HELP sharkey_memory_heap_used_bytes V8 heap used');
		lines.push('# TYPE sharkey_memory_heap_used_bytes gauge');
		lines.push(`sharkey_memory_heap_used_bytes{worker="${this.workerId}"} ${mem.heapUsed}`);

		// Uptime
		lines.push('# HELP sharkey_uptime_seconds Time since worker boot (sec)');
		lines.push('# TYPE sharkey_uptime_seconds gauge');
		lines.push(`sharkey_uptime_seconds{worker="${this.workerId}"} ${uptimeSec.toFixed(1)}`);

		// HTTP request counters + histograms
		lines.push('# HELP sharkey_http_requests_total HTTP requests count');
		lines.push('# TYPE sharkey_http_requests_total counter');
		lines.push('# HELP sharkey_http_request_duration_seconds HTTP request duration histogram');
		lines.push('# TYPE sharkey_http_request_duration_seconds histogram');
		for (const [key, counter] of this.httpCounters) {
			const [endpoint, status] = key.split('|');
			const lbl = `endpoint="${this.escape(endpoint)}",status="${status}",worker="${this.workerId}"`;
			lines.push(`sharkey_http_requests_total{${lbl}} ${counter.count}`);
			for (const b of HTTP_BUCKETS_S) {
				lines.push(`sharkey_http_request_duration_seconds_bucket{${lbl},le="${b}"} ${counter.buckets.get(b) ?? 0}`);
			}
			lines.push(`sharkey_http_request_duration_seconds_bucket{${lbl},le="+Inf"} ${counter.count}`);
			lines.push(`sharkey_http_request_duration_seconds_sum{${lbl}} ${counter.sum.toFixed(6)}`);
			lines.push(`sharkey_http_request_duration_seconds_count{${lbl}} ${counter.count}`);
		}

		// Chat fanout
		lines.push('# HELP sharkey_chat_room_fanout_total Chat room fanout count');
		lines.push('# TYPE sharkey_chat_room_fanout_total counter');
		for (const [shard, n] of this.chatFanoutCount) {
			lines.push(`sharkey_chat_room_fanout_total{shard="${shard}",worker="${this.workerId}"} ${n}`);
		}
		lines.push('# HELP sharkey_chat_room_fanout_duration_ms Chat fanout duration quantiles');
		lines.push('# TYPE sharkey_chat_room_fanout_duration_ms summary');
		for (const [shard, durs] of this.chatFanoutDurations) {
			const lbl = `shard="${shard}",worker="${this.workerId}"`;
			lines.push(`sharkey_chat_room_fanout_duration_ms{${lbl},quantile="0.5"} ${this.percentile(durs, 0.5).toFixed(2)}`);
			lines.push(`sharkey_chat_room_fanout_duration_ms{${lbl},quantile="0.9"} ${this.percentile(durs, 0.9).toFixed(2)}`);
			lines.push(`sharkey_chat_room_fanout_duration_ms{${lbl},quantile="0.99"} ${this.percentile(durs, 0.99).toFixed(2)}`);
		}

		// Worker id
		lines.push('# HELP sharkey_worker_id Logical worker id');
		lines.push('# TYPE sharkey_worker_id gauge');
		lines.push(`sharkey_worker_id{id="${this.workerId}"} 1`);

		return lines.join('\n') + '\n';
	}

	private escape(s: string): string {
		return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.get('/', async (request, reply) => {
			// 只允许从 localhost / private network 拉(prod 用 Cloudflare 前置,公网不该看到)
			const remote = request.ip;
			if (!this.isPrivateAddress(remote)) {
				return reply.code(403).send();
			}
			reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
			reply.header('Cache-Control', 'no-store');
			return reply.send(this.formatPrometheus());
		});
		done();
	}

	private isPrivateAddress(ip: string): boolean {
		// IPv4 private + loopback + IPv6 loopback / ULA
		return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
			|| /^10\./.test(ip)
			|| /^192\.168\./.test(ip)
			|| /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
			|| /^::ffff:(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip)
			|| /^fc/.test(ip) || /^fd/.test(ip);
	}

	public onApplicationShutdown(): void {
		this.eventLoopHistogram.disable();
	}
}
