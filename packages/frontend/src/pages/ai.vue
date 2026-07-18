<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs" :hideTitle="true">
	<FormSuspense :p="init">
		<div :class="$style.root">
			<aside :class="$style.sidebar">
				<div :class="$style.sidebarHeader">
					<div :class="$style.sidebarTitle"><i class="ti ti-robot"></i> {{ i18n.ts._ai.title }}</div>
					<MkButton primary iconOnly rounded @click="startNewConversation"><i class="ti ti-plus"></i></MkButton>
				</div>

				<div :class="$style.sidebarList">
					<div v-if="conversations.length === 0" :class="$style.sidebarEmpty">{{ i18n.ts.noHistory }}</div>
					<button
						v-for="conversation in conversations"
						:key="conversation.id"
						class="_button"
						:class="[$style.conversation, { [$style.conversationActive]: conversation.id === selectedConversationId }]"
						@click="selectConversation(conversation.id)"
						@contextmenu.prevent.stop="onConversationContext(conversation, $event)"
					>
						<div :class="$style.conversationMain">
							<span :class="$style.conversationTitle">{{ conversation.title }}</span>
							<span :class="$style.conversationMeta">{{ conversation.model }}</span>
						</div>
						<button class="_button" :class="$style.conversationMenu" @click.stop="onConversationContext(conversation, $event)">
							<i class="ti ti-dots"></i>
						</button>
					</button>
					<MkButton v-if="conversationsHasMore" :class="$style.sidebarLoadMore" rounded :wait="conversationsLoadingMore" @click="loadMoreConversations"><i class="ti ti-chevron-down"></i> {{ i18n.ts.loadMore }}</MkButton>
				</div>
			</aside>

			<main :class="$style.chat">
				<div :class="$style.topbar">
					<div :class="$style.modelControls">
						<MkSelect v-model="selectedProviderId" :items="providerItems" small @update:modelValue="onProviderChange">
							<template #label>{{ i18n.ts._ai.provider }}</template>
						</MkSelect>
						<MkSelect v-model="selectedModel" :items="modelItems" small>
							<template #label>{{ i18n.ts._ai.model }}</template>
						</MkSelect>
						<MkSelect v-model="selectedPersonaKey" :items="personaItems" small @update:modelValue="onPersonaChange">
							<template #label>{{ i18n.ts._ai.persona }}</template>
						</MkSelect>
					</div>

					<div :class="$style.topActions">
						<MkButton rounded :disabled="streaming" @click="openSystemPromptEditor"><i class="ti ti-message-cog"></i> {{ i18n.ts._ai.systemPrompt }}</MkButton>
						<MkButton danger rounded :disabled="!selectedConversationId || streaming" @click="deleteConversation"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
					</div>
				</div>

				<div v-if="!status.enabled || status.providers.length === 0" :class="$style.noticeStack">
					<MkInfo v-if="!status.enabled" warn>{{ i18n.ts._ai.disabledOnServer }}</MkInfo>
					<MkInfo v-else-if="status.providers.length === 0" warn>{{ i18n.ts._ai.noProviderAvailable }}</MkInfo>
				</div>

				<div ref="messagesEl" :class="$style.messages">
					<MkButton v-if="messagesHasMore && selectedConversationId" :class="$style.loadOlderMessages" rounded :wait="messagesLoadingMore" @click="loadMoreMessages"><i class="ti ti-chevron-up"></i> {{ i18n.ts.loadMore }}</MkButton>
					<div v-if="displayMessages.length === 0" :class="$style.emptyState">
						<i class="ti ti-sparkles"></i>
						<div>{{ i18n.ts._ai.startConversation }}</div>
						<div v-if="status.enabled && status.providers.length > 0" :class="$style.suggestions">
							<button v-for="(s, i) in suggestions" :key="i" class="_button" :class="$style.suggestion" @click="useSuggestion(s)">{{ s }}</button>
						</div>
					</div>

					<div
						v-for="message in displayMessages"
						:key="message.id"
						:class="[$style.messageRow, message.role === 'user' ? $style.messageRowUser : $style.messageRowAssistant]"
					>
						<div :class="[$style.avatar, message.role === 'user' ? $style.avatarUser : $style.avatarAssistant]">
							<i :class="message.role === 'user' ? 'ti ti-user' : 'ti ti-robot'"></i>
						</div>
						<div :class="$style.messageBody">
							<div :class="$style.messageMeta">
								<span :class="$style.messageRole">{{ message.role === 'user' ? i18n.ts._ai.you : i18n.ts._ai.assistant }}</span>
								<span v-if="message.error" :class="$style.messageError"><i class="ti ti-alert-circle"></i> {{ message.error }}</span>
							</div>

							<div v-if="message.role === 'assistant'" :class="$style.messageContent">
								<MkAiMarkdown v-if="message.content" :text="message.content"/>
								<span v-if="isStreamingMessage(message)" :class="$style.cursor"></span>
								<div v-else-if="!message.content && !message.error" :class="$style.thinking">
									<span></span><span></span><span></span>
								</div>
							</div>
							<div v-else-if="message.content" :class="[$style.messageContent, $style.userContent]">{{ message.content }}</div>

							<div v-if="message.attachments && message.attachments.length > 0" :class="$style.attachments">
								<a v-for="attachment in message.attachments" :key="attachment.fileId" :href="attachment.url ?? '#'" target="_blank" rel="noopener" :class="$style.attachment">
									<img v-if="attachment.url" :src="attachment.url" :alt="attachment.name">
									<span>{{ attachment.name }}</span>
								</a>
							</div>

							<div v-if="usageText(message)" :class="$style.usage"><i class="ti ti-coin"></i> {{ usageText(message) }}</div>

							<div :class="$style.messageActions">
								<button v-if="message.content" v-tooltip="i18n.ts.copy" class="_button" :class="$style.iconButton" @click="copyMessage(message.content)">
									<i class="ti ti-copy"></i>
								</button>
								<button v-if="message.role === 'user' && !streaming && !isTemp(message)" v-tooltip="i18n.ts.edit" class="_button" :class="$style.iconButton" @click="editMessage(message)">
									<i class="ti ti-pencil"></i>
								</button>
								<button v-if="message.role === 'assistant' && !streaming" v-tooltip="i18n.ts.regenerate" class="_button" :class="$style.iconButton" @click="regenerateFrom(message)">
									<i class="ti ti-refresh"></i>
								</button>
								<button v-if="!streaming && !isTemp(message)" v-tooltip="i18n.ts.delete" class="_button" :class="$style.iconButton" @click="deleteMessage(message)">
									<i class="ti ti-trash"></i>
								</button>
							</div>
						</div>
					</div>
				</div>

				<div v-if="pendingAttachments.length > 0" :class="$style.pendingAttachments">
					<div v-for="file in pendingAttachments" :key="file.id" :class="$style.pendingAttachment">
						<img v-if="file.thumbnailUrl ?? file.url" :src="file.thumbnailUrl ?? file.url" :alt="file.name">
						<span>{{ file.name }}</span>
						<button class="_button" @click="removeAttachment(file.id)"><i class="ti ti-x"></i></button>
					</div>
				</div>

				<form :class="$style.composer" @submit.prevent="sendMessage">
					<button v-tooltip="i18n.ts.attachFile" class="_button" :class="$style.composerIconButton" type="button" :disabled="streaming" @click="attachImage">
						<i class="ti ti-photo"></i>
					</button>
					<textarea
						ref="draftEl"
						v-model="draft"
						:class="$style.textarea"
						:disabled="streaming || !canSend"
						rows="3"
						:placeholder="i18n.ts._ai.messagePlaceholder"
						@keydown="onDraftKeydown"
					></textarea>
					<button v-if="streaming" v-tooltip="i18n.ts._ai.stop" class="_button" :class="$style.composerIconButton" type="button" @click="stopStreaming">
						<i class="ti ti-player-stop"></i>
					</button>
					<button v-else v-tooltip="i18n.ts.send" class="_button" :class="[$style.composerIconButton, $style.sendButton]" type="submit" :disabled="!canSubmit">
						<i class="ti ti-arrow-up"></i>
					</button>
				</form>
			</main>
		</div>
	</FormSuspense>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { apiUrl } from '@@/js/config.js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkAiMarkdown from '@/components/MkAiMarkdown.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi, printError } from '@/utility/misskey-api.js';
