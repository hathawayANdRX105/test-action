<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<SearchMarker path="/settings/connect" label="开发者中心" :keywords="['developer', 'oauth', 'oidc', 'api', 'token', 'webhook']" icon="ti ti-api">
	<div class="_gaps_m">
		<MkFeatureBanner icon="/client-assets/link_3d.png" color="#1d9bf0">
			<SearchKeyword>开发者中心：创建快捷登录应用、个人 API Token，查看发帖、删帖和 OAuth 登录接入示例。</SearchKeyword>
		</MkFeatureBanner>

			<SearchMarker :keywords="['status', 'access']">
				<FormSection>
					<template #label><i class="ti ti-plug"></i> <SearchLabel>API 使用状态</SearchLabel></template>
					<div class="_gaps_s">
						<div :class="$style.statusGrid">
							<div :class="$style.statusCard">
								<span>当前模式</span>
								<strong>{{ modeLabel }}</strong>
							</div>
							<div :class="$style.statusCard">
								<span>我的资格</span>
								<strong>{{ grantLabel }}</strong>
							</div>
							<div :class="$style.statusCard">
								<span>OAuth/OIDC</span>
								<strong>{{ accessStatus?.oauthEnabled ? '已启用' : '未启用' }} / {{ accessStatus?.oidcEnabled ? '已启用' : '未启用' }}</strong>
							</div>
						</div>

						<MkInfo v-if="accessStatus?.mode === 'closed'" warn>管理员当前关闭了第三方 API。站内正常登录和浏览不受影响。</MkInfo>
						<MkInfo v-else-if="needsApproval" warn>此实例需要管理员审核 API 使用申请。通过后才能创建应用和 Token。</MkInfo>

						<div v-if="needsApproval" class="_gaps_s">
							<MkTextarea v-model="accessReason">
								<template #label>申请用途</template>
								<template #caption>说明你的网站、机器人或资源发布场景，方便管理员审核。</template>
							</MkTextarea>
							<MkApiScopePicker
								v-if="(accessStatus?.publicPermissions?.length ?? 0) > 0"
								v-model="accessPermissions"
								:availableScopes="accessStatus!.publicPermissions"
								:noApprovalScopes="accessStatus!.noApprovalPermissions"
								:mode="accessStatus!.mode"
							/>
							<MkButton primary rounded :disabled="!accessReason.trim()" :wait="requestingAccess" @click="requestAccess">
								<i class="ti ti-send"></i> 提交 API 使用申请
							</MkButton>
						</div>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['oauth', 'oidc', 'app', 'login']">
				<FormSection>
					<template #label><i class="ti ti-apps"></i> <SearchLabel>创建 OAuth/OIDC 登录应用</SearchLabel></template>
					<div class="_gaps_m">
						<MkInfo>每个应用必须填写自己的 OAuth/OIDC 回调地址。生产环境必须使用 HTTPS，本地开发可使用 localhost 或 127.0.0.1。</MkInfo>

						<div :class="$style.templateGrid">
							<button
								v-for="template in appTemplates"
								:key="template.key"
								class="_button"
								:class="[$style.templateCard, { [$style.templateActive]: selectedTemplateKey === template.key }]"
								@click="applyAppTemplate(template)"
							>
								<i :class="template.icon"></i>
								<strong>{{ template.title }}</strong>
								<span>{{ template.caption }}</span>
								<small>{{ template.permissions.join(', ') }}</small>
							</button>
						</div>

						<div :class="$style.formGrid">
							<MkInput v-model="newAppName">
								<template #prefix><i class="ti ti-tag"></i></template>
								<template #label>应用名称</template>
							</MkInput>
							<MkInput v-model="newAppCallbackUrl" :placeholder="defaultAppCallbackPlaceholder">
								<template #prefix><i class="ti ti-link"></i></template>
								<template #label>OAuth/OIDC 回调地址</template>
								<template #caption>第三方网站发起 OAuth 登录时使用的 <code>redirect_uri</code>，必须与这里完全一致。这个地址由应用所有者填写，管理员不会代填。</template>
							</MkInput>
						</div>

						<MkTextarea v-model="newAppDescription">
							<template #label>应用说明</template>
						</MkTextarea>
						<div :class="$style.pickerBlock">
							<div :class="$style.pickerLabel">应用权限范围（用户在授权页会看到这些；模板按钮可快捷填充）</div>
							<MkApiScopePicker
								v-model="newAppPermissions"
								:availableScopes="accessStatus?.publicPermissions ?? []"
								:noApprovalScopes="accessStatus?.noApprovalPermissions ?? []"
								:mode="accessStatus?.mode ?? 'open'"
							/>
						</div>
						<MkButton primary rounded :disabled="!canCreateApp" :wait="creatingApp" @click="createApp">
							<i class="ti ti-plus"></i> 创建应用
						</MkButton>

						<MkFolder :defaultOpen="apps.length > 0">
							<template #icon><i class="ti ti-apps"></i></template>
							<template #label>我的应用</template>
							<template #caption>{{ apps.length }} 个</template>
							<div v-if="apps.length === 0" :class="$style.empty">还没有创建应用。</div>
							<div v-else class="_gaps_s">
								<div v-for="app in apps" :key="app.id" :class="$style.item">
									<div>
										<strong>{{ app.name }}</strong>
										<div :class="$style.meta">{{ app.status }} · {{ (app.permission ?? []).join(', ') }}</div>
										<div :class="$style.meta">{{ (app.callbackUrls ?? [app.callbackUrl]).filter(Boolean).join(', ') }}</div>
									</div>
									<div class="_buttons">
										<MkButton rounded @click="copyText(app.id)">复制 Client ID</MkButton>
										<MkButton v-if="app.secret" rounded @click="copyText(app.secret)">复制 Secret</MkButton>
									</div>
								</div>
							</div>
						</MkFolder>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['token', 'personal', 'api']">
				<FormSection>
					<template #label><i class="ti ti-key"></i> <SearchLabel>个人 API Token</SearchLabel></template>
					<div class="_gaps_m">
						<div :class="$style.templateGrid">
							<button
								v-for="template in tokenTemplates"
								:key="template.key"
								class="_button"
								:class="$style.templateCard"
								@click="applyTokenTemplate(template)"
							>
								<i :class="template.icon"></i>
								<strong>{{ template.title }}</strong>
								<span>{{ template.caption }}</span>
								<small>{{ template.permissions.join(', ') }}</small>
							</button>
						</div>

						<MkInput v-model="newTokenName">
							<template #prefix><i class="ti ti-tag"></i></template>
							<template #label>Token 名称</template>
						</MkInput>
						<div :class="$style.pickerBlock">
							<div :class="$style.pickerLabel">Token 权限范围（模板按钮可快捷填充，可再自定义增减）</div>
							<MkApiScopePicker
								v-model="newTokenPermissions"
								:availableScopes="accessStatus?.publicPermissions ?? []"
								:noApprovalScopes="accessStatus?.noApprovalPermissions ?? []"
								:mode="accessStatus?.mode ?? 'open'"
							/>
						</div>
						<MkButton primary rounded :disabled="!canCreateToken" :wait="creatingToken" @click="createToken">
							<i class="ti ti-plus"></i> 创建 Token
						</MkButton>
						<MkFolder :defaultOpen="tokens.length > 0">
							<template #icon><i class="ti ti-key"></i></template>
							<template #label>我的开发者 Token</template>
							<template #caption>{{ tokens.length }} 个</template>
							<div v-if="tokens.length === 0" :class="$style.empty">还没有创建开发者 Token。</div>
							<div v-else class="_gaps_s">
								<div v-for="token in tokens" :key="token.id" :class="$style.item">
									<div>
										<strong>{{ token.name || token.id }}</strong>
										<div :class="$style.meta">{{ token.status }} · {{ (token.permission ?? []).join(', ') }}</div>
										<div :class="$style.meta">最后使用：{{ token.lastUsedAt ?? '未使用' }}</div>
									</div>
									<MkButton danger rounded @click="revokeToken(token.id)">撤销</MkButton>
								</div>
							</div>
						</MkFolder>
					</div>
				</FormSection>
			</SearchMarker>

			<SearchMarker :keywords="['docs', 'examples', 'notes', 'delete']">
				<FormSection>
					<template #label><i class="ti ti-book"></i> <SearchLabel>接入文档与示例</SearchLabel></template>
					<div class="_gaps_m">
						<div :class="$style.docList">
							<div v-for="ex in docExamples" :key="ex.path" :class="$style.docCard">
								<div :class="$style.docHead">
									<i :class="ex.icon"></i>
									<strong>{{ ex.title }}</strong>
									<span :class="$style.docMethod">{{ ex.method }}</span>
									<code :class="$style.docPath">{{ ex.path }}</code>
								</div>
								<div :class="$style.docScopes">
									<span :class="$style.docScopesLabel">需要权限：</span>
									<code v-for="s in ex.scopes" :key="s" :class="$style.docScopeTag" :title="s">{{ scopeLabel(s) }} · {{ s }}</code>
								</div>
								<div :class="$style.docDesc">{{ ex.desc }}</div>
								<div :class="$style.docCodeWrap">
									<pre :class="$style.docCode">{{ ex.curl }}</pre>
									<MkButton rounded small :class="$style.docCopy" @click="copyText(ex.curl)"><i class="ti ti-copy"></i> 复制</MkButton>
								</div>
							</div>
						</div>
						<FormLink to="/api-console" :behavior="isDesktop ? 'window' : null">打开 API Console</FormLink>
						<FormLink to="/api-doc" :behavior="isDesktop ? 'window' : null">查看 OpenAPI 文档</FormLink>
					</div>
				</FormSection>
			</SearchMarker>

		<SearchMarker :keywords="['webhook']">
			<FormSection>
				<template #label><i class="ti ti-webhook"></i> <SearchLabel>{{ i18n.ts._settings.webhook }}</SearchLabel></template>

				<div class="_gaps_m">
					<FormLink :to="`/settings/webhook/new`">
						{{ i18n.ts._webhookSettings.createWebhook }}
					</FormLink>

					<MkFolder :defaultOpen="false">
						<template #label>{{ i18n.ts.manage }}</template>

						<MkPagination :pagination="pagination">
							<template #default="{items}">
								<div class="_gaps">
									<FormLink v-for="webhook in items" :key="webhook.id" :to="`/settings/webhook/edit/${webhook.id}`">
										<template #icon>
											<i v-if="webhook.active === false" class="ti ti-player-pause"></i>
											<i v-else-if="webhook.latestStatus === null" class="ti ti-circle"></i>
											<i v-else-if="[200, 201, 204].includes(webhook.latestStatus)" class="ti ti-check" :style="{ color: 'var(--MI_THEME-success)' }"></i>
											<i v-else class="ti ti-alert-triangle" :style="{ color: 'var(--MI_THEME-error)' }"></i>
										</template>
										{{ webhook.name || webhook.url }}
										<template #suffix>
											<MkTime v-if="webhook.latestSentAt" :time="webhook.latestSentAt"></MkTime>
										</template>
									</FormLink>
								</div>
							</template>
						</MkPagination>
					</MkFolder>
				</div>
			</FormSection>
		</SearchMarker>
	</div>
