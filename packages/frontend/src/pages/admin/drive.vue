<!--
SPDX-FileCopyrightText: Universe Federation contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<div class="_gaps_m">
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-cloud"></i></template>
				<template #label>{{ i18n.ts.driveManageTitle }}</template>

				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts.driveManageCaption }}</MkInfo>
					<MkLoading v-if="!loaded"/>
					<template v-else>
						<MkInput v-model="driveCapacityMb" type="number" :min="0">
							<template #label>{{ i18n.ts._role._options.driveCapacity }} (MB)</template>
							<template #caption>{{ i18n.ts.driveDefaultCapacityCaption }}</template>
						</MkInput>
						<MkInput v-model="maxFileSizeMb" type="number" :min="0">
							<template #label>{{ i18n.ts._role._options.maxFileSize }} (MB)</template>
						</MkInput>
						<div class="_buttons">
							<MkButton primary rounded :wait="saving" @click="saveDefault"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
							<MkButton rounded danger :wait="cleaning" @click="cleanRemote"><i class="ti ti-trash"></i> {{ i18n.ts.clearCachedFiles }}</MkButton>
						</div>
					</template>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-user-cog"></i></template>
				<template #label>{{ i18n.ts.drivePerUserTitle }}</template>

				<div class="_gaps_m">
					<MkInfo>{{ i18n.ts.drivePerUserCaption }}</MkInfo>
					<MkButton rounded @click="pickUser"><i class="ti ti-user-search"></i> {{ i18n.ts.selectUser }}</MkButton>

					<div v-if="targetUser" class="_gaps_m _panel" style="padding: 16px;">
						<div :class="$style.userHead">
							<MkAvatar :user="targetUser" :class="$style.avatar" link/>
							<div style="min-width: 0;">
								<div><b>{{ targetUser.name || targetUser.username }}</b></div>
								<div class="_monospace" style="opacity: .7; overflow-wrap: anywhere;">@{{ targetUser.username }}</div>
							</div>
							<MkA :to="`/admin/user/${targetUser.id}`" class="_link" style="margin-left: auto;">{{ i18n.ts.info }}</MkA>
						</div>

						<MkLoading v-if="capLoading"/>
						<template v-else-if="cap">
							<div :class="$style.stats">
								<div><span>{{ i18n.ts.inUse }}</span><b>{{ bytes(cap.usageBytes) }} / {{ cap.fileCount }} {{ i18n.ts.files }}</b></div>
								<div><span>{{ i18n.ts._role._options.driveCapacity }} ({{ i18n.ts.default }})</span><b>{{ cap.policyCapacityMb }} MB</b></div>
								<div><span>{{ i18n.ts.driveEffectiveCapacity }}</span><b>{{ cap.effectiveCapacityMb }} MB</b></div>
							</div>

							<MkInput v-model="overrideMb" type="number" :min="0">
								<template #label>{{ i18n.ts.driveUserOverride }} (MB)</template>
								<template #caption>{{ i18n.ts.driveUserOverrideCaption }}</template>
							</MkInput>
							<div class="_buttons">
								<MkButton primary rounded :wait="savingUser" @click="saveUserCap"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
								<MkButton rounded :wait="savingUser" @click="clearUserCap">{{ i18n.ts.default }}</MkButton>
								<MkButton rounded @click="toggleFiles"><i class="ti ti-eye"></i> {{ i18n.ts.driveViewUserFiles }}</MkButton>
							</div>

							<div v-if="showFiles" class="_gaps_s">
								<MkLoading v-if="filesLoading && userFiles.length === 0"/>
								<MkResult v-else-if="userFiles.length === 0" type="empty"/>
								<div v-else :class="$style.fileGrid">
									<div v-for="f in userFiles" :key="f.id" :class="$style.fileCard">
										<MkDriveFileThumbnail :file="f" fit="contain" :class="$style.thumb"/>
										<div :class="$style.fileName" :title="f.name">{{ f.name }}</div>
										<div :class="$style.fileMeta">{{ bytes(f.size) }}</div>
										<MkButton rounded danger :class="$style.fileDel" @click="deleteUserFile(f)"><i class="ti ti-trash"></i></MkButton>
									</div>
								</div>
								<MkButton v-if="filesMore" rounded :wait="filesLoading" @click="loadMoreFiles">{{ i18n.ts.loadMore }}</MkButton>
							</div>
						</template>
					</div>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkFolder from '@/components/MkFolder.vue';
import MkInput from '@/components/MkInput.vue';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkDriveFileThumbnail from '@/components/MkDriveFileThumbnail.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';

