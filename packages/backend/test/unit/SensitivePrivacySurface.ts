/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { readFileSync } from 'node:fs';
import { describe, expect, jest, test } from '@jest/globals';
import { meta as onlineUsersMeta } from '@/server/api/endpoints/get-online-users-count.js';
import { meta as activeUsersMeta } from '@/server/api/endpoints/charts/active-users.js';
import { meta as resetDbMeta } from '@/server/api/endpoints/reset-db.js';
import EmailAddressAvailableEndpoint from '@/server/api/endpoints/email-address/available.js';

describe('sensitive privacy surfaces', () => {
	test('online aggregate endpoints require moderator credentials', () => {
		expect(onlineUsersMeta.requireCredential).toBe(true);
		expect(onlineUsersMeta.requireModerator).toBe(true);
		expect(onlineUsersMeta.kind).toBe('read:admin:show-user');

		expect(activeUsersMeta.requireCredential).toBe(true);
		expect(activeUsersMeta.requireModerator).toBe(true);
		expect(activeUsersMeta.kind).toBe('read:admin:show-user');
	});

	test('reset-db is admin-only and still hidden outside test runtime', () => {
		expect(resetDbMeta.requireCredential).toBe(true);
		expect(resetDbMeta.requireAdmin).toBe(true);
		expect(resetDbMeta.kind).toBe('write:admin:meta');
		expect(resetDbMeta.errors.unavailable.httpStatusCode).toBe(404);
	});

	test('anonymous email availability checks do not reveal registered addresses', async () => {
		const emailService = {
			validateEmailForAccount: jest.fn(async () => ({ available: false, reason: 'used' as const })),
		};
		const endpoint = new EmailAddressAvailableEndpoint(emailService as never);

		await expect(endpoint.exec({ emailAddress: 'taken@example.com' }, null, null)).resolves.toEqual({
			available: true,
			reason: null,
		});

		await expect(endpoint.exec({ emailAddress: 'taken@example.com' }, { id: 'user' } as never, null)).resolves.toEqual({
			available: false,
			reason: 'used',
		});
	});

	test('public user packing masks exact online status from non-staff viewers', () => {
		const source = readFileSync(new URL('../../src/core/entities/UserEntityService.ts', import.meta.url), 'utf8');

		expect(source).toContain('const canViewOnlineStatus = isMe || iAmModerator;');
		expect(source).toContain("onlineStatus: canViewOnlineStatus ? this.getOnlineStatus(user) : 'unknown'");
	});

	test('public frontend surfaces no longer request online analytics for normal visitors', () => {
		const instanceStats = readFileSync(new URL('../../../frontend/src/components/MkInstanceStats.vue', import.meta.url), 'utf8');
		const onlineWidget = readFileSync(new URL('../../../frontend/src/widgets/WidgetOnlineUsers.vue', import.meta.url), 'utf8');
		const visitorDashboard = readFileSync(new URL('../../../frontend/src/components/MkVisitorDashboard.vue', import.meta.url), 'utf8');

		expect(instanceStats).toContain('const canViewOnlineAnalytics = computed');
		expect(instanceStats).toContain('const chartSrc = ref(canViewOnlineAnalytics.value ?');
		expect(instanceStats).toMatch(/<option v-if="canViewOnlineAnalytics" value="active-users">/);
		expect(onlineWidget).toContain('if (!canViewOnlineUsers) return;');
		expect(visitorDashboard).toContain('v-if="canViewOnlineAnalytics"');
	});
});