</SearchMarker>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import MkPagination from '@/components/MkPagination.vue';
import FormSection from '@/components/form/section.vue';
import FormLink from '@/components/form/link.vue';
import MkFeatureBanner from '@/components/MkFeatureBanner.vue';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkApiScopePicker from '@/components/MkApiScopePicker.vue';
import { scopeLabel } from '@/utility/api-permissions.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

type ApiAccessStatus = {
	mode: 'approval' | 'open' | 'closed';
	oauthEnabled: boolean;
	oidcEnabled: boolean;
	requireAppApproval: boolean;
	publicPermissions: string[];
	noApprovalPermissions: string[];
	defaultTokenRateLimit: number;
	writeTokenRateLimit: number;
	grant: null | {
		status: 'none' | 'pending' | 'approved' | 'rejected' | 'suspended';
		reason: string | null;
		reviewNote: string | null;
	};
	effectiveStatus: string;
};

type ApiApp = {
	id: string;
	name: string;
	secret?: string;
	status: string;
	callbackUrl: string | null;
	callbackUrls?: string[];
	permission: string[];
};

type ApiToken = {
	id: string;
	name: string | null;
	status: string;
	permission: string[];
	lastUsedAt: string | null;
};

type Template = {
	key: string;
	title: string;
	caption: string;
	icon: string;
	permissions: string[];
};

