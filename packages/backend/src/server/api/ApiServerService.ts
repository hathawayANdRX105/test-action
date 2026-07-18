/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { ModuleRef } from '@nestjs/core';
import { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Config } from '@/config.js';
import type { InstancesRepository, AccessTokensRepository, UserProfilesRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { AiService, AiServiceError } from '@/core/AiService.js';
import { InternalEventService } from '@/global/InternalEventService.js';
import { TimeService } from '@/global/TimeService.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import { bindThis } from '@/decorators.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { ServerUtilityService } from '@/server/ServerUtilityService.js';
import endpoints from './endpoints.js';
import { ApiCallService } from './ApiCallService.js';
import { SignupApiService } from './SignupApiService.js';
import { SigninApiService } from './SigninApiService.js';
import { SigninWithPasskeyApiService } from './SigninWithPasskeyApiService.js';
import { ApiError } from './error.js';
import { AuthenticateService, AuthenticationError } from './AuthenticateService.js';
import type { FastifyInstance, FastifyPluginOptions } from 'fastify';

const aiChatStreamRateLimit = {
	key: 'ai/chat-stream',
	type: 'bucket' as const,
	size: 10,
	dripRate: 5000,
};
const AI_CHAT_STREAM_BODY_LIMIT = 128 * 1024;
const AI_CHAT_STREAM_WRITE_TIMEOUT_MS = 10000;

@Injectable()
export class ApiServerService {
	constructor(
		private moduleRef: ModuleRef,

		@Inject(DI.config)
		private config: Config,

		@Inject(DI.instancesRepository)
		private instancesRepository: InstancesRepository,

		@Inject(DI.accessTokensRepository)
		private accessTokensRepository: AccessTokensRepository,

		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		private userEntityService: UserEntityService,
		private aiService: AiService,
		private apiCallService: ApiCallService,
		private authenticateService: AuthenticateService,
		private rateLimiterService: SkRateLimiterService,
		private serverUtilityService: ServerUtilityService,
		private signupApiService: SignupApiService,
		private signinApiService: SigninApiService,
		private signinWithPasskeyApiService: SigninWithPasskeyApiService,
		private readonly internalEventService: InternalEventService,
		private readonly timeService: TimeService,
	) {
		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	private formatAiStreamError(err: unknown): {
		message: string;
		code: string;
		id: string;
		kind: string;
		statusCode: number;
	} {
		if (err instanceof AiServiceError) {
			return {
				message: err.message,
				code: err.code,
				id: err.id,
				kind: err.kind,
				statusCode: err.statusCode,
			};
		}

		if (err instanceof ApiError) {
			return {
				message: err.message,
				code: err.code,
				id: err.id,
				kind: err.kind,
				statusCode: err.httpStatusCode ?? (err.kind === 'permission' ? 403 : 400),
			};
		}

		if (err instanceof AuthenticationError) {
			return {
				message: 'Authentication failed. Please ensure your token is correct.',
				code: 'AUTHENTICATION_FAILED',
				id: 'b0a7f5f8-dc2f-4171-b91f-de88ad238e14',
				kind: 'client',
				statusCode: 401,
			};
		}

		return {
			message: 'AI request failed.',
			code: 'AI_REQUEST_FAILED',
			id: 'f0c9f6ad-98b4-4f09-bc9f-16269b6442c9',
			kind: 'server',
			statusCode: 500,
		};
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.register(cors, {
			origin: '*',
			methods: '*',
		});

		fastify.register(multipart, {
			limits: {
				fileSize: this.config.maxFileSize,
				files: 1,
			},
		});

		// Prevent cache
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Cache-Control', 'private, max-age=0, must-revalidate');
			done();
		});

		for (const endpoint of endpoints) {
			const ep = {
				name: endpoint.name,
				meta: endpoint.meta,
				params: endpoint.params,
				exec: this.moduleRef.get('ep:' + endpoint.name, { strict: false }).exec,
			};

			if (endpoint.meta.requireFile) {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send();
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleMultipartRequest(ep, request, reply);
					return reply;
				});
			} else {
				fastify.all<{
					Params: { endpoint: string; },
					Body: Record<string, unknown>,
					Querystring: Record<string, unknown>,
				}>('/' + endpoint.name, { bodyLimit: 1024 * 1024 }, async (request, reply) => {
					if (request.method === 'GET' && !endpoint.meta.allowGet) {
						reply.code(405);
						reply.send();
						return;
					}

					// Await so that any error can automatically be translated to HTTP 500
					await this.apiCallService.handleRequest(ep, request, reply);
					return reply;
				});
			}
		}

		fastify.post<{
			Body: {
				username: string;
				password: string;
				host?: string;
				invitationCode?: string;
				emailAddress?: string;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'frc-captcha-solution'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			}
		}>('/signup', (request, reply) => this.signupApiService.signup(request, reply));

		fastify.post<{
			Body: {
				username: string;
				password?: string;
				token?: string;
				credential?: AuthenticationResponseJSON;
				'hcaptcha-response'?: string;
				'g-recaptcha-response'?: string;
				'turnstile-response'?: string;
				'frc-captcha-solution'?: string;
				'm-captcha-response'?: string;
				'testcaptcha-response'?: string;
			};
		}>('/signin-flow', (request, reply) => this.signinApiService.signin(request, reply));

		fastify.post<{
			Body: {
				credential?: AuthenticationResponseJSON;
				context?: string;
			};
		}>('/signin-with-passkey', (request, reply) => this.signinWithPasskeyApiService.signin(request, reply));

		fastify.post<{ Body: { code: string; } }>('/signup-pending', (request, reply) => this.signupApiService.signupPending(request, reply));

		fastify.post<{
			Body: {
				i?: string;
				conversationId?: string | null;
				providerId?: string | null;
				model?: string | null;
				content?: string;
				fileIds?: string[];
				systemPrompt?: string | null;
			};
		}>('/ai/chat-stream', { bodyLimit: AI_CHAT_STREAM_BODY_LIMIT }, async (request, reply) => {
			const token = request.headers.authorization?.startsWith('Bearer ')
				? request.headers.authorization.slice(7)
				: request.body?.i;

			if (token != null && typeof token !== 'string') {
				reply.code(400);
				reply.send({
					error: {
						message: 'Invalid token.',
						code: 'INVALID_TOKEN',
						id: '4a4a4c3e-bb6d-4874-9898-2e9899065d1b',
					},
				});
				return reply;
			}

			try {
				const [user, tokenInfo] = await this.authenticateService.authenticate(token);
				const userError = this.serverUtilityService.assertClientUser(user);
				if (userError) throw new ApiError(userError);
				if (user == null) throw new AuthenticationError('user not found');
				if (tokenInfo && !tokenInfo.permission.some(permission => permission === 'write:account')) {
					throw new ApiError({
						message: 'Your app does not have the necessary permissions to use this endpoint.',
						code: 'PERMISSION_DENIED',
						kind: 'permission',
						id: '1370e5b7-d4eb-4566-bb1d-7748ee6a1838',
					});
				}

				if (tokenInfo) {
					await this.apiCallService.assertDeveloperApiAccess('write:account', user, tokenInfo, reply);
				}
				const rateLimit = await this.rateLimiterService.limit(aiChatStreamRateLimit, user ?? getIpHash(request.ip));
				sendRateLimitHeaders(reply, rateLimit);
				if (rateLimit.blocked) {
					throw new ApiError({
						message: 'Rate limit exceeded. Please try again later.',
						code: 'RATE_LIMIT_EXCEEDED',
						id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
						httpStatusCode: 429,
					}, rateLimit);
				}

				reply.raw.writeHead(200, {
					'Content-Type': 'text/event-stream; charset=utf-8',
					'Cache-Control': 'no-cache, no-transform',
					Connection: 'keep-alive',
					'X-Accel-Buffering': 'no',
				});

				const abortController = new AbortController();
				reply.raw.on('close', () => abortController.abort());
				const body = request.body ?? {};
				const invalidParam = (name: string) => new AiServiceError('INVALID_PARAM', `${name} is invalid.`);
				const getNullableString = (name: string, value: unknown, maxLength = 512) => {
					if (value === null || value === undefined) return null;
					if (typeof value !== 'string') throw invalidParam(name);
					return value.slice(0, maxLength);
				};
				const getStringArray = (name: string, value: unknown) => {
					if (value === null || value === undefined) return [];
					if (!Array.isArray(value) || !value.every((id): id is string => typeof id === 'string')) throw invalidParam(name);
					return value;
				};
				if (body.content !== null && body.content !== undefined && typeof body.content !== 'string') throw invalidParam('content');
				const content = typeof body.content === 'string' ? body.content.slice(0, 20000) : '';
				const fileIds = getStringArray('fileIds', body.fileIds);
				const waitForDrainOrClose = async (): Promise<void> => {
					await new Promise<void>((resolve) => {
						const cleanup = () => {
							this.timeService.stopTimer(timer);
							reply.raw.off('drain', cleanup);
							reply.raw.off('close', cleanup);
							resolve();
						};
						const timer = this.timeService.startTimer(cleanup, AI_CHAT_STREAM_WRITE_TIMEOUT_MS);
						reply.raw.once('drain', cleanup);
						reply.raw.once('close', cleanup);
					});
				};

				const writeEvent = async (event: string, data: unknown): Promise<boolean> => {
					if (reply.raw.destroyed || reply.raw.writableEnded) return false;
					const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
					if (!reply.raw.write(payload)) {
						await waitForDrainOrClose();
						if (reply.raw.destroyed || reply.raw.writableEnded || reply.raw.writableNeedDrain) {
							abortController.abort();
							return false;
						}
					}
					return true;
				};

				try {
					const result = await this.aiService.streamChat({
						user,
						conversationId: getNullableString('conversationId', body.conversationId),
						providerId: getNullableString('providerId', body.providerId),
						model: getNullableString('model', body.model),
						content,
						fileIds,
						systemPrompt: getNullableString('systemPrompt', body.systemPrompt, 12000),
						abortSignal: abortController.signal,
						onDelta: async (text) => {
							await writeEvent('delta', { text });
						},
					});
					await writeEvent('done', result);
				} catch (err) {
					if (!abortController.signal.aborted) {
						await writeEvent('error', this.formatAiStreamError(err));
					}
				} finally {
					if (!reply.raw.destroyed && !reply.raw.writableEnded) {
						reply.raw.end();
					}
				}
			} catch (err) {
				const error = this.formatAiStreamError(err);
				if (reply.raw.headersSent) {
					if (!reply.raw.destroyed && !reply.raw.writableEnded) {
						reply.raw.write(`event: error\ndata: ${JSON.stringify(error)}\n\n`);
						reply.raw.end();
					}
					return reply;
				}

				reply.code(error.statusCode);
				reply.send({
					error,
				});
			}

			return reply;
		});

		// POST unsubscribes (and is sent by compatible MUAs), GET redirects to the interactive user-facing non-API page
		fastify.get<{ Params: { user: string, token: string; } }>('/unsubscribe/:user/:token', (request, reply) => {
			return reply.redirect(`${this.config.url}/unsubscribe/${request.params.user}/${request.params.token}`, 302);
		});

		fastify.post<{ Params: { user: string, token: string; } }>('/unsubscribe/:user/:token', async (request, reply) => {
			const { affected } = await this.userProfilesRepository.update({
				userId: request.params.user,
				oneClickUnsubscribeToken: request.params.token,
			}, {
				receiveAnnouncementEmail: false,
			});
			if (affected) {
				await this.internalEventService.emit('updateUserProfile', { userId: request.params.user, keys: ['receiveAnnouncementEmail'] });
				return ['Unsubscribed.'];
			} else {
				reply.code(401);
				return {
					error: {
						message: 'Invalid parameters.',
						code: 'INVALID_PARAMETERS',
						id: '26654194-410e-44e2-b42e-460ff6f92476',
					},
				};
			}
		});

		fastify.get('/v1/instance/peers', async (request, reply) => {
			const instances = await this.instancesRepository.find({
				select: ['host'],
				where: {
					suspensionState: 'none',
				},
			});

			return instances.map(instance => instance.host);
		});

		fastify.post<{ Params: { session: string; } }>('/miauth/:session/check', async (request, reply) => {
			const token = await this.accessTokensRepository.findOneBy({
				session: request.params.session,
			});

			if (token && token.session != null && !token.fetched) {
				await this.accessTokensRepository.update(token.id, {
					fetched: true,
				});

				return {
					ok: true,
					token: token.token,
					user: await this.userEntityService.pack(token.userId, null, { schema: 'UserDetailedNotMe' }),
				};
			} else {
				return {
					ok: false,
				};
			}
		});

		// Make sure any unknown path under /api returns HTTP 404 Not Found,
		// because otherwise ClientServerService will return the base client HTML
		// page with HTTP 200.
		fastify.get('/*', (request, reply) => {
			reply.code(404);
			// Mock ApiCallService.send's error handling
			reply.send({
				error: {
					message: 'Unknown API endpoint.',
					code: 'UNKNOWN_API_ENDPOINT',
					id: '2ca3b769-540a-4f08-9dd5-b5a825b6d0f1',
					kind: 'client',
				},
			});
		});

		done();
	}
}
