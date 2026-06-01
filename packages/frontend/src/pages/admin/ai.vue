<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkInfo>{{ i18n.ts._ai.adminPrivacyNote }}</MkInfo>

				<MkFolder :defaultOpen="true">
					<template #icon><i class="ti ti-adjustments"></i></template>
					<template #label>{{ i18n.ts._ai.settings }}</template>
					<template #caption>{{ settings.enableAi ? i18n.ts.enabled : i18n.ts.disabled }}</template>

					<div class="_gaps_m">
						<MkSwitch v-model="settings.enableAi">
							<template #label>{{ i18n.ts._ai.enable }}</template>
							<template #caption>{{ i18n.ts._ai.enableDescription }}</template>
						</MkSwitch>

						<MkSwitch v-model="settings.showAiInNavbar">
							<template #label>{{ i18n.ts._ai.showInNavbar }}</template>
							<template #caption>{{ i18n.ts._ai.showInNavbarDescription }}</template>
						</MkSwitch>

						<MkSelect v-model="settings.aiDefaultProviderId" :items="providerSelectItems">
							<template #label>{{ i18n.ts._ai.defaultProvider }}</template>
							<template #caption>{{ i18n.ts._ai.defaultProviderDescription }}</template>
						</MkSelect>

						<MkInput v-model="settings.aiMaxContextMessages" type="number" :min="1" :max="100">
							<template #prefix><i class="ti ti-messages"></i></template>
							<template #label>{{ i18n.ts._ai.contextMessages }}</template>
							<template #caption>{{ i18n.ts._ai.contextMessagesDescription }}</template>
						</MkInput>

						<div class="_buttons">
							<MkButton primary rounded :wait="savingSettings" @click="saveSettings"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton rounded @click="reload"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
						</div>
					</div>
				</MkFolder>

				<MkFolder :defaultOpen="providers.length === 0">
					<template #icon><i class="ti ti-plus"></i></template>
					<template #label>{{ i18n.ts._ai.addProvider }}</template>

					<div class="_gaps_m">
						<div :class="$style.grid">
							<MkInput v-model="newProvider.name">
								<template #prefix><i class="ti ti-tag"></i></template>
								<template #label>{{ i18n.ts.name }}</template>
							</MkInput>
							<MkInput v-model="newProvider.baseUrl" placeholder="https://example.com/v1">
								<template #prefix><i class="ti ti-link"></i></template>
								<template #label>{{ i18n.ts._ai.baseUrl }}</template>
							</MkInput>
						</div>

						<MkInput v-model="newProvider.apiKey" type="password" autocomplete="new-password">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>{{ i18n.ts._ai.apiKey }}</template>
						</MkInput>

						<div :class="$style.grid">
							<MkInput v-model="newProvider.timeoutMs" type="number" :min="1000" :max="120000">
								<template #label>{{ i18n.ts._ai.timeout }}</template>
							</MkInput>
							<MkInput v-model="newProvider.maxTokens" type="number" :min="1" :max="128000">
								<template #label>{{ i18n.ts._ai.maxTokens }}</template>
							</MkInput>
							<MkInput v-model="newProvider.temperature" type="number" :min="0" :max="2" step="0.1">
								<template #label>{{ i18n.ts._ai.temperature }}</template>
							</MkInput>
						</div>

						<MkButton primary rounded :disabled="!newProvider.name || !newProvider.baseUrl" :wait="creating" @click="createProvider"><i class="ti ti-plus"></i> {{ i18n.ts._ai.addProvider }}</MkButton>
					</div>
				</MkFolder>

				<div v-if="providers.length === 0" :class="$style.empty">
					<i class="ti ti-robot"></i>
					<div>{{ i18n.ts._ai.noProviders }}</div>
				</div>

				<MkFolder v-for="provider in providers" :key="provider.id" :defaultOpen="false">
					<template #icon><i class="ti ti-server"></i></template>
					<template #label>{{ provider.name }}</template>
					<template #caption>{{ provider.baseUrl }}</template>
					<template #suffix>
						<span :class="[provider.isEnabled ? $style.enabled : $style.disabled]">{{ provider.isEnabled ? i18n.ts.enabled : i18n.ts.disabled }}</span>
					</template>

					<div class="_gaps_m">
						<MkSwitch v-model="provider.isEnabled">
							<template #label>{{ i18n.ts._ai.providerEnabled }}</template>
						</MkSwitch>

						<div :class="$style.grid">
							<MkInput v-model="provider.name">
								<template #prefix><i class="ti ti-tag"></i></template>
								<template #label>{{ i18n.ts.name }}</template>
							</MkInput>
							<MkInput v-model="provider.baseUrl">
								<template #prefix><i class="ti ti-link"></i></template>
								<template #label>{{ i18n.ts._ai.baseUrl }}</template>
							</MkInput>
						</div>

						<MkInput v-model="provider.apiKeyInput" type="password" :placeholder="provider.maskedApiKey ?? i18n.ts._ai.newKey" autocomplete="new-password">
							<template #prefix><i class="ti ti-key"></i></template>
							<template #label>{{ i18n.ts._ai.apiKey }}</template>
							<template #caption>{{ i18n.ts._ai.apiKeyKeepBlank }}</template>
						</MkInput>

						<div :class="$style.grid">
							<MkInput v-model="provider.timeoutMs" type="number" :min="1000" :max="120000">
								<template #label>{{ i18n.ts._ai.timeout }}</template>
							</MkInput>
							<MkInput v-model="provider.maxTokens" type="number" :min="1" :max="128000">
								<template #label>{{ i18n.ts._ai.maxTokens }}</template>
							</MkInput>
							<MkInput v-model="provider.temperature" type="number" :min="0" :max="2" step="0.1">
								<template #label>{{ i18n.ts._ai.temperature }}</template>
							</MkInput>
						</div>

						<MkInput v-model="provider.defaultModel" :datalist="provider.models">
							<template #prefix><i class="ti ti-brain"></i></template>
							<template #label>{{ i18n.ts._ai.defaultModel }}</template>
						</MkInput>

						<MkTextarea v-model="provider.allowedModelsText" code>
							<template #label>{{ i18n.ts._ai.allowedModels }}</template>
							<template #caption>{{ i18n.ts._ai.allowedModelsDescription }}</template>
						</MkTextarea>

						<div v-if="provider.models.length > 0" :class="$style.modelChips">
							<button
								v-for="model in provider.models"
								:key="model"
								class="_button"
								:class="[$style.modelChip, { [$style.modelChipActive]: selectedAllowedModels(provider).includes(model) }]"
								@click="toggleAllowedModel(provider, model)"
							>
								{{ model }}
							</button>
						</div>

						<div v-if="provider.lastResult" :class="[provider.lastResult.ok ? $style.resultOk : $style.resultNg]">
							<i :class="provider.lastResult.ok ? 'ti ti-circle-check' : 'ti ti-alert-circle'"></i>
							<span>{{ provider.lastResult.ok ? i18n.tsx._ai.connectedIn({ ms: provider.lastResult.elapsedMs }) : i18n.tsx._ai.testFailedIn({ ms: provider.lastResult.elapsedMs, error: provider.lastResult.error ?? '' }) }}</span>
						</div>

						<div class="_buttons">
							<MkButton primary rounded :wait="savingId === provider.id" @click="saveProvider(provider)"><i class="ti ti-device-floppy"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton rounded :wait="testingId === provider.id" @click="testProvider(provider)"><i class="ti ti-plug-connected"></i> {{ i18n.ts._ai.test }}</MkButton>
							<MkButton rounded :wait="fetchingModelsId === provider.id" @click="fetchModels(provider)"><i class="ti ti-cloud-download"></i> {{ i18n.ts._ai.fetchModels }}</MkButton>
							<MkButton danger rounded :wait="deletingId === provider.id" @click="deleteProvider(provider)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</MkButton>
						</div>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, ref } from 'vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkButton from '@/components/MkButton.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import FormSuspense from '@/components/form/suspense.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { fetchInstance } from '@/instance.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';