const isDesktop = ref(window.innerWidth >= 1100);
const accessStatus = ref<ApiAccessStatus | null>(null);
const apps = ref<ApiApp[]>([]);
const tokens = ref<ApiToken[]>([]);
const requestingAccess = ref(false);
const creatingApp = ref(false);
const creatingToken = ref(false);
const accessReason = ref('');
const accessPermissions = ref<string[]>([]);
const newAppName = ref('');

// 创建 OAuth 应用 / 个人 Token 时的精细权限选择（模板只是快捷填充）。
const newAppPermissions = ref<string[]>([]);
const newTokenName = ref('');
const newTokenPermissions = ref<string[]>([]);
const newAppCallbackUrl = ref('');
const newAppDescription = ref('');
const selectedTemplateKey = ref('login');

const appTemplates: Template[] = [{
	key: 'login',
	title: '快捷登录',
	caption: '第三方网站用本站账号登录',
	icon: 'ti ti-login',
	permissions: ['read:profile'],
}, {
	key: 'resources',
	title: '发布资源/发帖',
	caption: '发布社区资源、教程或同步内容',
	icon: 'ti ti-pencil-plus',
	permissions: ['write:notes'],
}, {
	key: 'upload',
	title: '发帖 + 上传附件',
	caption: '发布带图片或文件的资源',
	icon: 'ti ti-photo-plus',
	permissions: ['write:notes', 'write:drive'],
}, {
	key: 'bot',
	title: '机器人/自动同步',
	caption: '自动发布和读取通知状态',
	icon: 'ti ti-robot',
	permissions: ['read:account', 'write:notes', 'read:notifications'],
}];