import { selectFiles } from '@/utility/select-file.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { $i } from '@/i.js';
import { AI_PERSONAS, findPersonaBySystemPrompt } from '@/pages/ai-personas.js';

type AiStatus = {
	enabled: boolean;
	providers: AiStatusProvider[];
	defaultProviderId: string | null;
	maxContextMessages: number;
};

type AiStatusProvider = {
	id: string;
	name: string;
	defaultModel: string | null;
	allowedModels: string[];
};

type AiConversation = {
	id: string;
	title: string;
	providerId: string | null;
	model: string;
	systemPrompt: string | null;
	createdAt: string;
	updatedAt: string;
};

type AiMessage = {
	id: string;
	conversationId: string;
	userId: string;
	role: 'system' | 'user' | 'assistant';
	content: string | null;
	attachments: AiAttachment[];
	usage: Record<string, unknown> | null;
	error: string | null;
	createdAt: string;
};

type AiAttachment = {
	fileId: string;
	name: string;
	type: string;
	url: string | null;
};

type ChatStreamDone = {
	conversation: AiConversation;
	userMessage: AiMessage;
	assistantMessage: AiMessage;
	content: string;
};

const status = ref<AiStatus>({
	enabled: false,
	providers: [],
	defaultProviderId: null,
	maxContextMessages: 20,
});
const conversations = ref<AiConversation[]>([]);
const conversationsHasMore = ref(false);
const conversationsLoadingMore = ref(false);
const messages = ref<AiMessage[]>([]);
const messagesHasMore = ref(false);
const messagesLoadingMore = ref(false);
const selectedConversationId = ref<string | null>(null);
const selectedProviderId = ref<string | null>(null);
const selectedModel = ref<string | null>(null);
const selectedPersonaKey = ref<string>('none');
const pendingSystemPrompt = ref<string>('');
const draft = ref('');
const pendingAttachments = ref<Misskey.entities.DriveFile[]>([]);
const streaming = ref(false);
const streamingMessageId = ref<string | null>(null);
const abortController = ref<AbortController | null>(null);
const messagesEl = ref<HTMLElement | null>(null);
const draftEl = ref<HTMLTextAreaElement | null>(null);

