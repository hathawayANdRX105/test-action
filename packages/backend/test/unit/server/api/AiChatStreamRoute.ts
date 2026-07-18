/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, jest, test } from '@jest/globals';
import { AiServiceError } from '@/core/AiService.js';
import { ApiCallService } from '@/server/api/ApiCallService.js';
import { ApiServerService } from '@/server/api/ApiServerService.js';

type ChatStreamHandler = (request: Record<string, unknown>, reply: Record<string, unknown>) => Promise<unknown>;

function createReply() {
	const state: {
		payload: unknown;
		statusCode: number | undefined;
	} = {
		payload: undefined,
		statusCode: undefined,
	};
	const raw = {
		destroyed: false,
		headersSent: false,
		writableEnded: false,
		writableNeedDrain: false,
		end: jest.fn(() => {
			raw.writableEnded = true;
		}),
		off: jest.fn(),
		on: jest.fn(),
		once: jest.fn(),
		write: jest.fn(() => true),
		writeHead: jest.fn(() => {
			raw.headersSent = true;
		}),
	};
	const reply: Record<string, any> = {
		header: jest.fn(),
		raw,
	};
	reply.code = jest.fn((statusCode: number) => {
		state.statusCode = statusCode;
		return reply;
	});
	reply.send = jest.fn((payload: unknown) => {
		state.payload = payload;
		raw.headersSent = true;
		return reply;
	});

	return { reply, state };
}

type RateLimitInfo = {
	blocked: boolean;
	remaining: number;
	resetSec: number;
	resetMs: number;
	fullResetSec: number;
	fullResetMs: number;
};

const unblockedRateLimit: RateLimitInfo = {
	blocked: false,
	remaining: 9,
	resetSec: 0,
	resetMs: 0,
	fullResetSec: 0,
	fullResetMs: 0,
};

function createApiCallService(
	apiAccessMode: 'open' | 'closed',
	nodeEnv: 'test' | 'production' = 'test',
	developerRateLimit: RateLimitInfo = unblockedRateLimit,
	apiPublicPermissions = ['write:account'],
) {
	const meta = {
		id: 'meta-1',
		enableIpLogging: false,
		apiAccessMode,
		apiAllowDeveloperTokens: true,
		apiNoApprovalPermissions: ['write:account'],
		apiPublicPermissions,
		apiWriteTokenRateLimit: 60,
		apiDefaultTokenRateLimit: 60,
		rootUserId: null,
	};
	const developerTokenRateLimiter = {
		limit: jest.fn(async () => developerRateLimit),
	};
	const service = new ApiCallService(
		meta as never,
		{ findOneByOrFail: jest.fn(async () => meta) } as never,
		{ sentryForBackend: false } as never,
		{} as never,
		{} as never,
		{ findOneBy: jest.fn() } as never,
		{} as never,
		developerTokenRateLimiter as never,
		{} as never,
		{ logger: { error: jest.fn(), warn: jest.fn() } } as never,
		{ now: 0 } as never,
		{} as never,
		{ env: { NODE_ENV: nodeEnv } } as never,
		{
			createMemoryKVCache: jest.fn(() => ({
				get: jest.fn(),
				set: jest.fn(),
			})),
		} as never,
	);

	return service;
}

function createRouteContext({
	apiAccessMode = 'open',
	nodeEnv = 'test',
	tokenStatus = 'active',
	tokenInfo = true,
	developerRateLimit = unblockedRateLimit,
	apiPublicPermissions = ['write:account'],
}: {
	apiAccessMode?: 'open' | 'closed';
	nodeEnv?: 'test' | 'production';
	tokenStatus?: string;
	tokenInfo?: boolean;
	developerRateLimit?: RateLimitInfo;
	apiPublicPermissions?: string[];
} = {}) {
	const user = { id: 'user-1' } as never;
	const token = tokenInfo ? {
		id: 'token-1',
		userId: 'user-1',
		permission: ['write:account'],
		status: tokenStatus,
		app: null,
	} as never : null;
	const apiCallService = createApiCallService(apiAccessMode, nodeEnv, developerRateLimit, apiPublicPermissions);
	const guardSpy = jest.spyOn(apiCallService, 'assertDeveloperApiAccess');
	const aiService = {
		streamChat: jest.fn(async () => ({ id: 'assistant-message-1' })),
	};
	const authenticateService = {
		authenticate: jest.fn(async () => [user, token]),
	};
	const postRoutes = new Map<string, ChatStreamHandler>();
	const fastify = {
		addHook: jest.fn(),
		all: jest.fn(),
		get: jest.fn(),
		post: jest.fn((path: string, optionsOrHandler: unknown, handler?: unknown) => {
			const routeHandler = typeof optionsOrHandler === 'function' ? optionsOrHandler : handler;
			if (typeof routeHandler === 'function') {
				postRoutes.set(path, routeHandler as ChatStreamHandler);
			}
		}),
		register: jest.fn(),
	};
	const apiServerService = new ApiServerService(
		{ get: jest.fn(() => ({ exec: jest.fn() })) } as never,
		{ maxFileSize: 1024 } as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		aiService as never,
		apiCallService,
		authenticateService as never,
		{
			limit: jest.fn(async () => ({
				blocked: false,
				remaining: 9,
				resetSec: 0,
				resetMs: 0,
				fullResetSec: 0,
				fullResetMs: 0,
			})),
		} as never,
		{ assertClientUser: jest.fn(() => null) } as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{
			startTimer: jest.fn(),
			stopTimer: jest.fn(),
		} as never,
	);
	apiServerService.createServer(fastify as never, {} as never, jest.fn());
	const handler = postRoutes.get('/ai/chat-stream');
	if (handler == null) throw new Error('AI chat stream route was not registered');

	return {
		aiService,
		guardSpy,
		handler,
		token,
		user,
	};
}

