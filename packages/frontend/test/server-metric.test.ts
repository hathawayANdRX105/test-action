/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { render } from '@testing-library/vue';
import { describe, expect, test } from 'vitest';
import { EventEmitter } from 'eventemitter3';
import XCpuMem from '@/widgets/server-metric/cpu-mem.vue';
import XNet from '@/widgets/server-metric/net.vue';
import XPie from '@/widgets/server-metric/pie.vue';
import XMem from '@/widgets/server-metric/mem.vue';
import XDisk from '@/widgets/server-metric/disk.vue';
import type * as Misskey from 'misskey-js';

class MockConnection extends EventEmitter {
	public sent: unknown[] = [];

	public send(type: string, body?: unknown) {
		this.sent.push({ type, body });
	}
}

function assertNoInvalidSvgNumbers(container: HTMLElement) {
	expect(container.innerHTML).not.toContain('Infinity');
	expect(container.innerHTML).not.toContain('NaN');
}

describe('server metric widgets', () => {
	test('does not render invalid svg coordinates from missing or zero memory totals', async () => {
		const connection = new MockConnection();
		const { container } = render(XCpuMem, {
			props: {
				connection: connection as unknown as Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
				meta: {
					mem: { total: 0 },
				},
			},
		});

		connection.emit('statsLog', [
			{
				cpu: Number.POSITIVE_INFINITY,
				mem: { active: 512 },
			},
			{
				cpu: -1,
				mem: { active: Number.POSITIVE_INFINITY },
			},
		]);

		await Promise.resolve();

		assertNoInvalidSvgNumbers(container);
		expect(container.textContent).toContain('CPU 0%');
		expect(container.textContent).toContain('MEM 0%');
	});

	test('does not render invalid network chart points from bad stream values', async () => {
		const connection = new MockConnection();
		const { container } = render(XNet, {
			props: {
				connection: connection as unknown as Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
				meta: {},
			},
		});

		connection.emit('statsLog', [
			{
				net: { rx: Number.POSITIVE_INFINITY, tx: Number.NaN },
			},
			{
				net: { rx: -1, tx: 2048 },
			},
		]);

		await Promise.resolve();

		assertNoInvalidSvgNumbers(container);
	});

	test('pie based metric widgets clamp invalid ratios', async () => {
		const { container: pieContainer } = render(XPie, {
			props: {
				value: Number.POSITIVE_INFINITY,
			},
		});
		assertNoInvalidSvgNumbers(pieContainer);
		expect(pieContainer.textContent).toBe('0%');

		const memConnection = new MockConnection();
		const { container: memContainer } = render(XMem, {
			props: {
				connection: memConnection as unknown as Misskey.IChannelConnection<Misskey.Channels['serverStats']>,
				meta: {
					mem: { total: 0 },
				},
			},
		});
		memConnection.emit('stats', {
			mem: { active: Number.POSITIVE_INFINITY },
		});
		await Promise.resolve();
		assertNoInvalidSvgNumbers(memContainer);

		const { container: diskContainer } = render(XDisk, {
			props: {
				meta: {
					fs: { total: 0, used: Number.POSITIVE_INFINITY },
				},
			},
		});
		assertNoInvalidSvgNumbers(diskContainer);
	});
});