const AI_MOBILE_BREAKPOINT = 850;
const AI_STREAM_BUFFER_LIMIT = 1024 * 1024;
const AI_CONVERSATIONS_PAGE_SIZE = 40;
const AI_MESSAGES_PAGE_SIZE = 50;
const isMobileLayout = ref(window.innerWidth <= AI_MOBILE_BREAKPOINT);

const suggestions = computed(() => [
	i18n.ts._ai.suggestion1,
	i18n.ts._ai.suggestion2,
	i18n.ts._ai.suggestion3,
]);

const providerItems = computed(() => status.value.providers.map(provider => ({
	value: provider.id,
	label: provider.name,
})));

const currentProvider = computed(() => status.value.providers.find(provider => provider.id === selectedProviderId.value) ?? null);

const modelItems = computed(() => (currentProvider.value?.allowedModels ?? []).map(model => ({
	value: model,
	label: model,
})));

const personaItems = computed(() => [
	...AI_PERSONAS.map(p => ({ value: p.key, label: p.label() })),
	{ value: 'custom', label: i18n.ts._ai.personaCustom },
]);

const canSend = computed(() => status.value.enabled && status.value.providers.length > 0);
const canSubmit = computed(() => canSend.value && !streaming.value && (draft.value.trim().length > 0 || pendingAttachments.value.length > 0) && selectedProviderId.value != null && selectedModel.value != null);

const displayMessages = computed(() => messages.value);

function isTemp(message: AiMessage): boolean {
	return message.id.startsWith('temp-');
}

function isStreamingMessage(message: AiMessage): boolean {
	return streaming.value && message.id === streamingMessageId.value;
}

function usageText(message: AiMessage): string | null {
	const usage = message.usage;
	if (!usage || message.role !== 'assistant') return null;
	const prompt = Number(usage.prompt_tokens ?? usage.promptTokens);
	const completion = Number(usage.completion_tokens ?? usage.completionTokens);
	const total = Number(usage.total_tokens ?? usage.totalTokens);
	if (Number.isFinite(total) && total > 0) {
		if (Number.isFinite(prompt) && Number.isFinite(completion)) {
			return i18n.tsx._ai.usageDetail({ prompt, completion, total });
		}
		return i18n.tsx._ai.usageTokens({ count: total });
	}
	return null;
}

function applyDefaultSelection(conversation?: AiConversation | null) {
	if (conversation) {
		selectedProviderId.value = conversation.providerId ?? status.value.defaultProviderId ?? status.value.providers[0]?.id ?? null;
		selectedModel.value = conversation.model;
		pendingSystemPrompt.value = conversation.systemPrompt ?? '';
		syncPersonaFromPrompt(conversation.systemPrompt ?? '');
		return;
	}

	selectedProviderId.value = status.value.defaultProviderId ?? status.value.providers[0]?.id ?? null;
	selectedModel.value = currentProvider.value?.defaultModel ?? currentProvider.value?.allowedModels[0] ?? null;
}

function syncPersonaFromPrompt(systemPrompt: string) {
	const persona = findPersonaBySystemPrompt(systemPrompt);
	selectedPersonaKey.value = persona ? persona.key : (systemPrompt.trim() === '' ? 'none' : 'custom');
}

async function init() {
	await loadStatus();
	await loadConversations();
	if (conversations.value[0]) {
		await selectConversation(conversations.value[0].id);
	} else {
		applyDefaultSelection(null);
	}
}

async function loadStatus() {
	status.value = await misskeyApi<AiStatus>('ai/status');
}

