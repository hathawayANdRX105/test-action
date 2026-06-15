<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1100px;">
		<div class="_gaps">
			<div :class="$style.inputs">
				<MkButton style="margin-left: auto" @click="resetQuery">{{ i18n.ts.reset }}</MkButton>
			</div>
			<div :class="$style.inputs">
				<MkSelect v-model="sort" style="flex: 1;">
					<template #label>{{ i18n.ts.sort }}</template>
					<option value="+createdAt">{{ i18n.ts.registeredDate }} ({{ i18n.ts.descendingOrder }})</option>
					<option value="-createdAt">{{ i18n.ts.registeredDate }} ({{ i18n.ts.ascendingOrder }})</option>
					<option value="+lastActiveDate">{{ i18n.ts.lastActiveDate }} ({{ i18n.ts.descendingOrder }})</option>
					<option value="-lastActiveDate">{{ i18n.ts.lastActiveDate }} ({{ i18n.ts.ascendingOrder }})</option>
					<option value="+notes">{{ i18n.ts.notes }} ({{ i18n.ts.descendingOrder }})</option>
					<option value="-notes">{{ i18n.ts.notes }} ({{ i18n.ts.ascendingOrder }})</option>
					<option value="+follower">{{ i18n.ts.followers }} ({{ i18n.ts.descendingOrder }})</option>
					<option value="-follower">{{ i18n.ts.followers }} ({{ i18n.ts.ascendingOrder }})</option>
					<option value="+updatedAt">{{ i18n.ts.lastUsed }} ({{ i18n.ts.descendingOrder }})</option>
					<option value="-updatedAt">{{ i18n.ts.lastUsed }} ({{ i18n.ts.ascendingOrder }})</option>
				</MkSelect>
				<MkSelect v-model="state" style="flex: 1;">
					<template #label>{{ i18n.ts.state }}</template>
					<option value="all">{{ i18n.ts.all }}</option>
					<option value="available">{{ i18n.ts.normal }}</option>
					<option value="approved">{{ i18n.ts.notApproved }}</option>
					<option value="admin">{{ i18n.ts.administrator }}</option>
					<option value="moderator">{{ i18n.ts.moderator }}</option>
					<option value="suspended">{{ i18n.ts.suspend }}</option>
				</MkSelect>
				<MkSelect v-model="origin" style="flex: 1;">
					<template #label>{{ i18n.ts.instance }}</template>
					<option value="combined">{{ i18n.ts.all }}</option>
					<option value="local">{{ i18n.ts.local }}</option>
					<option value="remote">{{ i18n.ts.remote }}</option>
				</MkSelect>
			</div>
			<div :class="$style.inputs">
				<MkInput v-model="searchUsername" style="flex: 1;" type="text" :spellcheck="false" debounce>
					<template #prefix>@</template>
					<template #label>{{ i18n.ts.username }}</template>
				</MkInput>
				<MkInput v-model="searchHost" style="flex: 1;" type="text" :spellcheck="false" :disabled="origin === 'local'">
					<template #prefix>@</template>
					<template #label>{{ i18n.ts.host }}</template>
				</MkInput>
			</div>
			<div :class="$style.inputs">
				<MkInput v-model="searchEmail" style="flex: 1;" type="search" :spellcheck="false" debounce>
					<template #prefix><i class="ti ti-mail"></i></template>
					<template #label>{{ i18n.ts.email }}</template>
				</MkInput>
				<MkInput v-model="searchIp" style="flex: 1;" type="search" :spellcheck="false" debounce>
					<template #prefix><i class="ti ti-network"></i></template>
					<template #label>{{ i18n.ts.ip }}</template>
				</MkInput>
				<MkInput v-model="searchFingerprint" style="flex: 1;" type="search" :spellcheck="false" debounce>
					<template #prefix><i class="ti ti-fingerprint"></i></template>
					<template #label>{{ i18n.ts.fingerprint }}</template>
				</MkInput>
			</div>

			<MkFolder :sticky="false">
				<template #icon><i class="ti ti-users-group"></i></template>
				<template #label>{{ i18n.ts.bulkAccountDetection }}</template>
				<div class="_gaps_s">
					<div :class="$style.inputs">
						<MkSelect v-model="clusterBy" style="flex: 1;">
							<template #label>{{ i18n.ts.groupDimension }}</template>
							<option value="fingerprint">{{ i18n.ts.fingerprint }}</option>
							<option value="ip">IP</option>
						</MkSelect>
						<MkInput v-model="clusterMin" type="number" :min="2" style="flex: 1;">
							<template #label>{{ i18n.ts.minSharedAccounts }}</template>
						</MkInput>
						<MkButton primary :wait="clustersLoading" @click="loadClusters"><i class="ti ti-search"></i> {{ i18n.ts.search }}</MkButton>
					</div>
					<MkLoading v-if="clustersLoading"/>
					<div v-else-if="clustersLoaded && clusters.length === 0" :class="$style.empty">{{ i18n.ts.nothing }}</div>
					<div v-else class="_gaps_s">
						<div v-for="c of clusters" :key="c.key" :class="$style.cluster">
							<div :class="$style.clusterHead">
								<span :class="$style.clusterCount">{{ c.userCount }}</span>
								<button v-tooltip="i18n.ts.search" class="_button _monospace" :class="$style.clusterKey" @click="applyClusterFilter(c.key)">{{ c.key }}</button>
							</div>
							<div v-if="c.components" :class="$style.clusterComp">{{ clusterCompSummary(c.components) }}</div>
							<div :class="$style.clusterUsers">
								<MkA v-for="u of c.users" :key="u.id" :to="`/admin/user/${u.id}`" :class="$style.chip">@{{ u.username }}</MkA>
							</div>
						</div>
					</div>
				</div>
			</MkFolder>

			<MkPagination v-slot="{items}" ref="paginationComponent" :pagination="pagination" :displayLimit="50">
				<div :class="$style.tableWrap">
					<div :class="$style.table">
						<div :class="[$style.tr, $style.head]">
							<div :class="$style.cUser">{{ i18n.ts.user }}</div>
							<div :class="$style.cEmail"><i class="ti ti-mail"></i> {{ i18n.ts.email }}</div>
							<div :class="$style.cNum" :title="i18n.ts.ip"><i class="ti ti-network"></i></div>
							<div :class="$style.cNum" :title="i18n.ts.fingerprint"><i class="ti ti-fingerprint"></i></div>
							<div :class="$style.cNum" :title="i18n.ts.notes"><i class="ti ti-pencil"></i></div>
							<div :class="$style.cNum" :title="i18n.ts.followers"><i class="ti ti-users"></i></div>
							<div :class="$style.cNum" :title="i18n.ts.loginHistory"><i class="ti ti-login"></i></div>
							<div :class="$style.cDate">{{ i18n.ts.lastActiveDate }}</div>
							<div :class="$style.cDate">{{ i18n.ts.registeredDate }}</div>
						</div>
						<MkA v-for="row in items" :key="row.id" :class="$style.tr" :to="`/admin/user/${row.id}`">
							<div :class="[$style.cUser, $style.userCell]">
								<MkAvatar :class="$style.avatar" :user="row.user" indicator/>
								<div :class="$style.userText">
									<div :class="$style.userName"><MkUserName :user="row.user"/>
										<span v-if="row.suspended" :class="[$style.badge, $style.badgeDanger]">{{ i18n.ts.suspend }}</span>
										<span v-if="!row.approved" :class="[$style.badge, $style.badgeWarn]">{{ i18n.ts.notApproved }}</span>
									</div>
									<div :class="$style.acct">@{{ row.user.username }}</div>
								</div>
							</div>
							<div :class="$style.cEmail" :title="row.email ?? ''">{{ row.email ?? '-' }}</div>
							<div :class="[$style.cNum, row.ipCount > 1 && $style.flag]" :title="row.lastIp ?? ''">{{ row.ipCount }}</div>
							<div :class="[$style.cNum, row.fingerprintCount > 1 && $style.flag]">{{ row.fingerprintCount }}</div>
							<div :class="$style.cNum">{{ row.notesCount }}</div>
							<div :class="$style.cNum">{{ row.followersCount }}</div>
							<div :class="$style.cNum">{{ row.signinCount }}</div>
							<div :class="$style.cDate">{{ row.lastActiveDate ? dateString(row.lastActiveDate) : '-' }}</div>
							<div :class="$style.cDate">{{ dateString(row.createdAt) }}</div>
						</MkA>
					</div>
				</div>
			</MkPagination>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, useTemplateRef, ref, watchEffect } from 'vue';
