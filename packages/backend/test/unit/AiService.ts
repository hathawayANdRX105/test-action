/*
 * SPDX-FileCopyrightText: hhhl contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jest } from '@jest/globals';
import { AiService, AiServiceError } from '@/core/AiService.js';

describe('AiService', () => {
	function createService() {
		const meta = {
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
			find: jest.fn(async () => Array.from(providers.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())),
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

	it('does not allow disabled providers for chat', async () => {
		const { service, providers } = createService();
		providers.set('provider1', createProvider({ isEnabled: false }));

		await expect(service.streamChat({
			user: { id: 'user1' } as never,
			providerId: 'provider1',
			content: 'hello',
		})).rejects.toThrow(AiServiceError);
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
});