type AiProvider = {
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
	apiKeyInput: string | null;
	allowedModelsText: string;
	lastResult?: ProviderTestResult | null;
};

type AiSettings = {
	enableAi: boolean;
	showAiInNavbar: boolean;
	aiDefaultProviderId: string | null;
	aiMaxContextMessages: number;
};

type ProviderTestResult = {
	ok: boolean;
	models: string[];
	elapsedMs: number;
	error: string | null;
};

const providers = ref<AiProvider[]>([]);
const settings = ref<AiSettings>({
	enableAi: false,
	showAiInNavbar: false,
	aiDefaultProviderId: null,
	aiMaxContextMessages: 20,
});

const newProvider = ref({
	name: '',
	baseUrl: '',
	apiKey: '',
	timeoutMs: 30000,
	maxTokens: 1024,
	temperature: 0.7,
});

const savingSettings = ref(false);
const creating = ref(false);
const savingId = ref<string | null>(null);
const testingId = ref<string | null>(null);
const fetchingModelsId = ref<string | null>(null);
const deletingId = ref<string | null>(null);

const providerSelectItems = computed(() => [
	{ value: null, label: i18n.ts._ai.automatic },
	...providers.value.map(provider => ({ value: provider.id, label: provider.name })),
]);

function hydrateProvider(provider: AiProvider): AiProvider {
	return {
		...provider,
		apiKeyInput: '',
		allowedModelsText: provider.allowedModels.join('\n'),
		lastResult: provider.lastResult ?? null,
	};
}