import { defaultMemoryStorage } from '@/memory-storage';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkPagination from '@/components/MkPagination.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { lookupUser } from '@/utility/admin-lookup.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import { dateString } from '@/filters/date.js';

type SearchQuery = {
	sort?: string;
	state?: string;
	origin?: string;
	username?: string;
	hostname?: string;
	email?: string;
	ip?: string;
	fingerprint?: string;
};

const paginationComponent = useTemplateRef('paginationComponent');
const storedQuery = JSON.parse(defaultMemoryStorage.getItem('admin-users-query') ?? '{}') as SearchQuery;

const sort = ref(storedQuery.sort ?? '+createdAt');
const state = ref(storedQuery.state ?? 'all');
const origin = ref(storedQuery.origin ?? 'local');
const searchUsername = ref(storedQuery.username ?? '');
const searchHost = ref(storedQuery.hostname ?? '');
const searchEmail = ref(storedQuery.email ?? '');
const searchIp = ref(storedQuery.ip ?? '');
const searchFingerprint = ref(storedQuery.fingerprint ?? '');
const pagination = {
	endpoint: 'admin/users-search' as const,
	limit: 30,
	params: computed(() => ({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		username: searchUsername.value || null,
		hostname: searchHost.value || null,
		email: searchEmail.value || null,
		ip: searchIp.value || null,
		fingerprint: searchFingerprint.value || null,
	})),
	offsetMode: true,
};

