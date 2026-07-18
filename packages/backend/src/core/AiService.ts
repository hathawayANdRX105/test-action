/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { Response } from 'node-fetch';
import { DI } from '@/di-symbols.js';
import type {
	AiConversationsRepository,
	AiMessagesRepository,
	AiProvidersRepository,
	DriveFilesRepository,
	MiAiConversation,
	MiAiMessage,
	MiAiProvider,
	MiDriveFile,
} from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { HttpRequestService, isPrivateUrl } from '@/core/HttpRequestService.js';
import { MetaService } from '@/core/MetaService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { TimeService } from '@/global/TimeService.js';
import { StatusError } from '@/misc/status-error.js';
import { bindThis } from '@/decorators.js';
import { ApiError } from '@/server/api/error.js';

type ProviderUpdate = {
	name?: string;
	baseUrl?: string;
	apiKey?: string | null;
	isEnabled?: boolean;
	models?: string[];
	defaultModel?: string | null;
	allowedModels?: string[];
	timeoutMs?: number;
	maxTokens?: number;
	temperature?: number;
};

type OpenAiMessageContent =
	| string
	| {
		type: 'text' | 'image_url';
		text?: string;
		image_url?: { url: string };
	}[];

type OpenAiChatMessage = {
	role: 'system' | 'user' | 'assistant';
	content: OpenAiMessageContent;
};

type StreamChatParams = {
	user: MiLocalUser;
	conversationId?: string | null;
	providerId?: string | null;
	model?: string | null;
	content: string;
	fileIds?: string[];
	systemPrompt?: string | null;
	abortSignal?: AbortSignal;
	onDelta?: (text: string) => void | Promise<void>;
};

const MAX_AI_ATTACHMENTS = 8;
const MAX_AI_CONTEXT_MESSAGES = 100;
const MAX_AI_MODELS = 100;
const MAX_AI_MODEL_NAME_LENGTH = 512;
const MAX_AI_PROVIDER_NAME_LENGTH = 128;
const MAX_AI_USER_CONTENT_LENGTH = 20000;
const MAX_AI_SYSTEM_PROMPT_LENGTH = 12000;
const MAX_AI_TITLE_LENGTH = 256;
const MAX_AI_SSE_BUFFER_LENGTH = 1024 * 1024;
const MAX_AI_ASSISTANT_CONTENT_LENGTH = 200000;

export type PackedAiProvider = {
	id: string;
	name: string;
	baseUrl: string;
	isEnabled: boolean;
	models: string[];
	defaultModel: string | null;
	allowedModels: string[];
	timeoutMs: number;
	maxTokens: number;
	temperature: number;
	maskedApiKey: string | null;
	hasApiKey: boolean;
	createdAt: string;
	updatedAt: string;
};

export type PackedAiConversation = {
	id: string;
	title: string;
	providerId: string | null;
	model: string;
	systemPrompt: string | null;
	createdAt: string;
	updatedAt: string;
};

export type PackedAiMessage = {
	id: string;
	conversationId: string;
	userId: string;
	role: MiAiMessage['role'];
	content: string | null;
	attachments: MiAiMessage['attachments'];
	usage: MiAiMessage['usage'];
	error: string | null;
	createdAt: string;
};

export type AiChatResult = {
	conversation: PackedAiConversation;
	userMessage: PackedAiMessage;
	assistantMessage: PackedAiMessage;
	content: string;
};

export class AiServiceError extends ApiError {
	public statusCode: number;

	constructor(code: string, message: string, statusCode = 400) {
		super({
			message,
			code,
			id: '4f563db8-9147-4468-8f70-8b8357d7d8d3',
			kind: statusCode === 403 ? 'permission' : statusCode >= 500 ? 'server' : 'client',
			httpStatusCode: statusCode,
		});
		this.statusCode = statusCode;
	}
}

@Injectable()
export class AiService {
	constructor(
		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.aiProvidersRepository)
		private readonly aiProvidersRepository: AiProvidersRepository,

		@Inject(DI.aiConversationsRepository)
		private readonly aiConversationsRepository: AiConversationsRepository,

		@Inject(DI.aiMessagesRepository)
		private readonly aiMessagesRepository: AiMessagesRepository,

		@Inject(DI.driveFilesRepository)
		private readonly driveFilesRepository: DriveFilesRepository,