function parseModels(text: string | null | undefined): string[] {
	return Array.from(new Set((text ?? '')
		.split(/[\n,]/)
		.map(model => model.trim())
		.filter(Boolean)));
}

function selectedAllowedModels(provider: AiProvider): string[] {
	return parseModels(provider.allowedModelsText);
}

function toggleAllowedModel(provider: AiProvider, model: string) {
	const models = selectedAllowedModels(provider);
	const next = models.includes(model)
		? models.filter(item => item !== model)
		: [...models, model];
	provider.allowedModelsText = next.join('\n');
}

async function init() {
	const [settingsRes, providersRes] = await Promise.all([
		misskeyApi<AiSettings>('admin/ai/settings/show'),
		misskeyApi<AiProvider[]>('admin/ai/providers/list'),
	]);
	settings.value = settingsRes;
	providers.value = providersRes.map(hydrateProvider);
}

async function reload() {
	await init();
	os.toast(i18n.ts.saved);
}

async function saveSettings() {
	savingSettings.value = true;
	try {
		settings.value = await os.apiWithDialog<AiSettings>('admin/ai/settings/update', {
			enableAi: settings.value.enableAi,
			showAiInNavbar: settings.value.showAiInNavbar,
			aiDefaultProviderId: settings.value.aiDefaultProviderId,
			aiMaxContextMessages: Number(settings.value.aiMaxContextMessages),
		});
		await os.promiseDialog(fetchInstance(true));
	} finally {
		savingSettings.value = false;
	}
}

async function createProvider() {
	creating.value = true;
	try {
		const provider = await os.apiWithDialog<AiProvider>('admin/ai/providers/create', {
			name: newProvider.value.name,
			baseUrl: newProvider.value.baseUrl,
			apiKey: newProvider.value.apiKey,
			isEnabled: true,
			timeoutMs: Number(newProvider.value.timeoutMs),
			maxTokens: Number(newProvider.value.maxTokens),
			temperature: Number(newProvider.value.temperature),
		});
		providers.value = [hydrateProvider(provider), ...providers.value];
		newProvider.value = {
			name: '',
			baseUrl: '',
			apiKey: '',
			timeoutMs: 30000,
			maxTokens: 1024,
			temperature: 0.7,
		};
		if (!settings.value.aiDefaultProviderId) {
			settings.value.aiDefaultProviderId = provider.id;
		}
	} finally {
		creating.value = false;
	}
}

