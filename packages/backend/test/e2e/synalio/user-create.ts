/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import type { entities } from 'misskey-js';
import { beforeEach, describe, test } from '@jest/globals';
import {
	api,
	captureWebhook,
	ensureRoot,
	randomString,
	role,
	signup,
	startJobQueue,
	UserToken,
	WEBHOOK_HOST,
} from '../../utils.js';
import type { INestApplicationContext } from '@nestjs/common';

describe('[シナリオ] ユーザ作成', () => {
	let queue: INestApplicationContext;
	let admin: entities.SignupResponse;

	async function createSystemWebhook(args?: Partial<entities.AdminSystemWebhookCreateRequest>, credential?: UserToken): Promise<entities.AdminSystemWebhookCreateResponse> {
		const res = await api(
			'admin/system-webhook/create',
			{
				isActive: true,
				name: randomString(),
				on: ['userCreated'],
				url: WEBHOOK_HOST,
				secret: randomString(),
				...args,
			},
			credential ?? admin,
		);
		return res.body;
	}

	// -------------------------------------------------------------------------------------------

	beforeAll(async () => {
		queue = await startJobQueue();
		// root is the only pre-assigned administrator (role() only creates a Role entity)
		admin = await ensureRoot();
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await queue.close();
	});

	// -------------------------------------------------------------------------------------------

	describe('SystemWebhook', () => {
		beforeEach(async () => {
			const webhooks = await api('admin/system-webhook/list', {}, admin);
			for (const webhook of webhooks.body) {
				await api('admin/system-webhook/delete', { id: webhook.id }, admin);
			}
		});

		test('ユーザが作成された -> userCreatedが送出される', async () => {
			const webhook = await createSystemWebhook({
				on: ['userCreated'],
				isActive: true,
			});

			let alice: any = null;
			const webhookBody = await captureWebhook(async () => {
				alice = await signup({ username: 'alice' });
			});

			// webhookの送出後にいろいろやってるのでちょっと待つ必要がある
			await setTimeout(2000);

			console.log(alice);
			console.log(JSON.stringify(webhookBody, null, 2));

			expect(webhookBody.hookId).toBe(webhook.id);
			expect(webhookBody.type).toBe('userCreated');

			const body = webhookBody.body as entities.UserLite;
			expect(alice.id).toBe(body.id);
			expect(alice.name).toBe(body.name);
			expect(alice.username).toBe(body.username);
			expect(alice.host).toBe(body.host);
			expect(alice.avatarUrl).toBe(body.avatarUrl);
			expect(alice.avatarBlurhash).toBe(body.avatarBlurhash);
			expect(alice.avatarDecorations).toEqual(body.avatarDecorations);
			expect(alice.isBot).toBe(body.isBot);
			expect(alice.isCat).toBe(body.isCat);
			expect(alice.instance).toEqual(body.instance);
			expect(alice.emojis).toEqual(body.emojis);
			expect(alice.onlineStatus).toBe(body.onlineStatus);
			expect(alice.badgeRoles).toEqual(body.badgeRoles);
		});

		test('ユーザ作成 -> userCreatedが未許可の場合は送出されない', async () => {
			// unique inactive/empty on so prior userCreated hooks cannot leak
			await createSystemWebhook({
				on: [],
				isActive: true,
			});

			// also remove any active userCreated hooks that may have been left from prior suites
			const webhooks = await api('admin/system-webhook/list', {}, admin);
			for (const webhook of webhooks.body) {
				if (webhook.on?.includes('userCreated') && webhook.isActive) {
					await api('admin/system-webhook/delete', { id: webhook.id }, admin);
				}
			}

			let alice: any = null;
			const webhookBody = await captureWebhook(async () => {
				alice = await signup({ username: 'alice' + randomString().slice(0, 6) });
			}).catch(e => e.message);

			expect(webhookBody).toBe('timeout');
			expect(alice.id).not.toBeNull();
		});

		test('ユーザ作成 -> Webhookが無効の場合は送出されない', async () => {
			await createSystemWebhook({
				on: ['userCreated'],
				isActive: false,
			});

			const webhooks = await api('admin/system-webhook/list', {}, admin);
			for (const webhook of webhooks.body) {
				if (webhook.on?.includes('userCreated') && webhook.isActive) {
					await api('admin/system-webhook/delete', { id: webhook.id }, admin);
				}
			}

			let alice: any = null;
			const webhookBody = await captureWebhook(async () => {
				alice = await signup({ username: 'alice' + randomString().slice(0, 6) });
			}).catch(e => e.message);

			expect(webhookBody).toBe('timeout');
			expect(alice.id).not.toBeNull();
		});
	});
});