const tokenTemplates = appTemplates.filter(template => template.key !== 'login');

const selectedTemplate = computed(() => appTemplates.find(template => template.key === selectedTemplateKey.value) ?? appTemplates[0]);
const needsApproval = computed(() => accessStatus.value?.mode === 'approval' && accessStatus.value.effectiveStatus !== 'approved');
const canCreateApp = computed(() => Boolean(newAppName.value.trim() && newAppCallbackUrl.value.trim() && newAppPermissions.value.length > 0 && accessStatus.value?.mode !== 'closed' && !needsApproval.value));
const canCreateToken = computed(() => Boolean(newTokenName.value.trim() && newTokenPermissions.value.length > 0 && accessStatus.value?.mode !== 'closed' && !needsApproval.value));

function applyAppTemplate(template: Template) {
	selectedTemplateKey.value = template.key;
	newAppPermissions.value = [...template.permissions];
}

const apiHost = window.location.host;

type DocExample = { title: string; icon: string; scopes: string[]; method: string; path: string; curl: string; desc: string; };
const docExamples = computed<DocExample[]>(() => [
	{
		title: '快捷登录 OAuth/OIDC', icon: 'ti ti-login', scopes: ['read:profile'], method: 'GET', path: '/oauth/authorize',
		curl: `https://${apiHost}/oauth/authorize?client_id=<CLIENT_ID>&response_type=code&redirect_uri=<回调地址>&scope=read:profile&code_challenge=<PKCE>&code_challenge_method=S256`,
		desc: '第三方网站用本站账号登录。用户资料只从 /oauth/userinfo 获取，建议用最小的 read:profile。',
	},
	{
		title: '发帖', icon: 'ti ti-pencil', scopes: ['write:notes'], method: 'POST', path: '/api/notes/create',
		curl: `curl -X POST https://${apiHost}/api/notes/create \\\n  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \\\n  -d '{"text":"hello world","visibility":"public"}'`,
		desc: '创建一条帖子。visibility 可选 public/home/followers/specified。',
	},
	{
		title: '删帖', icon: 'ti ti-trash', scopes: ['write:notes'], method: 'POST', path: '/api/notes/delete',
		curl: `curl -X POST https://${apiHost}/api/notes/delete \\\n  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \\\n  -d '{"noteId":"<NOTE_ID>"}'`,
		desc: '删除自己有权限删除的帖子（频道主可删本频道内的帖子）。',
	},
	{
		title: '上传文件到网盘', icon: 'ti ti-cloud-upload', scopes: ['write:drive'], method: 'POST', path: '/api/drive/files/create',
		curl: `curl -X POST https://${apiHost}/api/drive/files/create \\\n  -H "Authorization: Bearer <TOKEN>" \\\n  -F file=@./image.png`,
		desc: '上传附件，返回文件对象（含 id、url），可用于发帖的 fileIds。',
	},
	{
		title: '读取通知', icon: 'ti ti-bell', scopes: ['read:notifications'], method: 'POST', path: '/api/i/notifications',
		curl: `curl -X POST https://${apiHost}/api/i/notifications \\\n  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d '{"limit":20}'`,
		desc: '拉取当前用户的通知列表。',
	},
	{
		title: '发送聊天消息', icon: 'ti ti-messages', scopes: ['write:chat'], method: 'POST', path: '/api/chat/messages/create-to-room',
		curl: `curl -X POST https://${apiHost}/api/chat/messages/create-to-room \\\n  -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" \\\n  -d '{"toRoomId":"<ROOM_ID>","text":"hi"}'`,
		desc: '向聊天房间发送消息（私聊用 create-to-user）。',
	},
]);