async function saveProvider(provider: AiProvider) {
	savingId.value = provider.id;
	try {
		const updated = await os.apiWithDialog<AiProvider>('admin/ai/providers/update', {
			id: provider.id,
			name: provider.name,
			baseUrl: provider.baseUrl,
			apiKey: provider.apiKeyInput?.trim() ? provider.apiKeyInput : null,
			isEnabled: provider.isEnabled,
			defaultModel: provider.defaultModel,
			allowedModels: selectedAllowedModels(provider),
			timeoutMs: Number(provider.timeoutMs),
			maxTokens: Number(provider.maxTokens),
			temperature: Number(provider.temperature),
		});
		Object.assign(provider, hydrateProvider({
			...updated,
			lastResult: provider.lastResult,
		}));
		await fetchInstance(true);
	} finally {
		savingId.value = null;
	}
}

async function testProvider(provider: AiProvider) {
	testingId.value = provider.id;
	try {
		provider.lastResult = await misskeyApi<ProviderTestResult>('admin/ai/providers/test', {
			id: provider.id,
		});
	} catch (err: any) {
		provider.lastResult = {
			ok: false,
			models: [],
			elapsedMs: 0,
			error: err?.message ?? String(err),
		};
	} finally {
		testingId.value = null;
	}
}

async function fetchModels(provider: AiProvider) {
	fetchingModelsId.value = provider.id;
	try {
		const result = await misskeyApi<ProviderTestResult & { provider: AiProvider }>('admin/ai/providers/fetch-models', {
			id: provider.id,
		});
		Object.assign(provider, hydrateProvider({
			...result.provider,
			lastResult: result,
		}));
	} catch (err: any) {
		provider.lastResult = {
			ok: false,
			models: [],
			elapsedMs: 0,
			error: err?.message ?? String(err),
		};
	} finally {
		fetchingModelsId.value = null;
	}
}

async function deleteProvider(provider: AiProvider) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.delete,
		text: i18n.tsx.deleteAreYouSure({ x: provider.name }),
	});
	if (canceled) return;

	deletingId.value = provider.id;
	try {
		await os.apiWithDialog('admin/ai/providers/delete', {
			id: provider.id,
		});
		providers.value = providers.value.filter(item => item.id !== provider.id);
		if (settings.value.aiDefaultProviderId === provider.id) {
			settings.value.aiDefaultProviderId = null;
		}
		await fetchInstance(true);
	} finally {
		deletingId.value = null;
	}
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts._ai.title,
	icon: 'ti ti-robot',
}));
</script>

<style lang="scss" module>
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 16px;
}

.empty {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 10px;
	min-height: 120px;
	color: var(--MI_THEME-fgTransparentWeak);
	border: 1px dashed var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
}

.enabled {
	color: var(--MI_THEME-success);
}

.disabled {
	color: var(--MI_THEME-fgTransparentWeak);
}

.modelChips {
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
}

.modelChip {
	max-width: 100%;
	padding: 6px 10px;
	border-radius: var(--MI-radius-xs);
	background: var(--MI_THEME-buttonBg);
	color: var(--MI_THEME-fg);
	overflow-wrap: anywhere;
}

.modelChipActive {
	background: color-mix(in srgb, var(--MI_THEME-accent) 18%, var(--MI_THEME-buttonBg));
	color: var(--MI_THEME-accent);
}

.resultOk,
.resultNg {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 10px 12px;
	border-radius: var(--MI-radius-xs);
}

.resultOk {
	background: color-mix(in srgb, var(--MI_THEME-success) 14%, transparent);
	color: var(--MI_THEME-success);
}

.resultNg {
	background: color-mix(in srgb, var(--MI_THEME-error) 14%, transparent);
	color: var(--MI_THEME-error);
}
</style>