function splitOverfetchPage<T>(items: T[], limit: number) {
	return {
		items: items.slice(0, limit),
		hasMore: items.length > limit,
	};
}

async function fetchConversationsPage(offset: number) {
	return splitOverfetchPage(await misskeyApi<AiConversation[]>('ai/conversations/list', {
		limit: AI_CONVERSATIONS_PAGE_SIZE + 1,
		offset,
	}), AI_CONVERSATIONS_PAGE_SIZE);
}

async function loadConversations() {
	const page = await fetchConversationsPage(0);
	conversations.value = page.items;
	conversationsHasMore.value = page.hasMore;
}

async function loadMoreConversations() {
	if (conversationsLoadingMore.value || !conversationsHasMore.value) return;
	conversationsLoadingMore.value = true;
	try {
		const page = await fetchConversationsPage(conversations.value.length);
		const loadedIds = new Set(conversations.value.map(conversation => conversation.id));
		conversations.value = [
			...conversations.value,
			...page.items.filter(conversation => !loadedIds.has(conversation.id)),
		];
		conversationsHasMore.value = page.hasMore;
	} finally {
		conversationsLoadingMore.value = false;
	}
}

async function fetchMessagesPage(conversationId: string, offset: number) {
	return splitOverfetchPage(await misskeyApi<AiMessage[]>('ai/messages/list', {
		conversationId,
		limit: AI_MESSAGES_PAGE_SIZE + 1,
		offset,
	}), AI_MESSAGES_PAGE_SIZE);
}

async function selectConversation(conversationId: string) {
	selectedConversationId.value = conversationId;
	messages.value = [];
	messagesHasMore.value = false;
	messagesLoadingMore.value = false;
	const conversation = conversations.value.find(item => item.id === conversationId)
		?? await misskeyApi<AiConversation>('ai/conversations/show', { conversationId });
	applyDefaultSelection(conversation);
	const page = await fetchMessagesPage(conversationId, 0);
	messages.value = page.items;
	messagesHasMore.value = page.hasMore;
	await scrollToBottom();
}

async function loadMoreMessages() {
	if (!selectedConversationId.value || messagesLoadingMore.value || !messagesHasMore.value) return;
	const previousScrollHeight = messagesEl.value?.scrollHeight ?? 0;
	messagesLoadingMore.value = true;
	try {
		const page = await fetchMessagesPage(selectedConversationId.value, messages.value.length);
		const loadedIds = new Set(messages.value.map(message => message.id));
		messages.value = [
			...page.items.filter(message => !loadedIds.has(message.id)),
			...messages.value,
		];
		messagesHasMore.value = page.hasMore;
		await nextTick();
		if (messagesEl.value) {
			messagesEl.value.scrollTop += messagesEl.value.scrollHeight - previousScrollHeight;
		}
	} finally {
		messagesLoadingMore.value = false;
	}
}

function startNewConversation() {
	selectedConversationId.value = null;
	messages.value = [];
	messagesHasMore.value = false;
	messagesLoadingMore.value = false;
	pendingAttachments.value = [];
	draft.value = '';
	applyDefaultSelection(null);
	nextTick(() => draftEl.value?.focus());
}

function useSuggestion(text: string) {
	draft.value = text;
	nextTick(() => {
		draftEl.value?.focus();
	});
}

function onProviderChange() {
	selectedModel.value = currentProvider.value?.defaultModel ?? currentProvider.value?.allowedModels[0] ?? null;
}

async function onPersonaChange() {
	if (selectedPersonaKey.value === 'custom') {
		await openSystemPromptEditor();
		return;
	}
	const persona = AI_PERSONAS.find(p => p.key === selectedPersonaKey.value);
	if (!persona) return;
	await applySystemPrompt(persona.systemPrompt);
}

async function openSystemPromptEditor() {
	const { canceled, result } = await os.inputText({
		title: i18n.ts._ai.systemPrompt,
		text: i18n.ts._ai.systemPromptCaption,
		default: pendingSystemPrompt.value,
		minLength: 0,
	});
	if (canceled) {
		// revert persona selector to whatever the prompt currently matches
		syncPersonaFromPrompt(pendingSystemPrompt.value);
		return;
	}
	await applySystemPrompt(result ?? '');
}

async function applySystemPrompt(systemPrompt: string) {
	pendingSystemPrompt.value = systemPrompt;
	syncPersonaFromPrompt(systemPrompt);
	// Persist immediately for existing conversations; new conversations carry it on first send.
	if (selectedConversationId.value) {
		await misskeyApi('ai/conversations/update', {
			conversationId: selectedConversationId.value,
			systemPrompt: systemPrompt === '' ? null : systemPrompt,
		});
		os.toast(i18n.ts.saved);
	}
}