function applyTokenTemplate(template: Template) {
	newTokenName.value = template.title;
	newTokenPermissions.value = [...template.permissions];
}
const defaultAppCallbackPlaceholder = computed(() => `${window.location.origin}/oauth/callback`);
const modeLabel = computed(() => ({
	open: '开放使用',
	approval: '申请使用',
	closed: '关闭使用',
}[accessStatus.value?.mode ?? 'open']));
const grantLabel = computed(() => ({
	approved: '已通过',
	pending: '待审核',
	rejected: '已拒绝',
	suspended: '已暂停',
	none: '未申请',
}[accessStatus.value?.effectiveStatus ?? 'none'] ?? '未申请'));

const pagination = {
	endpoint: 'i/webhooks/list' as const,
	limit: 100,
	noPaging: true,
};

async function reload() {
	[accessStatus.value, apps.value, tokens.value] = await Promise.all([
		misskeyApi<ApiAccessStatus>('api/access/status', {}),
		misskeyApi<ApiApp[]>('api/apps/list', {}),
		misskeyApi<ApiToken[]>('api/tokens/list', {}),
	]);
}

async function requestAccess() {
	requestingAccess.value = true;
	try {
		await misskeyApi('api/access/request', { reason: accessReason.value.trim(), permissions: accessPermissions.value });
		await reload();
		os.toast('已提交 API 使用申请');
	} finally {
		requestingAccess.value = false;
	}
}

async function createApp() {
	creatingApp.value = true;
	try {
		const app = await misskeyApi<ApiApp>('api/apps/create', {
			name: newAppName.value.trim(),
			description: newAppDescription.value.trim(),
			permission: newAppPermissions.value,
			callbackUrls: [newAppCallbackUrl.value.trim()],
		});
		await reload();
		await os.alert({
			type: 'success',
			title: '应用已创建',
			text: `Client ID: ${app.id}\nSecret: ${app.secret ?? ''}`,
			textCopyable: true,
		});
	} finally {
		creatingApp.value = false;
	}
}

async function createToken() {
	if (creatingToken.value || !canCreateToken.value) return;
	creatingToken.value = true;
	try {
		const result = await misskeyApi<{ id: string; token: string }>('api/tokens/create', {
			name: newTokenName.value.trim(),
			description: '',
			permission: newTokenPermissions.value,
			rank: 'user',
		});
		newTokenName.value = '';
		newTokenPermissions.value = [];
		await reload();
		await os.alert({
			type: 'success',
			title: 'Token 已创建',
			text: result.token,
			textCopyable: true,
		});
	} finally {
		creatingToken.value = false;
	}
}

async function revokeToken(tokenId: string) {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: '撤销 Token？',
		text: '撤销后使用这个 Token 的第三方程序会立即失效。',
	});
	if (canceled) return;
	await misskeyApi('api/tokens/revoke', { tokenId });
	await reload();
}