function bytes(v: number): string {
	if (!v || v < 0) return '0 B';
	const units = ['B', 'KB', 'MB', 'GB', 'TB'];
	let n = v; let i = 0;
	while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
	return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ---- 默认上限 ----
const loaded = ref(false);
const saving = ref(false);
const cleaning = ref(false);
const driveCapacityMb = ref<number | string>(100);
const maxFileSizeMb = ref<number | string>(25);
let currentPolicies: Record<string, unknown> = {};

onMounted(async () => {
	const meta = await misskeyApi('admin/meta');
	currentPolicies = meta.policies as Record<string, unknown>;
	driveCapacityMb.value = (meta.policies.driveCapacityMb as number | undefined) ?? 100;
	maxFileSizeMb.value = (meta.policies.maxFileSizeMb as number | undefined) ?? 25;
	loaded.value = true;
});

async function saveDefault() {
	saving.value = true;
	try {
		await os.apiWithDialog('admin/roles/update-default-policies', {
			policies: {
				...currentPolicies,
				driveCapacityMb: Math.max(0, Math.floor(Number(driveCapacityMb.value) || 0)),
				maxFileSizeMb: Math.max(0, Math.floor(Number(maxFileSizeMb.value) || 0)),
			},
		});
	} finally {
		saving.value = false;
	}
}

async function cleanRemote() {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.driveCleanRemoteConfirm });
	if (canceled) return;
	cleaning.value = true;
	try {
		await os.apiWithDialog('admin/drive/clean-remote-files', {});
	} finally {
		cleaning.value = false;
	}
}

// ---- 单用户 ----
type UserCap = { usageBytes: number; fileCount: number; policyCapacityMb: number; maxFileSizeMb: number; overrideMb: number | null; effectiveCapacityMb: number; };
const targetUser = ref<Misskey.entities.UserDetailed | null>(null);
const cap = ref<UserCap | null>(null);
const capLoading = ref(false);
const savingUser = ref(false);
const overrideMb = ref<number | string>('');

const showFiles = ref(false);
const userFiles = ref<Misskey.entities.DriveFile[]>([]);
const filesLoading = ref(false);
const filesMore = ref(false);

async function pickUser() {
	const user = await os.selectUser({ localOnly: true }).catch(() => null);
	if (!user) return;
	targetUser.value = user;
	cap.value = null;
	showFiles.value = false;
	userFiles.value = [];
	await loadCap();
}

async function loadCap() {
	if (!targetUser.value) return;
	capLoading.value = true;
	try {
		const res = await misskeyApi('admin/drive/user-capacity', { userId: targetUser.value.id }) as UserCap;
		cap.value = res;
		overrideMb.value = res.overrideMb ?? '';
	} finally {
		capLoading.value = false;
	}
}

async function saveUserCap() {
	if (!targetUser.value) return;
	savingUser.value = true;
	try {
		const v = overrideMb.value === '' || overrideMb.value == null ? null : Math.max(0, Math.floor(Number(overrideMb.value)));
		await os.apiWithDialog('admin/drive/set-user-capacity', { userId: targetUser.value.id, overrideMb: v });
		await loadCap();
	} finally {
		savingUser.value = false;
	}
}

async function clearUserCap() {
	overrideMb.value = '';
	await saveUserCap();
}

async function toggleFiles() {
	showFiles.value = !showFiles.value;
	if (showFiles.value && userFiles.value.length === 0) {
		await loadMoreFiles(true);
	}
}

async function loadMoreFiles(reset = false) {
	if (!targetUser.value) return;
	filesLoading.value = true;
	try {
		const loadedFiles = await misskeyApi('admin/drive/files', {
			userId: targetUser.value.id,
			limit: 31,
			...(reset || userFiles.value.length === 0 ? {} : { untilId: userFiles.value.at(-1)?.id }),
		});
		filesMore.value = loadedFiles.length === 31;
		const page = loadedFiles.slice(0, 30);
		userFiles.value = reset ? page : [...userFiles.value, ...page];
	} finally {
		filesLoading.value = false;
	}
}

async function deleteUserFile(file: Misskey.entities.DriveFile) {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx.driveDeleteSelectedConfirm({ n: 1 }) });
	if (canceled) return;
	try {
		await misskeyApi('drive/files/delete', { fileId: file.id });
		userFiles.value = userFiles.value.filter(f => f.id !== file.id);
		await loadCap();
	} catch {
		os.alert({ type: 'error', text: i18n.ts.unableToDelete });
	}
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.driveManageTitle,
	icon: 'ti ti-cloud',
}));
</script>

<style lang="scss" module>
.userHead {
	display: flex;
	align-items: center;
	gap: 12px;
}

.avatar {
	width: 48px;
	height: 48px;
}

.stats {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
	gap: 8px;

	> div {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px;
		border-radius: var(--MI-radius);
		background: var(--MI_THEME-panelHighlight);
	}

	span {
		font-size: 85%;
		color: var(--MI_THEME-fgTransparentWeak);
	}
}

.fileGrid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
	gap: 10px;
}

.fileCard {
	position: relative;
	display: flex;
	flex-direction: column;
	gap: 4px;
	padding: 8px;
	border: 1px solid var(--MI_THEME-divider);
	border-radius: var(--MI-radius);
	background: var(--MI_THEME-panel);
}

.thumb {
	width: 100%;
	height: 90px;
	border-radius: 6px;
}

.fileName {
	font-size: 80%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.fileMeta {
	font-size: 75%;
	color: var(--MI_THEME-fgTransparentWeak);
}

.fileDel {
	position: absolute;
	top: 6px;
	right: 6px;
}
</style>