		private readonly idService: IdService,
		private readonly httpRequestService: HttpRequestService,
		private readonly metaService: MetaService,
		private readonly driveFileEntityService: DriveFileEntityService,
		private readonly timeService: TimeService,
	) {
	}

	@bindThis
	public normalizeBaseUrl(value: string): string {
		const trimmed = value.trim();
		let parsed: URL;
		try {
			parsed = new URL(trimmed);
		} catch {
			throw new AiServiceError('INVALID_URL', 'Provider URL is invalid.');
		}

		if (parsed.protocol !== 'https:') {
			throw new AiServiceError('INVALID_URL', 'Provider URL must be HTTPS.');
		}
		if (parsed.username || parsed.password) {
			throw new AiServiceError('INVALID_URL', 'Provider URL must not contain credentials.');
		}
		if (parsed.search || parsed.hash) {
			throw new AiServiceError('INVALID_URL', 'Provider URL must not contain query or hash components.');
		}

		parsed.pathname = parsed.pathname.replace(/\/+$/, '');
		const normalized = parsed.toString().replace(/\/+$/, '');
		if (!normalized) throw new AiServiceError('INVALID_URL', 'Provider URL is invalid.');
		return normalized;
	}

	@bindThis
	public async normalizeSafeBaseUrl(value: string): Promise<string> {
		const normalized = this.normalizeBaseUrl(value);
		let privateNetwork = false;
		try {
			privateNetwork = await isPrivateUrl(new URL(normalized), this.httpRequestService.lookup);
		} catch {
			throw new AiServiceError('INVALID_URL', 'Provider URL could not be resolved.');
		}
		if (privateNetwork) {
			throw new AiServiceError('INVALID_URL', 'Provider URL must not resolve to a private or local network address.');
		}
		return normalized;
	}

	@bindThis
	public maskApiKey(key: string | null | undefined): string | null {
		if (!key) return null;
		if (key.length <= 12) return `${key.slice(0, 3)}...${key.slice(-2)}`;
		return `${key.slice(0, 7)}...${key.slice(-4)}`;
	}

	@bindThis
	public packProvider(provider: MiAiProvider): PackedAiProvider {
		return {
			id: provider.id,
			name: provider.name,
			baseUrl: provider.baseUrl,
			isEnabled: provider.isEnabled,
			models: provider.models,
			defaultModel: provider.defaultModel,
			allowedModels: provider.allowedModels,
			timeoutMs: provider.timeoutMs,
			maxTokens: provider.maxTokens,
			temperature: provider.temperature,
			maskedApiKey: this.maskApiKey(provider.apiKey),
			hasApiKey: provider.apiKey.length > 0,
			createdAt: provider.createdAt.toISOString(),
			updatedAt: provider.updatedAt.toISOString(),
		};
	}

	@bindThis
	public packConversation(conversation: MiAiConversation): PackedAiConversation {
		return {
			id: conversation.id,
			title: conversation.title,
			providerId: conversation.providerId,
			model: conversation.model,
			systemPrompt: conversation.systemPrompt,
			createdAt: conversation.createdAt.toISOString(),
			updatedAt: conversation.updatedAt.toISOString(),
		};
	}

	@bindThis
	public packMessage(message: MiAiMessage): PackedAiMessage {
		return {
			id: message.id,
			conversationId: message.conversationId,
			userId: message.userId,
			role: message.role,
			content: message.content,
			attachments: message.attachments,
			usage: message.usage,
			error: message.error,
			createdAt: message.createdAt.toISOString(),
		};
	}

	@bindThis
	public async listProviders(): Promise<PackedAiProvider[]> {
		const providers = await this.aiProvidersRepository.find({
			order: {
				createdAt: 'DESC',
			},
		});
		return providers.map(this.packProvider);
	}

	@bindThis
	public async createProvider(values: ProviderUpdate): Promise<PackedAiProvider> {
		const now = this.timeService.date;
		const provider = await this.aiProvidersRepository.insertOne({
			id: this.idService.gen(),
			name: this.trimText(values.name, MAX_AI_PROVIDER_NAME_LENGTH, 'Provider'),
			baseUrl: await this.normalizeSafeBaseUrl(values.baseUrl ?? ''),
			apiKey: this.normalizeApiKey(values.apiKey),
			isEnabled: values.isEnabled ?? true,
			models: this.normalizeModelList(values.models),
			defaultModel: this.optionalText(values.defaultModel),
			allowedModels: this.normalizeModelList(values.allowedModels),
			timeoutMs: this.clampInt(values.timeoutMs, 1000, 120000, 30000),
			maxTokens: this.clampInt(values.maxTokens, 1, 128000, 1024),
			temperature: this.clampNumber(values.temperature, 0, 2, 0.7),
			createdAt: now,
			updatedAt: now,
		});

		if (this.meta.aiDefaultProviderId == null) {
			await this.metaService.update({ aiDefaultProviderId: provider.id });
		}

		return this.packProvider(provider);
	}

	@bindThis
	public async updateProvider(id: MiAiProvider['id'], values: ProviderUpdate): Promise<PackedAiProvider> {
		const provider = await this.getProviderOrThrow(id, false);
		const patch: Partial<MiAiProvider> = {
			updatedAt: this.timeService.date,
		};

		if (values.name !== undefined) patch.name = this.trimText(values.name, MAX_AI_PROVIDER_NAME_LENGTH, provider.name);
		if (values.baseUrl !== undefined) patch.baseUrl = await this.normalizeSafeBaseUrl(values.baseUrl);
		if (values.apiKey !== undefined && values.apiKey !== null && values.apiKey !== '') patch.apiKey = this.normalizeApiKey(values.apiKey);
		if (values.isEnabled !== undefined) patch.isEnabled = values.isEnabled;
		if (values.models !== undefined) patch.models = this.normalizeModelList(values.models);
		if (values.defaultModel !== undefined) patch.defaultModel = this.optionalText(values.defaultModel);
		if (values.allowedModels !== undefined) patch.allowedModels = this.normalizeModelList(values.allowedModels);
		if (values.timeoutMs !== undefined) patch.timeoutMs = this.clampInt(values.timeoutMs, 1000, 120000, provider.timeoutMs);
		if (values.maxTokens !== undefined) patch.maxTokens = this.clampInt(values.maxTokens, 1, 128000, provider.maxTokens);
		if (values.temperature !== undefined) patch.temperature = this.clampNumber(values.temperature, 0, 2, provider.temperature);

		await this.aiProvidersRepository.update(provider.id, patch);
		const updated = await this.getProviderOrThrow(provider.id, false);
		return this.packProvider(updated);
	}

	@bindThis
	public async deleteProvider(id: MiAiProvider['id']): Promise<void> {
		await this.getProviderOrThrow(id, false);
		await this.aiProvidersRepository.delete(id);
		if (this.meta.aiDefaultProviderId === id) {
			await this.metaService.update({ aiDefaultProviderId: null });
		}
	}

	@bindThis
	public async testProvider(id: MiAiProvider['id']): Promise<{ ok: boolean; models: string[]; elapsedMs: number; error: string | null; }> {
		const provider = await this.getProviderOrThrow(id, false);
		return await this.requestModels(provider, false);
	}

	@bindThis
	public async fetchModels(id: MiAiProvider['id']): Promise<{ ok: boolean; models: string[]; elapsedMs: number; error: string | null; provider: PackedAiProvider; }> {
		const provider = await this.getProviderOrThrow(id, false);
		const result = await this.requestModels(provider, true);
		const updated = await this.getProviderOrThrow(id, false);
		return {
			...result,
			provider: this.packProvider(updated),
		};
	}

	@bindThis
	public async getSettings(): Promise<{
		enableAi: boolean;
		showAiInNavbar: boolean;
		aiDefaultProviderId: string | null;
		aiMaxContextMessages: number;
	}> {
		return {
			enableAi: this.meta.enableAi,
			showAiInNavbar: this.meta.showAiInNavbar,
			aiDefaultProviderId: this.meta.aiDefaultProviderId,
			aiMaxContextMessages: this.meta.aiMaxContextMessages,
		};
	}

	@bindThis
	public async updateSettings(values: {
		enableAi?: boolean;
		showAiInNavbar?: boolean;
		aiDefaultProviderId?: string | null;
		aiMaxContextMessages?: number;
	}): Promise<{
		enableAi: boolean;
		showAiInNavbar: boolean;
		aiDefaultProviderId: string | null;
		aiMaxContextMessages: number;
	}> {
		if (values.aiDefaultProviderId != null) {
			await this.getProviderOrThrow(values.aiDefaultProviderId, false);
		}

		await this.metaService.update({
			...(values.enableAi !== undefined ? { enableAi: values.enableAi } : {}),
			...(values.showAiInNavbar !== undefined ? { showAiInNavbar: values.showAiInNavbar } : {}),
			...(values.aiDefaultProviderId !== undefined ? { aiDefaultProviderId: values.aiDefaultProviderId } : {}),
			...(values.aiMaxContextMessages !== undefined ? { aiMaxContextMessages: this.clampInt(values.aiMaxContextMessages, 1, MAX_AI_CONTEXT_MESSAGES, 20) } : {}),
		});

		return await this.getSettings();
	}

	@bindThis
	public async getStatus(): Promise<{
		enabled: boolean;
		providers: {
			id: string;
			name: string;
			defaultModel: string | null;
			allowedModels: string[];
		}[];
		defaultProviderId: string | null;
		maxContextMessages: number;
	}> {
		if (!this.meta.enableAi) {
			return {
				enabled: false,
				providers: [],
				defaultProviderId: null,
				maxContextMessages: this.meta.aiMaxContextMessages,
			};
		}

		const providers = await this.aiProvidersRepository.find({
			where: { isEnabled: true },
			order: { createdAt: 'ASC' },
		});

		const available = providers
			.map(provider => ({
				id: provider.id,
				name: provider.name,
				defaultModel: this.getProviderDefaultModel(provider),
				allowedModels: this.getAllowedModels(provider),
			}))
			.filter(provider => provider.allowedModels.length > 0);
		const defaultProviderId = available.some(provider => provider.id === this.meta.aiDefaultProviderId)
			? this.meta.aiDefaultProviderId
			: (available[0]?.id ?? null);

		return {
			enabled: true,
			providers: available,
			defaultProviderId,
			maxContextMessages: this.meta.aiMaxContextMessages,
		};
	}

	@bindThis
	public async listConversations(userId: MiUser['id']): Promise<PackedAiConversation[]> {
		const conversations = await this.aiConversationsRepository.find({
			where: { userId },
			order: { updatedAt: 'DESC' },
			take: 100,
		});
		return conversations.map(this.packConversation);
	}

	@bindThis
	public async getConversation(userId: MiUser['id'], conversationId: MiAiConversation['id']): Promise<PackedAiConversation> {
		return this.packConversation(await this.getOwnedConversation(userId, conversationId));
	}

	@bindThis
	public async createConversation(user: MiLocalUser, values: {
		providerId?: string | null;
		model?: string | null;
		title?: string | null;
		systemPrompt?: string | null;
	}): Promise<PackedAiConversation> {
		const { provider, model } = await this.resolveProviderAndModel(values.providerId, values.model);
		const now = this.timeService.date;
		const conversation = await this.aiConversationsRepository.insertOne({
			id: this.idService.gen(),
			userId: user.id,
			title: this.trimText(values.title, MAX_AI_TITLE_LENGTH, 'New chat'),
			providerId: provider.id,
			model,
			systemPrompt: this.optionalText(values.systemPrompt, MAX_AI_SYSTEM_PROMPT_LENGTH),
			createdAt: now,
			updatedAt: now,
		});

		return this.packConversation(conversation);
	}

	@bindThis
	public async updateConversation(userId: MiUser['id'], conversationId: MiAiConversation['id'], values: {
		title?: string | null;
		systemPrompt?: string | null;
	}): Promise<PackedAiConversation> {
		const conversation = await this.getOwnedConversation(userId, conversationId);
		await this.aiConversationsRepository.update(conversation.id, {
			...(values.title !== undefined ? { title: this.trimText(values.title, MAX_AI_TITLE_LENGTH, conversation.title) } : {}),
			...(values.systemPrompt !== undefined ? { systemPrompt: this.optionalText(values.systemPrompt, MAX_AI_SYSTEM_PROMPT_LENGTH) } : {}),
			updatedAt: this.timeService.date,
		});
		return this.packConversation(await this.getOwnedConversation(userId, conversation.id));
	}

	@bindThis
	public async deleteConversation(userId: MiUser['id'], conversationId: MiAiConversation['id']): Promise<void> {
		const conversation = await this.getOwnedConversation(userId, conversationId);
		await this.aiConversationsRepository.delete(conversation.id);
	}

	@bindThis
	public async listMessages(userId: MiUser['id'], conversationId: MiAiConversation['id']): Promise<PackedAiMessage[]> {
		await this.getOwnedConversation(userId, conversationId);
		const messages = await this.aiMessagesRepository.find({
			where: { conversationId, userId },
			order: { createdAt: 'ASC', id: 'ASC' },
			take: 500,
		});
		return messages.map(this.packMessage);
	}

	@bindThis
	public async deleteMessage(userId: MiUser['id'], messageId: MiAiMessage['id']): Promise<void> {
		const message = await this.aiMessagesRepository.findOneBy({
			id: messageId,
			userId,
		});
		if (message == null) throw new AiServiceError('NO_SUCH_MESSAGE', 'No such message.', 404);
		await this.aiMessagesRepository.delete(message.id);
	}

	@bindThis
	public async streamChat(params: StreamChatParams): Promise<AiChatResult> {
		const content = this.trimText(params.content, MAX_AI_USER_CONTENT_LENGTH, '');
		if (content === '' && ((params.fileIds ?? []).length === 0)) {
			throw new AiServiceError('CONTENT_REQUIRED', 'Message content or an image is required.');
		}

		let conversation: MiAiConversation;
		let provider: MiAiProvider;
		let model: string;

		if (params.conversationId) {
			conversation = await this.getOwnedConversation(params.user.id, params.conversationId);
			const resolved = await this.resolveProviderAndModel(params.providerId ?? conversation.providerId, params.model ?? conversation.model);
			provider = resolved.provider;
			model = resolved.model;
			if (provider.id !== conversation.providerId || model !== conversation.model) {
				await this.aiConversationsRepository.update(conversation.id, {
					providerId: provider.id,
					model,
					updatedAt: this.timeService.date,
				});
				conversation = await this.getOwnedConversation(params.user.id, conversation.id);
			}
		} else {
			const created = await this.createConversation(params.user, {
				providerId: params.providerId,
				model: params.model,
				systemPrompt: params.systemPrompt,
			});
			conversation = await this.getOwnedConversation(params.user.id, created.id);
			provider = await this.getProviderOrThrow(conversation.providerId, true);
			model = conversation.model;
		}

		const attachments = await this.resolveAttachments(params.user.id, params.fileIds ?? [], model);
		const now = this.timeService.date;
		const userMessage = await this.aiMessagesRepository.insertOne({
			id: this.idService.gen(),
			conversationId: conversation.id,
			userId: params.user.id,
			role: 'user',
			content,
			attachments,
			usage: null,
			error: null,
			createdAt: now,
		});

		let assistantMessage: MiAiMessage;
		let assistantContent = '';
		try {
			const messages = await this.buildOpenAiMessages(conversation, userMessage, provider, attachments);
			const response = await this.openAiChatRequest(provider, model, messages, params.abortSignal);
			const usage = await this.readStreamingResponse(response, async delta => {
				if (assistantContent.length + delta.length > MAX_AI_ASSISTANT_CONTENT_LENGTH) {
					throw new AiServiceError('AI_RESPONSE_TOO_LARGE', 'AI response is too large.', 502);
				}
				assistantContent += delta;
				await params.onDelta?.(delta);
			}, params.abortSignal);

			const savedAt = this.timeService.date;
			assistantMessage = await this.aiMessagesRepository.insertOne({
				id: this.idService.gen(),
				conversationId: conversation.id,
				userId: params.user.id,
				role: 'assistant',
				content: assistantContent,
				attachments: [],
				usage,
				error: null,
				createdAt: savedAt,
			});

			await this.updateConversationAfterChat(conversation, content, savedAt);
			conversation = await this.getOwnedConversation(params.user.id, conversation.id);
		} catch (err) {
			const savedAt = this.timeService.date;
			assistantMessage = await this.aiMessagesRepository.insertOne({
				id: this.idService.gen(),
				conversationId: conversation.id,
				userId: params.user.id,
				role: 'assistant',
				content: assistantContent,
				attachments: [],
				usage: null,
				error: this.sanitizeError(err),
				createdAt: savedAt,
			});
			await this.aiConversationsRepository.update(conversation.id, {
				updatedAt: savedAt,
			});
			throw err;
		}

		return {
			conversation: this.packConversation(conversation),
			userMessage: this.packMessage(userMessage),
			assistantMessage: this.packMessage(assistantMessage),
			content: assistantContent,
		};
	}

	@bindThis
	private async getProviderOrThrow(id: MiAiProvider['id'] | null | undefined, mustBeEnabled: boolean): Promise<MiAiProvider> {
		if (!id) throw new AiServiceError('NO_PROVIDER', 'No AI provider is configured.');
		const provider = await this.aiProvidersRepository.findOneBy({ id });
		if (provider == null) throw new AiServiceError('NO_SUCH_PROVIDER', 'No such AI provider.', 404);
		if (mustBeEnabled && !provider.isEnabled) throw new AiServiceError('PROVIDER_DISABLED', 'This AI provider is disabled.', 403);
		return provider;
	}

	@bindThis
	private async getOwnedConversation(userId: MiUser['id'], conversationId: MiAiConversation['id']): Promise<MiAiConversation> {
		const conversation = await this.aiConversationsRepository.findOneBy({
			id: conversationId,
			userId,
		});
		if (conversation == null) throw new AiServiceError('NO_SUCH_CONVERSATION', 'No such conversation.', 404);
		return conversation;
	}

	@bindThis
	private async resolveProviderAndModel(providerId?: string | null, model?: string | null): Promise<{ provider: MiAiProvider; model: string; }> {
		if (!this.meta.enableAi) throw new AiServiceError('AI_DISABLED', 'AI is disabled.', 403);

		let provider: MiAiProvider | null = null;
		if (providerId) {
			provider = await this.getProviderOrThrow(providerId, true);
		} else if (this.meta.aiDefaultProviderId) {
			provider = await this.getProviderOrThrow(this.meta.aiDefaultProviderId, true);
		} else {
			provider = await this.aiProvidersRepository.findOne({
				where: { isEnabled: true },
				order: { createdAt: 'ASC' },
			});
		}

		if (provider == null) throw new AiServiceError('NO_PROVIDER', 'No enabled AI provider is configured.', 403);

		const allowedModels = this.getAllowedModels(provider);
		if (allowedModels.length === 0) throw new AiServiceError('NO_MODELS', 'No AI models are allowed for this provider.', 403);

		const requestedModel = model?.trim();
		const selectedModel = requestedModel && requestedModel.length > 0 ? requestedModel : (this.getProviderDefaultModel(provider) ?? allowedModels[0]);
		if (!allowedModels.includes(selectedModel)) {
			throw new AiServiceError('MODEL_NOT_ALLOWED', 'This AI model is not allowed.', 403);
		}

		return {
			provider,
			model: selectedModel,
		};
	}

	@bindThis
	private getAllowedModels(provider: MiAiProvider): string[] {
		const allowedModels = this.normalizeModelList(provider.allowedModels);
		if (allowedModels.length > 0) return allowedModels;

		return this.normalizeModelList(provider.models);
	}

	@bindThis
	private getProviderDefaultModel(provider: MiAiProvider): string | null {
		const allowedModels = this.getAllowedModels(provider);
		if (provider.defaultModel && allowedModels.includes(provider.defaultModel)) return provider.defaultModel;
		return allowedModels[0] ?? null;
	}

	@bindThis
	private async requestModels(provider: MiAiProvider, persist: boolean): Promise<{ ok: boolean; models: string[]; elapsedMs: number; error: string | null; }> {
		const started = this.timeService.now;

		try {
			const res = await this.httpRequestService.send(await this.getProviderEndpoint(provider, '/models'), {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: `Bearer ${provider.apiKey}`,
				},
				timeout: provider.timeoutMs,
				size: 1024 * 512,
			}, {
				throwErrorWhenResponseNotOk: false,
				validators: [],
			});

			const elapsedMs = this.timeService.now - started;
			if (!res.ok) {
				this.closeResponseBody(res);
				return {
					ok: false,
					models: [],
					elapsedMs,
					error: `HTTP ${res.status}`,
				};
			}

			const json = await res.json() as unknown;
			const models = this.extractModels(json);
			if (persist) {
				await this.aiProvidersRepository.update(provider.id, {
					models,
					defaultModel: provider.defaultModel && models.includes(provider.defaultModel) ? provider.defaultModel : (models[0] ?? null),
					allowedModels: provider.allowedModels.filter(model => models.includes(model)),
					updatedAt: this.timeService.date,
				});
			}

			return {
				ok: true,
				models,
				elapsedMs,
				error: null,
			};
		} catch (err) {
			return {
				ok: false,
				models: [],
				elapsedMs: this.timeService.now - started,
				error: this.sanitizeError(err),
			};
		}
	}

	@bindThis
	private extractModels(json: unknown): string[] {
		const raw = typeof json === 'object' && json !== null && 'data' in json
			? (json as { data?: unknown }).data
			: json;
		if (!Array.isArray(raw)) return [];

		return this.normalizeModelList(raw.flatMap(item => {
			if (typeof item === 'string') return [item];
			if (typeof item === 'object' && item !== null && 'id' in item && typeof item.id === 'string') return [item.id];
			return [];
		}));
	}

	@bindThis
	private async resolveAttachments(userId: MiUser['id'], fileIds: string[], model: string): Promise<MiAiMessage['attachments']> {
		const ids = Array.from(new Set(fileIds.filter(Boolean)));
		if (ids.length === 0) return [];
		if (ids.length > MAX_AI_ATTACHMENTS) {
			throw new AiServiceError('TOO_MANY_ATTACHMENTS', `AI chat supports up to ${MAX_AI_ATTACHMENTS} image attachments.`);
		}
		if (!this.isVisionModel(model)) {
			throw new AiServiceError('AI_MODEL_DOES_NOT_SUPPORT_IMAGES', 'The selected model does not support image input.');
		}

		const files = await this.driveFilesRepository.find({
			where: {
				id: In(ids),
				userId,
			},
		});
		const fileMap = new Map<MiDriveFile['id'], MiDriveFile>(files.map(file => [file.id, file]));

		return ids.map(id => {
			const file = fileMap.get(id);
			if (file == null) throw new AiServiceError('NO_SUCH_FILE', 'No such image file.', 404);
			if (!file.type.startsWith('image/')) throw new AiServiceError('UNSUPPORTED_ATTACHMENT_TYPE', 'Only image attachments are supported.');
			return {
				fileId: file.id,
				name: file.name,
				type: file.type,
				url: this.driveFileEntityService.getPublicUrl(file),
			};
		});
	}

	@bindThis
	private isVisionModel(model: string): boolean {
		return /vision|gpt-4o|gpt-4\.1|gpt-5|gemini|claude|qwen.*vl|qwen-vl|vl\b|pixtral|llava/i.test(model);
	}

	@bindThis
	private async buildOpenAiMessages(
		conversation: MiAiConversation,
		userMessage: MiAiMessage,
		provider: MiAiProvider,
		attachments: MiAiMessage['attachments'],
	): Promise<OpenAiChatMessage[]> {
		const historyLimit = this.clampInt(this.meta.aiMaxContextMessages, 1, MAX_AI_CONTEXT_MESSAGES, 20);
		const history = await this.aiMessagesRepository.find({
			where: {
				conversationId: conversation.id,
				userId: userMessage.userId,
			},
			order: {
				createdAt: 'DESC',
				id: 'DESC',
			},
			take: historyLimit,
		});

		const messages: OpenAiChatMessage[] = [];
		if (conversation.systemPrompt) {
			messages.push({
				role: 'system',
				content: conversation.systemPrompt,
			});
		}

		for (const message of history.reverse()) {
			if (message.id === userMessage.id) continue;
			if (message.role === 'system') continue;
			if (message.error) continue;
			if (!message.content && message.attachments.length === 0) continue;

			messages.push({
				role: message.role,
				content: this.toOpenAiContent(message.content ?? '', message.attachments),
			});
		}

		messages.push({
			role: 'user',
			content: this.toOpenAiContent(userMessage.content ?? '', attachments),
		});

		// Kept as a parameter so provider-specific context policies can be added without changing call sites.
		if (provider.maxTokens < 1) throw new AiServiceError('INVALID_PROVIDER_CONFIG', 'Provider max tokens is invalid.');
		return this.trimMessagesForProvider(messages);
	}

	@bindThis
	private toOpenAiContent(content: string, attachments: MiAiMessage['attachments']): OpenAiMessageContent {
		if (attachments.length === 0) return content;
		return [
			...(content ? [{ type: 'text' as const, text: content }] : []),
			...attachments.map(attachment => ({
				type: 'image_url' as const,
				image_url: { url: attachment.url ?? '' },
			})),
		].filter(part => part.type === 'text' || part.image_url.url);
	}

	@bindThis
	private trimMessagesForProvider(messages: OpenAiChatMessage[]): OpenAiChatMessage[] {
		if (messages.length <= this.meta.aiMaxContextMessages + 1) return messages;
		const system = messages[0]?.role === 'system' ? messages[0] : null;
		const rest = system ? messages.slice(1) : messages;
		return [
			...(system ? [system] : []),
			...rest.slice(-this.clampInt(this.meta.aiMaxContextMessages, 1, MAX_AI_CONTEXT_MESSAGES, 20)),
		];
	}

	@bindThis
	private async openAiChatRequest(provider: MiAiProvider, model: string, messages: OpenAiChatMessage[], abortSignal?: AbortSignal): Promise<Response> {
		if (abortSignal?.aborted) {
			throw new AiServiceError('STREAM_ABORTED', 'AI generation was stopped by the client.', 499);
		}

		const res = await this.httpRequestService.send(await this.getProviderEndpoint(provider, '/chat/completions'), {
			method: 'POST',
			headers: {
				Accept: 'text/event-stream, application/json',
				'Content-Type': 'application/json',
				Authorization: `Bearer ${provider.apiKey}`,
			},
			body: JSON.stringify({
				model,
				messages,
				stream: true,
				max_tokens: provider.maxTokens,
				temperature: provider.temperature,
			}),
			timeout: provider.timeoutMs,
			size: 1024 * 1024 * 8,
			signal: abortSignal,
		}, {
			throwErrorWhenResponseNotOk: false,
			validators: [],
		});

		if (!res.ok) {
			this.closeResponseBody(res);
			throw new AiServiceError('UPSTREAM_ERROR', `AI provider returned HTTP ${res.status}.`, res.status >= 500 ? 502 : 400);
		}

		// node-fetch keeps request timers alive until the body is consumed; stream readers
		// still need to watch the client abort signal while parsing chunks.
		return res;
	}

	@bindThis
	private async getProviderEndpoint(provider: MiAiProvider, path: string): Promise<string> {
		return `${await this.normalizeSafeBaseUrl(provider.baseUrl)}${path}`;
	}

	@bindThis
	private async readStreamingResponse(
		response: Response,
		onDelta: (delta: string) => Promise<void>,
		abortSignal?: AbortSignal,
	): Promise<Record<string, unknown> | null> {
		const contentType = response.headers.get('content-type') ?? '';
		if (contentType.includes('application/json')) {
			const json = await response.json().catch(() => null) as any;
			const text = json?.choices?.[0]?.message?.content ?? json?.choices?.[0]?.delta?.content;
			if (typeof text === 'string' && text.length > 0) {
				await onDelta(text);
			}
			return this.extractUsage(json);
		}

		if (response.body == null) {
			const json = await response.json().catch(() => null) as any;
			const text = json?.choices?.[0]?.message?.content;
			if (typeof text === 'string' && text.length > 0) {
				await onDelta(text);
			}
			return this.extractUsage(json);
		}

		const decoder = new TextDecoder();
		let buffer = '';
		let usage: Record<string, unknown> | null = null;

		try {
			for await (const chunk of response.body as unknown as AsyncIterable<Buffer | Uint8Array>) {
				if (abortSignal?.aborted) {
					throw new AiServiceError('STREAM_ABORTED', 'AI generation was stopped by the client.', 499);
				}
				buffer += decoder.decode(chunk, { stream: true });
				if (buffer.length > MAX_AI_SSE_BUFFER_LENGTH) {
					throw new AiServiceError('AI_STREAM_TOO_LARGE', 'AI stream buffer is too large.', 502);
				}

				let boundary = this.findSseBoundary(buffer);
				while (boundary != null) {
					const event = buffer.slice(0, boundary.index);
					buffer = buffer.slice(boundary.index + boundary.length);
					const result = await this.handleSseEvent(event, onDelta);
					usage = result ?? usage;
					boundary = this.findSseBoundary(buffer);
				}
			}

			if (buffer.trim()) {
				const result = await this.handleSseEvent(buffer, onDelta);
				usage = result ?? usage;
			}
		} catch (err) {
			this.closeResponseBody(response);
			throw err;
		}

		return usage;
	}

	@bindThis
	private closeResponseBody(response: Response): void {
		const body = response.body as unknown as {
			destroy?: () => void;
			cancel?: () => Promise<unknown> | void;
		} | null;
		body?.destroy?.();
		void body?.cancel?.();
	}

	@bindThis
	private findSseBoundary(buffer: string): { index: number; length: number; } | null {
		const lf = buffer.indexOf('\n\n');
		const crlf = buffer.indexOf('\r\n\r\n');
		if (lf === -1 && crlf === -1) return null;
		if (lf === -1) return { index: crlf, length: 4 };
		if (crlf === -1) return { index: lf, length: 2 };
		return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
	}

	@bindThis
	private async handleSseEvent(event: string, onDelta: (delta: string) => Promise<void>): Promise<Record<string, unknown> | null> {
		const dataLines = event
			.split(/\r?\n/)
			.map(line => line.trim())
			.filter(line => line.startsWith('data:'))
			.map(line => line.slice(5).trim());

		let usage: Record<string, unknown> | null = null;
		for (const line of dataLines) {
			if (line === '[DONE]') continue;
			if (line.length > MAX_AI_SSE_BUFFER_LENGTH) {
				throw new AiServiceError('AI_STREAM_TOO_LARGE', 'AI stream event is too large.', 502);
			}
			let json: any;
			try {
				json = JSON.parse(line);
			} catch {
				continue;
			}

			const delta = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.message?.content;
			if (typeof delta === 'string' && delta.length > 0) {
				await onDelta(delta);
			}

			usage = this.extractUsage(json) ?? usage;
		}

		return usage;
	}

	@bindThis
	private extractUsage(json: any): Record<string, unknown> | null {
		return json && typeof json === 'object' && json.usage && typeof json.usage === 'object'
			? json.usage
			: null;
	}

	@bindThis
	private async updateConversationAfterChat(conversation: MiAiConversation, firstUserMessage: string, now: Date): Promise<void> {
		const title = conversation.title === '新对话' || conversation.title === 'New chat'
			? this.makeTitle(firstUserMessage)
			: conversation.title;
		await this.aiConversationsRepository.update(conversation.id, {
			title,
			updatedAt: now,
		});
	}

	@bindThis
	private makeTitle(content: string): string {
		const singleLine = content.replace(/\s+/g, ' ').trim();
		if (!singleLine) return 'Image chat';
		return singleLine.length > 40 ? `${singleLine.slice(0, 40)}...` : singleLine;
	}

	@bindThis
	private normalizeModelList(models: string[] | undefined): string[] {
		return Array.from(new Set((models ?? [])
			.map(model => model.trim())
			.filter(Boolean)
			.map(model => model.slice(0, MAX_AI_MODEL_NAME_LENGTH))))
			.slice(0, MAX_AI_MODELS);
	}

	@bindThis
	private trimText(value: string | null | undefined, maxLength: number, fallback: string): string {
		const trimmed = value?.trim() ?? '';
		return (trimmed.length > 0 ? trimmed : fallback).slice(0, maxLength);
	}

	@bindThis
	private optionalText(value: string | null | undefined, maxLength = MAX_AI_MODEL_NAME_LENGTH): string | null {
		const trimmed = value?.trim() ?? '';
		return trimmed.length > 0 ? trimmed.slice(0, maxLength) : null;
	}

	@bindThis
	private normalizeApiKey(value: string | null | undefined): string {
		return (value ?? '').trim().slice(0, 4096);
	}

	@bindThis
	private clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
		const parsed = Math.trunc(Number(value));
		if (!Number.isFinite(parsed)) return fallback;
		return Math.min(Math.max(parsed, min), max);
	}

	@bindThis
	private clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
		const parsed = Number(value);
		if (!Number.isFinite(parsed)) return fallback;
		return Math.min(Math.max(parsed, min), max);
	}

	@bindThis
	public sanitizeError(err: unknown): string {
		if (err instanceof AiServiceError) return err.message;
		if (err instanceof StatusError) return `HTTP ${err.statusCode}`;
		if (err instanceof Error && err.name === 'AbortError') return 'Request timed out.';
		if (err instanceof Error && err.message) {
			return err.message
				.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer <redacted>')
				.replace(/\bsk-[A-Za-z0-9._-]{8,}\b/g, 'sk-<redacted>')
				.replace(/((?:api[_-]?key|key|token)=)[^&\s]+/gi, '$1<redacted>')
				.slice(0, 240);
		}
		return 'AI request failed.';
	}
}