// ===== 批量账号检测（聚类） =====
const clusterBy = ref<'fingerprint' | 'ip'>('fingerprint');
const clusterMin = ref<number | string>(2);
const clusters = ref<Misskey.entities.AdminFingerprintClustersResponse>([]);
const clustersLoading = ref(false);
const clustersLoaded = ref(false);

async function loadClusters() {
	clustersLoading.value = true;
	try {
		clusters.value = await misskeyApi('admin/fingerprint-clusters', {
			by: clusterBy.value,
			minAccounts: Math.max(2, Number(clusterMin.value) || 2),
			limit: 50,
		});
		clustersLoaded.value = true;
	} catch {
		clusters.value = [];
		clustersLoaded.value = true;
	} finally {
		clustersLoading.value = false;
	}
}

function clusterCompSummary(components: Record<string, unknown> | null): string {
	if (components == null) return '';
	const parts: string[] = [];
	const webgl = components.webgl as { vendor?: string; renderer?: string } | undefined;
	if (webgl?.renderer) parts.push(`webgl: ${webgl.renderer}`);
	if (components.screen) parts.push(`screen: ${String(components.screen)}`);
	if (components.platform) parts.push(`${String(components.platform)}`);
	if (components.timezone) parts.push(`${String(components.timezone)}`);
	if (components.fonts) parts.push(`fonts: ${String(components.fonts)}`);
	return parts.join('  ·  ');
}

function applyClusterFilter(key: string) {
	// 把聚类键填进主筛选，下面的用户表会重新按该指纹/IP 过滤
	if (clusterBy.value === 'ip') {
		searchIp.value = key;
		searchFingerprint.value = '';
	} else {
		searchFingerprint.value = key;
		searchIp.value = '';
	}
}

function searchUser() {
	os.selectUser({ includeSelf: true }).then(user => {
		show(user);
	});
}

async function addUser() {
	const { canceled: canceled1, result: username } = await os.inputText({
		title: i18n.ts.username,
	});
	if (canceled1 || username == null) return;

	const { canceled: canceled2, result: password } = await os.inputText({
		title: i18n.ts.password,
		type: 'password',
	});
	if (canceled2 || password == null) return;

	os.apiWithDialog('admin/accounts/create', {
		username: username,
		password: password,
	}).then(res => {
		paginationComponent.value?.reload();
	});
}

function show(user) {
	os.pageWindow(`/admin/user/${user.id}`);
}