async function copyText(text: string) {
	await navigator.clipboard.writeText(text);
	os.toast('已复制');
}

onMounted(reload);

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: '开发者中心',
	icon: 'ti ti-api',
}));
</script>

<style lang="scss" module>
.statusGrid,
.templateGrid,
.docsGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 12px;
}

.docList {
	display: flex;
	flex-direction: column;
	gap: 12px;
}

.docHead {
	display: flex;
	align-items: center;
	gap: 8px;
	flex-wrap: wrap;
}

.docMethod {
	padding: 1px 8px;
	border-radius: 6px;
	font-size: 0.78em;
	font-weight: 700;
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.docPath {
	font-size: 0.86em;
	opacity: 0.85;
}

.docScopes {
	margin-top: 8px;
	font-size: 0.85em;
}

.docScopesLabel {
	color: var(--MI_THEME-fgTransparentWeak);
}

.docScopeTag {
	display: inline-block;
	margin: 2px 4px 2px 0;
	padding: 1px 8px;
	border-radius: 6px;
	background: var(--MI_THEME-buttonBg);
}

.docDesc {
	margin-top: 6px;
	font-size: 0.88em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.docCodeWrap {
	position: relative;
	margin-top: 8px;
}

.docCode {
	margin: 0;
	padding: 12px 64px 12px 12px;
	border-radius: 8px;
	background: var(--MI_THEME-bg);
	border: solid 1px var(--MI_THEME-divider);
	font-size: 0.82em;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-family: Consolas, Monaco, monospace;
}

.docCopy {
	position: absolute;
	top: 8px;
	right: 8px;
}

.statusCard,
.templateCard,
.docCard,
.item {
	border: 1px solid var(--MI_THEME-divider);
	border-radius: 8px;
	background: var(--MI_THEME-panel);
}

.statusCard {
	padding: 14px;

	> span {
		display: block;
		color: var(--MI_THEME-fgTransparentWeak);
		font-size: 0.85em;
	}

	> strong {
		display: block;
		margin-top: 4px;
	}
}

.templateCard {
	display: grid;
	gap: 8px;
	padding: 14px;
	text-align: left;

	> i {
		font-size: 1.4em;
		color: var(--MI_THEME-accent);
	}

	> span,
	> small {
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.templateActive {
	border-color: var(--MI_THEME-accent);
	box-shadow: 0 0 0 1px var(--MI_THEME-accent);
}

.formGrid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: 12px;
}

.item {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
	padding: 12px;
}

.meta {
	margin-top: 3px;
	color: var(--MI_THEME-fgTransparentWeak);
	font-size: 0.85em;
	overflow-wrap: anywhere;
}

.pickerBlock {
	display: flex;
	flex-direction: column;
	gap: 8px;
	padding: 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.4);
}

.pickerLabel {
	font-size: 0.88em;
	font-weight: 700;
	color: var(--MI_THEME-fg);
}

.reqPermBlock {
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.reqPermLabel {
	font-size: 0.85em;
	color: var(--MI_THEME-fgTransparentWeak);
}

.reqPermChips {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.reqPermChip {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 5px 11px;
	border-radius: 999px;
	font-size: 0.82em;
	border: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);

	&:hover {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&.reqPermChipActive {
		background: var(--MI_THEME-accentedBg);
		border-color: transparent;
		font-weight: 700;
	}
}

.reqPermName {
	max-width: 12em;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.reqPermFlag {
	flex-shrink: 0;
	padding: 0 6px;
	border-radius: 999px;
	font-size: 0.82em;
	font-weight: 700;
	line-height: 1.6;
}

.reqPermFlagFree {
	background: color(from var(--MI_THEME-success) srgb r g b / 0.18);
	color: var(--MI_THEME-success);
}

.reqPermFlagReview {
	background: color(from var(--MI_THEME-warn) srgb r g b / 0.18);
	color: var(--MI_THEME-warn);
}

.docCard {
	display: grid;
	gap: 8px;
	padding: 14px;

	code {
		overflow-wrap: anywhere;
	}

	span {
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.empty {
	padding: 14px;
	color: var(--MI_THEME-fgTransparentWeak);
	text-align: center;
}
</style>