async function sendMessage() {
	if (!canSubmit.value || $i == null) return;

	const content = draft.value.trim();
	const files = pendingAttachments.value;
	const tempConversationId = selectedConversationId.value ?? 'pending';
	const tempUserMessage: AiMessage = {
		id: `temp-user-${Date.now()}`,
		conversationId: tempConversationId,
		userId: $i.id,
		role: 'user',
		content,
		attachments: files.map(file => ({
			fileId: file.id,
			name: file.name,
			type: file.type,
			url: file.url,
		})),
		usage: null,
		error: null,
		createdAt: new Date().toISOString(),
	};
	const tempAssistantMessage: AiMessage = {
		id: `temp-assistant-${Date.now()}`,
		conversationId: tempConversationId,
		userId: $i.id,
		role: 'assistant',
		content: '',
		attachments: [],
		usage: null,
		error: null,
		createdAt: new Date().toISOString(),
	};

	draft.value = '';
	pendingAttachments.value = [];
	resetTextareaHeight();
	messages.value = [...messages.value, tempUserMessage, tempAssistantMessage];
	await scrollToBottom();

	streaming.value = true;
	streamingMessageId.value = tempAssistantMessage.id;
	abortController.value = new AbortController();

	try {
		const result = await requestChatStream({
			conversationId: selectedConversationId.value,
			providerId: selectedProviderId.value,
			model: selectedModel.value,
			content,
			fileIds: files.map(file => file.id),
			systemPrompt: selectedConversationId.value ? null : (pendingSystemPrompt.value === '' ? null : pendingSystemPrompt.value),
		}, (text) => {
			tempAssistantMessage.content = (tempAssistantMessage.content ?? '') + text;
			void scrollToBottom();
		});

		selectedConversationId.value = result.conversation.id;
		await loadConversations();
		const page = await fetchMessagesPage(result.conversation.id, 0);
		messages.value = page.items;
		messagesHasMore.value = page.hasMore;
		applyDefaultSelection(result.conversation);
		await scrollToBottom();
	} catch (err) {
		if (abortController.value?.signal.aborted) {
			tempAssistantMessage.error = i18n.ts._ai.stopped;
		} else {
			tempAssistantMessage.error = printError(err);
			await os.alert({
				type: 'error',
				title: i18n.ts.somethingHappened,
				text: tempAssistantMessage.error,
			});
		}
	} finally {
		streaming.value = false;
		streamingMessageId.value = null;
		abortController.value = null;
	}
}