describe('/ai/chat-stream', () => {
	test('rejects a suspended developer token before it starts an AI stream', async () => {
		const context = createRouteContext({ tokenStatus: 'suspended' });
		const { reply, state } = createReply();

		await context.handler({
			headers: { authorization: 'Bearer developer-token' },
			body: { content: 'hello' },
			ip: '127.0.0.1',
		}, reply);

		expect(context.guardSpy).toHaveBeenCalledWith('write:account', context.user, context.token as never, reply as never);
		expect(state.statusCode).toBe(403);
		expect(state.payload).toMatchObject({ error: { code: 'API_TOKEN_UNAVAILABLE' } });
		expect(context.aiService.streamChat).not.toHaveBeenCalled();
		expect(reply.raw.writeHead).not.toHaveBeenCalled();
	});

	test('rejects a developer token when API access is closed before it starts an AI stream', async () => {
		const context = createRouteContext({ apiAccessMode: 'closed' });
		const { reply, state } = createReply();

		await context.handler({
			headers: { authorization: 'Bearer developer-token' },
			body: { content: 'hello' },
			ip: '127.0.0.1',
		}, reply);

		expect(context.guardSpy).toHaveBeenCalledWith('write:account', context.user, context.token as never, reply as never);
		expect(state.statusCode).toBe(403);
		expect(state.payload).toMatchObject({ error: { code: 'API_ACCESS_CLOSED' } });
		expect(context.aiService.streamChat).not.toHaveBeenCalled();
		expect(reply.raw.writeHead).not.toHaveBeenCalled();
	});

	test('rejects a developer token when the public write scope is disabled before it starts an AI stream', async () => {
		const context = createRouteContext({ apiPublicPermissions: [] });
		const { reply, state } = createReply();

		await context.handler({
			headers: { authorization: 'Bearer developer-token' },
			body: { content: 'hello' },
			ip: '127.0.0.1',
		}, reply);

		expect(context.guardSpy).toHaveBeenCalledWith('write:account', context.user, context.token as never, reply as never);
		expect(state.statusCode).toBe(403);
		expect(state.payload).toMatchObject({ error: { code: 'API_SCOPE_DISABLED' } });
		expect(context.aiService.streamChat).not.toHaveBeenCalled();
		expect(reply.raw.writeHead).not.toHaveBeenCalled();
	});

	test('does not apply the developer-token guard to a native user token', async () => {
		const context = createRouteContext({ tokenInfo: false });
		const { reply } = createReply();

		await context.handler({
			body: { content: 'hello' },
			headers: {},
			ip: '127.0.0.1',
		}, reply);

		expect(context.guardSpy).not.toHaveBeenCalled();
		expect(context.aiService.streamChat).toHaveBeenCalledTimes(1);
		expect(reply.raw.writeHead).toHaveBeenCalledTimes(1);
	});
	test('passes excessive file ids through to AiService validation instead of truncating them', async () => {
		const context = createRouteContext({ tokenInfo: false });
		const { reply } = createReply();
		const fileIds = Array.from({ length: 9 }, (_, i) => `file-${i}`);
		context.aiService.streamChat.mockImplementation(async (params: any) => {
			if (params.fileIds.length > 8) {
				throw new AiServiceError('TOO_MANY_ATTACHMENTS', 'AI chat supports up to 8 image attachments.');
			}
			return { id: 'assistant-message-1' };
		});

		await context.handler({
			body: { content: 'hello', fileIds },
			headers: {},
			ip: '127.0.0.1',
		}, reply);

		expect(context.aiService.streamChat).toHaveBeenCalledWith(expect.objectContaining({ fileIds }));
		expect(reply.raw.write).toHaveBeenCalledWith(expect.stringContaining('TOO_MANY_ATTACHMENTS'));
	});

	test('returns the developer token RPM error before it starts an AI stream', async () => {
		const context = createRouteContext({
			nodeEnv: 'production',
			developerRateLimit: {
				blocked: true,
				remaining: 0,
				resetSec: 12,
				resetMs: 12000,
				fullResetSec: 60,
				fullResetMs: 60000,
			},
		});
		const { reply, state } = createReply();

		await context.handler({
			headers: { authorization: 'Bearer developer-token' },
			body: { content: 'hello' },
			ip: '127.0.0.1',
		}, reply);

		expect(state.statusCode).toBe(429);
		expect(state.payload).toMatchObject({ error: { code: 'API_TOKEN_RATE_LIMIT_EXCEEDED' } });
		expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Clear', '60.000');
		expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '0');
		expect(reply.header).toHaveBeenCalledWith('Retry-After', '12');
		expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Reset', '12.000');
		expect(context.aiService.streamChat).not.toHaveBeenCalled();
		expect(reply.raw.writeHead).not.toHaveBeenCalled();
	});
});
