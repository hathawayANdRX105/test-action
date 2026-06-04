/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { AiService, AiServiceError } from '@/core/AiService.js';

describe('AiService', () => {
	function createService() {
		const meta: {
			enableAi: boolean;
			showAiInNavbar: boolean;
			aiDefaultProviderId: string | null;
			aiMaxContextMessages: number;
		} = {
			enableAi: true,
			showAiInNavbar: true,
			aiDefaultProviderId: null,
			aiMaxContextMessages: 20,
		};
		const providers = new Map<string, any>();
		const conversations = new Map<string, any>();
		const messages: any[] = [];
		let id = 0;
		let now = 0;

		const aiProvidersRepository = {
			find: jest.fn(async (options?: any) => Array.from(providers.values())
				.filter(provider => options?.where?.isEnabled === undefined || provider.isEnabled === options.where.isEnabled)
				.sort((a, b) => {
					const direction = options?.order?.createdAt === 'ASC' ? 1 : -1;
					return (a.createdAt.getTime() - b.createdAt.getTime()) * direction;
				})),
			findOne: jest.fn(async () => Array.from(providers.values()).find(provider => provider.isEnabled) ?? null),
			findOneBy: jest.fn(async ({ id }: { id: string }) => providers.get(id) ?? null),
			insertOne: jest.fn(async (provider: any) => {
				providers.set(provider.id, provider);
				return provider;
			}),
			update: jest.fn(async (providerId: string, patch: any) => {
				providers.set(providerId, { ...providers.get(providerId), ...patch });
			}),
			delete: jest.fn(async (providerId: string) => {
				providers.delete(providerId);
			}),
		};
		const aiConversationsRepository = {
			find: jest.fn(async ({ where }: any) => Array.from(conversations.values()).filter(conversation => conversation.userId === where.userId)),
			findOneBy: jest.fn(async ({ id, userId }: { id: string; userId: string }) => {
				const conversation = conversations.get(id);
				return conversation?.userId === userId ? conversation : null;
			}),
			insertOne: jest.fn(async (conversation: any) => {
				conversations.set(conversation.id, conversation);
				return conversation;
			}),
			update: jest.fn(async (conversationId: string, patch: any) => {
				conversations.set(conversationId, { ...conversations.get(conversationId), ...patch });
			}),
			delete: jest.fn(async (conversationId: string) => {
				conversations.delete(conversationId);
			}),
		};
		const aiMessagesRepository = {
			find: jest.fn(async ({ where, take }: any) => messages
				.filter(message => message.conversationId === where.conversationId && message.userId === where.userId)
				.slice()
				.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
				.slice(0, take)),
			insertOne: jest.fn(async (message: any) => {
				messages.push(message);
				return message;
			}),
		};
		const metaService = {
			update: jest.fn(async (patch: any) => {
				Object.assign(meta, patch);
			}),
		};
		const driveFilesRepository = {
			find: jest.fn(async () => []),
		};
		const driveFileEntityService = {
			getPublicUrl: jest.fn((file: any) => file.url),
		};
		const httpRequestService = {
			lookup: jest.fn((hostname: string, _options: unknown, callback: (err: Error | null, address?: string) => void) => {
				callback(null, hostname === 'localhost' ? '127.0.0.1' : '93.184.216.34');
			}),
			send: jest.fn(),
		};
		const timeService = {
			get date() {
				now += 1;
				return new Date(now);
			},
			get now() {
				return now;
			},
		};

		const service = new AiService(
			meta as never,
			aiProvidersRepository as never,
			aiConversationsRepository as never,
			aiMessagesRepository as never,
			driveFilesRepository as never,
			{ gen: () => `id${++id}` } as never,
			httpRequestService as never,
			metaService as never,
			driveFileEntityService as never,
			timeService as never,
		);

		return {
			service,
			meta,
			providers,
			conversations,
			messages,
			aiProvidersRepository,
			aiMessagesRepository,
			driveFilesRepository,
			httpRequestService,
		};
	}

	function createProvider(overrides: Record<string, unknown> = {}) {
		return {
			id: 'provider1',
			name: 'Provider',
			baseUrl: 'https://ai.example/v1',
			apiKey: 'sk-secret-key',
			isEnabled: true,
			models: ['gpt-4o', 'gpt-4o-mini'],
			defaultModel: 'gpt-4o',
			allowedModels: ['gpt-4o'],
			timeoutMs: 30000,
			maxTokens: 1024,
			temperature: 0.7,
			createdAt: new Date(0),
			updatedAt: new Date(0),
			...overrides,
		};
	}

	it('normalizes provider URLs and masks API keys', async () => {
		const { service, aiProvidersRepository, meta } = createService();

		const packed = await service.createProvider({
			name: 'Test',
			baseUrl: 'https://ai.example/v1///',
			apiKey: 'sk-1234567890abcdef',
			models: ['gpt-4o', 'gpt-4o', ''],
			allowedModels: ['gpt-4o'],
		});

		expect(aiProvidersRepository.insertOne).toHaveBeenCalledWith(expect.objectContaining({
			baseUrl: 'https://ai.example/v1',
			models: ['gpt-4o'],
		}));
		expect(packed.maskedApiKey).toBe('sk-1234...cdef');
		expect((packed as any).apiKey).toBeUndefined();
		expect(meta.aiDefaultProviderId).toBe(packed.id);
	});

	it('rejects unsafe provider URLs', async () => {
		const { service } = createService();

		for (const baseUrl of [
			'http://ai.example/v1',
			'https://user:pass@ai.example/v1',
			'https://ai.example/v1?api_key=sk-secret',
			'https://ai.example/v1#models',
			'https://localhost/v1',
		]) {
			await expect(service.createProvider({
				name: 'Unsafe',
				baseUrl,
				apiKey: 'sk-secret',
			})).rejects.toThrow(AiServiceError);
		}
	});

	it('does not allow disabled providers for chat', async () => {
		const { service, providers } = createService();
		providers.set('provider1', createProvider({ isEnabled: false }));

		await expect(service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			content: 'hello',
		})).rejects.toThrow(AiServiceError);
	});

	it('uses fetched provider models when no explicit allow-list is configured', async () => {
		const { service, providers, meta } = createService();
		providers.set('provider1', createProvider({
			models: ['gpt-4o'],
			allowedModels: [],
		}));
		meta.aiDefaultProviderId = 'provider1';

		await expect(service.getStatus()).resolves.toMatchObject({
			providers: [expect.objectContaining({
				id: 'provider1',
				defaultModel: 'gpt-4o',
				allowedModels: ['gpt-4o'],
			})],
			defaultProviderId: 'provider1',
		});
	});

	it('falls back from a disabled default provider in user status', async () => {
		const { service, providers, meta } = createService();
		providers.set('provider1', createProvider({ isEnabled: false }));
		providers.set('provider2', createProvider({
			id: 'provider2',
			createdAt: new Date(1000),
		}));
		meta.aiDefaultProviderId = 'provider1';

		await expect(service.getStatus()).resolves.toMatchObject({
			defaultProviderId: 'provider2',
			providers: [expect.objectContaining({ id: 'provider2' })],
		});
	});

	it('saves user and assistant messages from a streaming response', async () => {
		const { service, providers, messages, httpRequestService } = createService();
		providers.set('provider1', createProvider());
		httpRequestService.send.mockResolvedValue({
			ok: true,
			headers: {
				get: () => 'text/event-stream',
			},
			body: (async function* () {
				yield Buffer.from('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\n');
				yield Buffer.from('data: {"choices":[{"delta":{"content":"lo"}}],"usage":{"total_tokens":3}}\n\n');
				yield Buffer.from('data: [DONE]\n\n');
			})(),
		} as never);

		const deltas: string[] = [];
		const result = await service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			model: 'gpt-4o',
			content: 'Hi',
			onDelta: delta => {
				deltas.push(delta);
			},
		});

		expect(deltas.join('')).toBe('Hello');
		expect(result.content).toBe('Hello');
		expect(messages.map(message => message.role)).toEqual(['user', 'assistant']);
		expect(messages[1].usage).toEqual({ total_tokens: 3 });
		expect(httpRequestService.send).toHaveBeenCalledWith('https://ai.example/v1/chat/completions', expect.objectContaining({
			headers: expect.objectContaining({
				Authorization: 'Bearer sk-secret-key',
			}),
		}), expect.anything());
	});

	it('rejects image attachments for non-vision models', async () => {
		const { service, providers } = createService();
		providers.set('provider1', createProvider({
			models: ['text-model'],
			defaultModel: 'text-model',
			allowedModels: ['text-model'],
		}));

		await expect(service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			model: 'text-model',
			content: 'describe this',
			fileIds: ['file1'],
		})).rejects.toMatchObject({
			code: 'AI_MODEL_DOES_NOT_SUPPORT_IMAGES',
		});
	});

	it('rejects too many image attachments before loading drive files', async () => {
		const { service, providers, driveFilesRepository } = createService();
		providers.set('provider1', createProvider());

		await expect(service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			model: 'gpt-4o',
			content: 'describe these',
			fileIds: Array.from({ length: 9 }, (_, i) => `file${i}`),
		})).rejects.toMatchObject({
			code: 'TOO_MANY_ATTACHMENTS',
		});
		expect(driveFilesRepository.find).not.toHaveBeenCalled();
	});

	it('caps streaming response growth and redacts provider secrets in saved errors', async () => {
		const { service, providers, messages, httpRequestService } = createService();
		providers.set('provider1', createProvider());
		const hugeDelta = 'x'.repeat(200001);
		httpRequestService.send.mockResolvedValue({
			ok: true,
			headers: {
				get: () => 'text/event-stream',
			},
			body: (async function* () {
				yield Buffer.from(`data: {"choices":[{"delta":{"content":"${hugeDelta}"}}]}\n\n`);
			})(),
		} as never);

		await expect(service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			model: 'gpt-4o',
			content: 'Hi',
		})).rejects.toMatchObject({
			code: 'AI_RESPONSE_TOO_LARGE',
		});

		const assistant = messages.find(message => message.role === 'assistant');
		expect(assistant?.error).toBe('AI response is too large.');
	});

	it('redacts bearer tokens, sk keys, query keys, and long error bodies', () => {
		const { service } = createService();
		const sanitized = service.sanitizeError(new Error(`failed Bearer sk-live-secret-token api_key=sk-query-secret ${'x'.repeat(400)}`));

		expect(sanitized).toContain('Bearer <redacted>');
		expect(sanitized).toContain('api_key=<redacted>');
		expect(sanitized).not.toContain('sk-live-secret-token');
		expect(sanitized).not.toContain('sk-query-secret');
		expect(sanitized.length).toBeLessThanOrEqual(240);
	});
});