async function requestChatStream(body: {
	conversationId: string | null;
	providerId: string | null;
	model: string | null;
	content: string;
	fileIds: string[];
	systemPrompt: string | null;
}, onDelta: (text: string) => void): Promise<ChatStreamDone> {
	const res = await window.fetch(`${apiUrl}/ai/chat-stream`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${$i?.token}`,
		},
		body: JSON.stringify(body),
		credentials: 'omit',
		cache: 'no-cache',
		signal: abortController.value?.signal,
	});

	if (!res.ok || res.body == null) {
		const json = await res.json().catch(() => null) as any;
		throw json?.error ?? new Error(`HTTP ${res.status}`);
	}

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';
	let donePayload: ChatStreamDone | null = null;

	while (true) {
		const read = await reader.read();
		if (read.done) break;
		buffer += decoder.decode(read.value, { stream: true });
		if (buffer.length > AI_STREAM_BUFFER_LIMIT) {
			await reader.cancel().catch(() => undefined);
			throw new Error('AI stream buffer is too large.');
		}

		let boundary = findSseBoundary(buffer);
		while (boundary != null) {
			const rawEvent = buffer.slice(0, boundary.index);
			buffer = buffer.slice(boundary.index + boundary.length);
			const event = parseSseEvent(rawEvent);
			if (event.type === 'delta' && typeof event.data?.text === 'string') {
				onDelta(event.data.text);
			} else if (event.type === 'done') {
				donePayload = event.data as ChatStreamDone;
			} else if (event.type === 'error') {
				throw event.data;
			}
			boundary = findSseBoundary(buffer);
		}
	}

	if (buffer.trim()) {
		const event = parseSseEvent(buffer);
		if (event.type === 'done') donePayload = event.data as ChatStreamDone;
		if (event.type === 'error') throw event.data;
	}

	if (donePayload == null) throw new Error('AI stream ended without a completion event.');
	return donePayload;
}

function findSseBoundary(buffer: string): { index: number; length: number; } | null {
	const lf = buffer.indexOf('\n\n');
	const crlf = buffer.indexOf('\r\n\r\n');
	if (lf === -1 && crlf === -1) return null;
	if (lf === -1) return { index: crlf, length: 4 };
	if (crlf === -1) return { index: lf, length: 2 };
	return lf < crlf ? { index: lf, length: 2 } : { index: crlf, length: 4 };
}

function parseSseEvent(raw: string): { type: string; data: any; } {
	let type = 'message';
	const data: string[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (line.startsWith('event:')) {
			type = line.slice(6).trim();
		} else if (line.startsWith('data:')) {
			data.push(line.slice(5).trim());
		}
	}
	return {
		type,
		data: data.length > 0 ? JSON.parse(data.join('\n').slice(0, AI_STREAM_BUFFER_LIMIT)) : null,
	};
}

function stopStreaming() {
	abortController.value?.abort();
	streaming.value = false;
	streamingMessageId.value = null;
}

function onDraftKeydown(ev: KeyboardEvent) {
	if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
		ev.preventDefault();
		void sendMessage();
	}
}

function resetTextareaHeight() {
	if (draftEl.value) draftEl.value.scrollTop = 0;
}

function updateLayoutMode() {
	isMobileLayout.value = window.innerWidth <= AI_MOBILE_BREAKPOINT;
}

window.addEventListener('resize', updateLayoutMode, { passive: true });
onBeforeUnmount(() => {
	window.removeEventListener('resize', updateLayoutMode);
});

async function attachImage(ev: MouseEvent) {
	const files = await selectFiles(ev.currentTarget ?? ev.target, i18n.ts.attachFile);
	pendingAttachments.value = [
		...pendingAttachments.value,
		...files.filter(file => file.type.startsWith('image/')),
	].slice(0, 8);
}

function removeAttachment(fileId: string) {
	pendingAttachments.value = pendingAttachments.value.filter(file => file.id !== fileId);
}

function copyMessage(content: string | null) {
	copyToClipboard(content);
	os.toast(i18n.ts.copiedToClipboard);
}

function regenerateFrom(message: AiMessage) {
	const index = messages.value.findIndex(item => item.id === message.id);
	const userMessage = [...messages.value.slice(0, index)].reverse().find(item => item.role === 'user');
	if (!userMessage?.content) return;
	draft.value = userMessage.content;
	nextTick(() => {
		void sendMessage();
	});
}

async function editMessage(message: AiMessage) {
	if (message.role !== 'user' || !message.content) return;
	const { canceled, result } = await os.inputText({
		title: i18n.ts.edit,
		default: message.content,
		minLength: 1,
	});
	if (canceled || result == null) return;

	// Delete this message and everything after it on the server, then resend.
	const index = messages.value.findIndex(item => item.id === message.id);
	const tail = messages.value.slice(index).filter(item => !isTemp(item));
	for (const item of tail) {
		await misskeyApi('ai/messages/delete', { messageId: item.id });
	}
	messages.value = messages.value.slice(0, index);
	draft.value = result;
	await nextTick();
	await sendMessage();
}

async function deleteMessage(message: AiMessage) {
	if (isTemp(message)) {
		messages.value = messages.value.filter(item => item.id !== message.id);
		return;
	}
	await misskeyApi('ai/messages/delete', { messageId: message.id });
	messages.value = messages.value.filter(item => item.id !== message.id);
	os.toast(i18n.ts.removed);
}

function onConversationContext(conversation: AiConversation, ev: MouseEvent) {
	os.popupMenu([{
		icon: 'ti ti-pencil',
		text: i18n.ts.rename,
		action: () => renameConversation(conversation),
	}, {
		icon: 'ti ti-trash',
		text: i18n.ts.delete,
		danger: true,
		action: () => removeConversation(conversation),
	}], ev.currentTarget ?? ev.target);
}

async function renameConversation(conversation: AiConversation) {
	const { canceled, result } = await os.inputText({
		title: i18n.ts.rename,
		default: conversation.title,
		minLength: 1,
	});
	if (canceled || result == null) return;
	await misskeyApi('ai/conversations/update', {
		conversationId: conversation.id,
		title: result,
	});
	await loadConversations();
}

async function removeConversation(conversation: AiConversation) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: i18n.tsx.deleteAreYouSure({ x: conversation.title }),
	});
	if (canceled) return;
	await misskeyApi('ai/conversations/delete', { conversationId: conversation.id });
	await loadConversations();
	if (selectedConversationId.value === conversation.id) {
		startNewConversation();
	}
	os.toast(i18n.ts.removed);
}

async function deleteConversation() {
	if (!selectedConversationId.value) return;
	const conversation = conversations.value.find(item => item.id === selectedConversationId.value);
	if (!conversation) return;
	await removeConversation(conversation);
}

async function scrollToBottom() {
	await nextTick();
	if (messagesEl.value) {
		messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
	}
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._ai.title,
	icon: 'ti ti-robot',
	needWideArea: !isMobileLayout.value,
}));
</script>

<style lang="scss" module>
.root {
	--ai-mobile-footer-height: var(--MI-minBottomSpacing, 0px);
	--ai-content-height: calc(100cqh - (var(--MI-stickyTop, 0px) + var(--MI-stickyBottom, 0px) + var(--MI-visualViewportBottom, 0px)));
	--ai-pane-max-width: 920px;
	--ai-pane-gutter: max(18px, calc((100% - var(--ai-pane-max-width)) / 2));

	display: grid;
	grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
	height: var(--ai-content-height);
	min-height: 0;
	background: var(--MI_THEME-bg);
	overflow: hidden;
}

.sidebar {
	display: flex;
	flex-direction: column;
	border-right: 1px solid var(--MI_THEME-divider);
	min-width: 0;
	overflow: hidden;
}

.sidebarHeader {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 14px;
	border-bottom: 1px solid var(--MI_THEME-divider);
}

.sidebarTitle {
	display: flex;
	align-items: center;
	gap: 8px;
	font-weight: 700;
}

.sidebarList {
	flex: 1;
	min-height: 0;
	overflow-y: auto;
	padding-bottom: 12px;
	scrollbar-gutter: stable;
}

.sidebarEmpty {
	padding: 18px 14px;
	color: var(--MI_THEME-fgTransparentWeak);
}

.sidebarLoadMore {
	width: calc(100% - 16px);
	margin: 10px 8px 0;
}

.conversation {
	display: flex;
	align-items: center;
	gap: 6px;
	width: calc(100% - 16px);
	margin: 8px 8px 0;
	padding: 10px 12px;
	text-align: left;
	border-radius: var(--MI-radius-sm);
	color: var(--MI_THEME-fg);
}

.conversation:hover,
.conversationActive {
	background: var(--MI_THEME-buttonHoverBg);
}

.conversationMain {
	display: grid;
	gap: 4px;
	min-width: 0;
	flex: 1;
}

.conversationTitle,
.conversationMeta {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.conversationMeta {
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.conversationMenu {
	display: grid;
	place-items: center;
	width: 26px;
	height: 26px;
	flex-shrink: 0;
	border-radius: var(--MI-radius-xs);
	color: var(--MI_THEME-fgTransparentWeak);
	opacity: 0;
}

.conversation:hover .conversationMenu,
.conversationActive .conversationMenu {
	opacity: 1;
}

.chat {
	display: grid;
	grid-template-areas:
		"topbar"
		"notice"
		"messages"
		"attachments"
		"composer";
	grid-template-rows: auto auto minmax(0, 1fr) auto auto;
	min-width: 0;
	min-height: 0;
	overflow: hidden;
}

.topbar {
	grid-area: topbar;
	display: flex;
	align-items: end;
	justify-content: space-between;
	gap: 16px;
	padding: 12px 16px;
	border-bottom: 1px solid var(--MI_THEME-divider);
	flex-wrap: wrap;
}

.modelControls {
	display: grid;
	grid-template-columns: minmax(150px, 200px) minmax(180px, 260px) minmax(140px, 190px);
	gap: 12px;
	align-items: end;
}

.topActions {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
	justify-content: flex-end;
}

.noticeStack {
	grid-area: notice;
	padding: 12px var(--ai-pane-gutter) 0;
}

.messages {
	grid-area: messages;
	min-height: 0;
	overflow-y: auto;
	padding: 24px var(--ai-pane-gutter);
	scrollbar-gutter: stable;
	overscroll-behavior: contain;
}

.loadOlderMessages {
	display: flex;
	width: fit-content;
	margin: 0 auto 18px;
}

.emptyState {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 14px;
	min-height: 320px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 1.1em;
}

.emptyState i {
	font-size: 2.4em;
	color: var(--MI_THEME-accent);
}

.suggestions {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	justify-content: center;
	max-width: 560px;
}

.suggestion {
	padding: 8px 14px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 999px;
	font-size: 0.85rem;
	color: var(--MI_THEME-fg);
}

.suggestion:hover {
	background: var(--MI_THEME-buttonHoverBg);
}

.messageRow {
	display: grid;
	grid-template-columns: 34px minmax(0, 1fr);
	gap: 12px;
	margin: 0 0 22px;
}

.messageRowUser {
	--message-accent: var(--MI_THEME-accent);
}

.messageRowAssistant {
	--message-accent: var(--MI_THEME-fg);
}

.avatar {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: 50%;
	background: var(--MI_THEME-panel);
	color: var(--message-accent);
}

.avatarUser {
	background: color-mix(in srgb, var(--MI_THEME-accent) 16%, var(--MI_THEME-panel));
}

.avatarAssistant {
	border: 1px solid var(--MI_THEME-divider);
}

.messageBody {
	min-width: 0;
	padding-top: 4px;
}

.messageMeta {
	display: flex;
	align-items: center;
	gap: 10px;
	margin-bottom: 6px;
	font-weight: 700;
	font-size: 0.92em;
}

.messageError {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: var(--MI_THEME-error);
	font-weight: 400;
}

.messageContent {
	overflow-wrap: anywhere;
	line-height: 1.65;
}

.userContent {
	white-space: pre-wrap;
}

.cursor {
	display: inline-block;
	width: 8px;
	height: 1.05em;
	margin-left: 2px;
	vertical-align: text-bottom;
	background: var(--MI_THEME-accent);
	animation: aiCursorBlink 1s steps(2, start) infinite;
}

@keyframes aiCursorBlink {
	0% { opacity: 1; }
	50% { opacity: 0; }
	100% { opacity: 1; }
}

.thinking {
	display: inline-flex;
	gap: 4px;
	padding: 6px 0;
}

.thinking span {
	width: 7px;
	height: 7px;
	border-radius: 50%;
	background: var(--MI_THEME-fgTransparentWeak);
	animation: aiThinking 1.2s infinite ease-in-out;
}

.thinking span:nth-child(2) { animation-delay: 0.15s; }
.thinking span:nth-child(3) { animation-delay: 0.3s; }

@keyframes aiThinking {
	0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
	30% { transform: translateY(-5px); opacity: 1; }
}

.usage {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	margin-top: 8px;
	font-size: 0.78em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.messageActions {
	display: flex;
	gap: 4px;
	margin-top: 8px;
	opacity: 0.6;
}

.messageActions:hover {
	opacity: 1;
}

.iconButton,
.composerIconButton {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	border-radius: var(--MI-radius-xs);
	color: var(--MI_THEME-fg);
}

.iconButton:hover,
.composerIconButton:hover {
	background: var(--MI_THEME-buttonHoverBg);
}

.attachments,
.pendingAttachments {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	margin-top: 10px;
}

.attachment,
.pendingAttachment {
	display: flex;
	align-items: center;
	gap: 8px;
	max-width: min(260px, 100%);
	padding: 6px 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius-xs);
	color: var(--MI_THEME-fg);
	text-decoration: none;
}

.attachment img,
.pendingAttachment img {
	width: 44px;
	height: 44px;
	object-fit: cover;
	border-radius: var(--MI-radius-xs);
}

.attachment span,
.pendingAttachment span {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.pendingAttachments {
	grid-area: attachments;
	padding: 10px var(--ai-pane-gutter) 0;
}

.pendingAttachment button {
	display: grid;
	place-items: center;
	width: 26px;
	height: 26px;
	margin-left: auto;
}

.composer {
	grid-area: composer;
	display: grid;
	grid-template-columns: 40px minmax(0, 1fr) 40px;
	gap: 8px;
	align-items: end;
	margin: 14px var(--ai-pane-gutter) 18px;
	padding: 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
	box-shadow: 0 -8px 24px color-mix(in srgb, var(--MI_THEME-bg) 72%, transparent);
	box-sizing: border-box;
}

.textarea {
	display: block;
	width: 100%;
	height: calc(1.5em * 3 + 18px);
	min-height: calc(1.5em * 3 + 18px);
	max-height: calc(1.5em * 3 + 18px);
	padding: 9px 6px;
	border: 0;
	outline: 0;
	box-sizing: border-box;
	resize: none;
	overflow-y: auto;
	background: transparent;
	color: var(--MI_THEME-fg);
	font: inherit;
	line-height: 1.5;
}

.sendButton {
	background: var(--MI_THEME-accent);
	color: var(--MI_THEME-fgOnAccent);
}

.sendButton:disabled {
	opacity: 0.45;
}

@media (max-width: 850px) {
	.root {
		grid-template-columns: 1fr;
		grid-template-rows: auto minmax(0, 1fr);
		height: var(--ai-content-height);
		min-height: 0;
	}

	.sidebar {
		max-height: 180px;
		border-right: 0;
		border-bottom: 1px solid var(--MI_THEME-divider);
		overflow-y: auto;
	}

	.topbar {
		align-items: stretch;
		flex-direction: column;
	}

	.modelControls {
		grid-template-columns: 1fr;
	}

	.topActions {
		justify-content: stretch;
	}

	.messages {
		min-height: 0;
		padding: 18px 14px;
	}

	.noticeStack {
		padding: 10px 14px 0;
	}

	.pendingAttachments {
		padding: 10px 14px 0;
	}

	.composer {
		margin: 12px 14px calc(16px + var(--ai-mobile-footer-height));
	}
}
</style>
