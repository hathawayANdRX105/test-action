/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import settingsIndexSource from '@/pages/settings/index.vue?raw';
import developerCenterSource from '@/pages/settings/connect.vue?raw';
import adminIndexSource from '@/pages/admin/index.vue?raw';
import adminApiSource from '@/pages/admin/api.vue?raw';
import routerSource from '@/router.definition.ts?raw';
import backendConstSource from '../../backend/src/const.ts?raw';
import endpointListSource from '../../backend/src/server/api/endpoint-list.ts?raw';
import apiCallServiceSource from '../../backend/src/server/api/ApiCallService.ts?raw';
import apiAccessUtilsSource from '../../backend/src/server/api/api-access-utils.ts?raw';
import legacyAppCreateSource from '../../backend/src/server/api/endpoints/app/create.ts?raw';
import authSessionGenerateSource from '../../backend/src/server/api/endpoints/auth/session/generate.ts?raw';
import authAcceptSource from '../../backend/src/server/api/endpoints/auth/accept.ts?raw';
import authUserkeySource from '../../backend/src/server/api/endpoints/auth/session/userkey.ts?raw';
import oauthServiceSource from '../../backend/src/server/oauth/OAuth2ProviderService.ts?raw';
import wellKnownSource from '../../backend/src/server/WellKnownServerService.ts?raw';

describe('API developer center', () => {
	test('exposes clear user and admin entry points', () => {
		assert.include(settingsIndexSource, '开发者中心');
		assert.include(settingsIndexSource, "to: '/settings/connect'");
		assert.include(settingsIndexSource, "icon: 'ti ti-api'");

		assert.include(adminIndexSource, 'API 管理');
		assert.include(adminIndexSource, "to: '/admin/api'");
		assert.include(routerSource, "path: '/api'");
		assert.include(routerSource, "import('@/pages/admin/api.vue')");
	});

	test('documents API modes, templates, token actions, and OAuth examples', () => {
		assert.include(developerCenterSource, 'API 使用状态');
		assert.include(developerCenterSource, '快捷登录');
		assert.include(developerCenterSource, '发布资源/发帖');
		assert.include(developerCenterSource, '发帖 + 上传附件');
		assert.include(developerCenterSource, '机器人/自动同步');
		assert.include(developerCenterSource, 'POST /api/notes/create');
		assert.include(developerCenterSource, 'POST /api/notes/delete');
		assert.include(developerCenterSource, 'GET /oauth/authorize');
		assert.include(developerCenterSource, '/oauth/userinfo');
		assert.include(developerCenterSource, "misskeyApi<ApiAccessStatus>('api/access/status'");
		assert.include(developerCenterSource, "misskeyApi<ApiApp>('api/apps/create'");
		assert.include(developerCenterSource, "misskeyApi<{ id: string; token: string }>('api/tokens/create'");
		assert.include(developerCenterSource, "misskeyApi('api/tokens/revoke'");
	});

	test('admin page manages settings, approvals, apps, tokens, and usage', () => {
		assert.include(adminApiSource, 'API 开放设置');
		assert.include(adminApiSource, '<option value="approval">申请使用</option>');
		assert.include(adminApiSource, '<option value="open">开放使用</option>');
		assert.include(adminApiSource, '<option value="closed">关闭使用</option>');
		assert.include(adminApiSource, '允许普通开发者使用的权限范围');
		assert.include(adminApiSource, "misskeyApi<ApiSettings>('admin/api/settings/show'");
		assert.include(adminApiSource, "misskeyApi<ApiSettings>('admin/api/settings/update'");
		assert.include(adminApiSource, "misskeyApi<ApiSummary>('admin/api/usage/summary'");
		assert.include(adminApiSource, "misskeyApi<ApiAccessRequest[]>('admin/api/access-requests/list'");
		assert.include(adminApiSource, "misskeyApi<ApiApp[]>('admin/api/apps/list'");
		assert.include(adminApiSource, "misskeyApi<ApiToken[]>('admin/api/tokens/list'");
		assert.include(adminApiSource, "admin/api/apps/${action}");
		assert.include(adminApiSource, "admin/api/access-requests/${action}");
	});

	test('backend exposes managed API endpoints and enforces API access policy', () => {
		assert.include(backendConstSource, 'read:admin:api');
		assert.include(backendConstSource, 'write:admin:api');
		assert.include(backendConstSource, "apiAccessModes = ['approval', 'open', 'closed']");
		assert.include(endpointListSource, "'api/access/status'");
		assert.include(endpointListSource, "'api/apps/create'");
		assert.include(endpointListSource, "'api/tokens/create'");
		assert.include(endpointListSource, "'admin/api/settings/update'");
		assert.include(endpointListSource, "'admin/api/access-requests/approve'");
		assert.include(endpointListSource, "'admin/api/apps/suspend'");
		assert.include(endpointListSource, "'admin/api/tokens/revoke'");
		assert.include(apiCallServiceSource, 'assertDeveloperApiAccess');
		assert.include(apiCallServiceSource, "this.meta.apiAccessMode === 'closed'");
		assert.include(apiCallServiceSource, "this.meta.apiAccessMode === 'approval'");
		assert.include(apiCallServiceSource, 'token.app ? token.app.userId : token.userId');
		assert.include(apiCallServiceSource, 'API_TOKEN_RATE_LIMIT_EXCEEDED');
		assert.include(apiAccessUtilsSource, 'const values = input ?? defaultApiPublicPermissions');
		assert.include(legacyAppCreateSource, "this.instanceMeta.apiAccessMode === 'closed'");
		assert.include(authSessionGenerateSource, "this.instanceMeta.apiAccessMode === 'closed'");
		assert.include(authSessionGenerateSource, "app.status !== 'approved'");
		assert.include(authAcceptSource, "this.instanceMeta.apiAccessMode === 'closed'");
		assert.include(authAcceptSource, "app.status !== 'approved'");
		assert.include(authUserkeySource, "this.instanceMeta.apiAccessMode === 'closed'");
		assert.include(authUserkeySource, "app.status !== 'approved'");
		assert.include(oauthServiceSource, 'userinfo_endpoint');
		assert.include(oauthServiceSource, "fastify.get('/userinfo'");
		assert.include(oauthServiceSource, "fastify.get('/jwks'");
		assert.include(wellKnownSource, "/.well-known/openid-configuration");
	});
});