function resetQuery() {
	sort.value = '+createdAt';
	state.value = 'all';
	origin.value = 'local';
	searchUsername.value = '';
	searchHost.value = '';
	searchEmail.value = '';
	searchIp.value = '';
	searchFingerprint.value = '';
}

const headerActions = computed(() => [{
	icon: 'ti ti-search',
	text: i18n.ts.search,
	handler: searchUser,
}, {
	asFullButton: true,
	icon: 'ti ti-plus',
	text: i18n.ts.addUser,
	handler: addUser,
}, {
	asFullButton: true,
	icon: 'ti ti-search',
	text: i18n.ts.lookup,
	handler: lookupUser,
}]);

const headerTabs = computed(() => []);

watchEffect(() => {
	defaultMemoryStorage.setItem('admin-users-query', JSON.stringify({
		sort: sort.value,
		state: state.value,
		origin: origin.value,
		username: searchUsername.value,
		hostname: searchHost.value,
		email: searchEmail.value,
		ip: searchIp.value,
		fingerprint: searchFingerprint.value,
	}));
});

definePage(() => ({
	title: i18n.ts.users,
	icon: 'ti ti-users',
}));
</script>

<style lang="scss" module>
.inputs {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.tableWrap {
	overflow-x: auto;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
}

.table {
	min-width: 880px;
}

$cols: minmax(180px, 2fr) minmax(150px, 2fr) 56px 56px 56px 64px 56px 110px 110px;

.tr {
	display: grid;
	grid-template-columns: $cols;
	align-items: center;
	gap: 8px;
	padding: 8px 12px;
	border-bottom: solid 1px var(--MI_THEME-divider);
	color: var(--MI_THEME-fg);
	font-size: 0.88em;

	&:last-child { border-bottom: none; }

	&:not(.head):hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}
}

.head {
	position: sticky;
	top: 0;
	z-index: 1;
	background: var(--MI_THEME-panel);
	font-weight: 700;
	font-size: 0.82em;
	color: var(--MI_THEME-fgTransparentWeak);

	i { opacity: 0.8; }
}

.cUser { min-width: 0; }
.cEmail { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cNum { text-align: center; font-variant-numeric: tabular-nums; }
.cDate { font-size: 0.92em; color: var(--MI_THEME-fgTransparentWeak); white-space: nowrap; }

.flag {
	color: var(--MI_THEME-warn);
	font-weight: 700;
}

.userCell {
	display: flex;
	align-items: center;
	gap: 8px;
}

.avatar {
	width: 34px;
	height: 34px;
	flex: 0 0 auto;
}

.userText {
	min-width: 0;
}

.userName {
	display: flex;
	align-items: center;
	gap: 6px;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-weight: 600;
}

.acct {
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 0.85em;
	opacity: 0.7;
}

.badge {
	padding: 1px 8px;
	border-radius: var(--MI-radius-full);
	font-size: 0.9em;
	font-weight: 700;
	color: #fff;
}

.badgeDanger {
	background: var(--MI_THEME-error);
}

.badgeWarn {
	background: var(--MI_THEME-warn);
}

.empty {
	padding: 16px;
	text-align: center;
	color: var(--MI_THEME-fgTransparentWeak);
}

.cluster {
	padding: 10px 12px;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-sm);
}

.clusterHead {
	display: flex;
	align-items: center;
	gap: 10px;
}

.clusterCount {
	flex: 0 0 auto;
	min-width: 28px;
	padding: 2px 8px;
	border-radius: var(--MI-radius-full);
	background: var(--MI_THEME-error);
	color: #fff;
	font-weight: 700;
	text-align: center;
}

.clusterKey {
	flex: 1;
	min-width: 0;
	text-align: left;
	word-break: break-all;
	color: var(--MI_THEME-accent);
}

.clusterComp {
	margin-top: 6px;
	font-size: 0.8em;
	color: var(--MI_THEME-fgTransparentWeak);
	word-break: break-all;
}

.clusterUsers {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin-top: 8px;
}

.chip {
	padding: 2px 10px;
	border-radius: var(--MI-radius-full);
	background: var(--MI_THEME-buttonBg);
	font-size: 0.85em;

	&:hover {
		text-decoration: none;
		background: var(--MI_THEME-buttonHoverBg);
	}
}
</style>
