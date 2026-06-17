<!--
SPDX-FileCopyrightText: Universe Federation contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 1100px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps_m">
			<!-- 紧急方案 -->
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-alert-triangle"></i></template>
				<template #label>{{ i18n.ts._noteManagement.emergency }}</template>

				<div class="_gaps_m">
					<MkInfo v-if="!iAmAdmin" warn>{{ i18n.ts._noteManagement.adminOnly }}</MkInfo>

					<MkSwitch v-model="hideMode" :disabled="!iAmAdmin">
						<template #label>{{ i18n.ts._noteManagement.hideEmergencyMode }}</template>
						<template #caption>{{ i18n.ts._noteManagement.hideEmergencyModeCaption }}</template>
					</MkSwitch>
					<MkInfo v-if="hideMode" warn>{{ i18n.ts._noteManagement.hideEmergencyModeActive }}</MkInfo>

					<MkSwitch v-model="postingFrozen" :disabled="!iAmAdmin">
						<template #label>{{ i18n.ts._noteManagement.postingFrozen }}</template>
						<template #caption>{{ i18n.ts._noteManagement.postingFrozenCaption }}</template>
					</MkSwitch>
					<MkInfo v-if="postingFrozen" warn>{{ i18n.ts._noteManagement.postingFrozenActive }}</MkInfo>

					<div class="_buttons">
						<MkButton primary rounded :disabled="!iAmAdmin" :wait="savingEmergency" @click="saveEmergency"><i class="ti ti-check"></i> {{ i18n.ts.save }}</MkButton>
					</div>
				</div>
			</MkFolder>

			<!-- 全部帖子 -->
			<MkFolder :defaultOpen="true">
				<template #icon><i class="ti ti-notes"></i></template>
				<template #label>{{ i18n.ts._noteManagement.allNotes }}</template>

				<div class="_gaps_m">
					<div :class="$style.filters">
						<MkInput v-model="f.query" type="search" debounce :class="$style.grow"><template #prefix><i class="ti ti-search"></i></template><template #label>{{ i18n.ts._noteManagement.searchText }}</template></MkInput>
						<MkInput v-model="f.username" :class="$style.filterItem"><template #label>{{ i18n.ts._noteManagement.username }}</template></MkInput>
						<MkSelect v-model="f.visibility" :class="$style.filterItem">
							<template #label>{{ i18n.ts.visibility }}</template>
							<option value="all">{{ i18n.ts.all }}</option>
							<option value="public">public</option>
							<option value="home">home</option>
							<option value="followers">followers</option>
							<option value="specified">specified</option>
						</MkSelect>
						<MkSelect v-model="f.sort" :class="$style.filterItem">
							<template #label>{{ i18n.ts._noteManagement.sort }}</template>
							<option value="+createdAt">{{ i18n.ts._noteManagement.newestFirst }}</option>
							<option value="-createdAt">{{ i18n.ts._noteManagement.oldestFirst }}</option>
						</MkSelect>
					</div>
					<div :class="$style.filters">
						<MkInput v-model="f.ip" :class="$style.filterItem"><template #label>IP</template></MkInput>
						<MkInput v-model="f.fingerprint" :class="$style.filterItem"><template #label>{{ i18n.ts._noteManagement.fingerprint }}</template></MkInput>
						<MkInput v-model="f.sinceDate" type="date" :class="$style.filterItem"><template #label>{{ i18n.ts._noteManagement.since }}</template></MkInput>
						<MkInput v-model="f.untilDate" type="date" :class="$style.filterItem"><template #label>{{ i18n.ts._noteManagement.until }}</template></MkInput>
					</div>
					<div :class="$style.switches">
						<MkSwitch v-model="f.withFiles">{{ i18n.ts._noteManagement.withFiles }}</MkSwitch>
						<MkSwitch v-model="f.repliesOnly">{{ i18n.ts._noteManagement.repliesOnly }}</MkSwitch>
						<MkSwitch v-model="f.renotesOnly">{{ i18n.ts._noteManagement.renotesOnly }}</MkSwitch>
						<MkSwitch v-model="f.reportedOnly">{{ i18n.ts._noteManagement.reportedOnly }}</MkSwitch>
					</div>
					<div :class="$style.bar">
						<MkButton rounded @click="reloadNotes"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
						<div :class="$style.spacer"></div>
						<span :class="$style.dim">{{ i18n.tsx._noteManagement.selectedCount({ n: selected.size }) }}</span>
						<MkButton rounded danger :disabled="selected.size === 0" :wait="bulkDeleting" @click="bulkDelete"><i class="ti ti-trash"></i> {{ i18n.ts._noteManagement.bulkDelete }}</MkButton>
					</div>

					<MkLoading v-if="notesLoading"/>
					<MkResult v-else-if="items.length === 0" type="empty"/>
					<div v-else class="_gaps_s">
						<div v-for="item in items" :key="item.note.id" :class="[$style.noteRow, { [$style.selectedRow]: selected.has(item.note.id) }]">
							<input type="checkbox" :checked="selected.has(item.note.id)" :class="$style.check" @change="toggleSelect(item.note.id)"/>
							<div :class="$style.noteMain">
								<div :class="$style.noteHead">
									<MkA :to="`/admin/user/${item.note.user.id}`" :class="$style.author">@{{ item.note.user.username }}</MkA>
									<span v-if="authors[item.note.user.id]?.isSuspended" :class="[$style.badge, $style.bad]">{{ i18n.ts._noteManagement.suspended }}</span>
									<span v-if="authors[item.note.user.id]?.isSilenced" :class="[$style.badge, $style.warn]">{{ i18n.ts._noteManagement.silenced }}</span>
									<span :class="[$style.badge, authors[item.note.user.id]?.emailVerified ? $style.ok : $style.dimBadge]">{{ authors[item.note.user.id]?.emailVerified ? i18n.ts._noteManagement.emailVerified : i18n.ts._noteManagement.emailUnverified }}</span>
									<span :class="$style.badge">{{ item.note.visibility }}</span>
									<MkTime :time="item.note.createdAt" :class="$style.dim"/>
								</div>
								<div v-if="item.note.cw" :class="$style.cw">CW: {{ item.note.cw }}</div>
								<Mfm v-if="item.note.text" :text="item.note.text" :author="item.note.user" :nyaize="'respect'" :class="$style.text"/>
								<div v-if="item.note.files && item.note.files.length > 0" :class="$style.dim">📎 {{ item.note.files.length }}</div>
								<div :class="$style.metaLine">
									<span v-if="item.ip" :class="$style.mono" @click="investigate('ip', item.ip!)"><i class="ti ti-map-pin"></i> {{ item.ip }}</span>
									<span v-if="item.fingerprint" :class="$style.mono" @click="investigate('fingerprint', item.fingerprint!)"><i class="ti ti-fingerprint"></i> {{ item.fingerprint.slice(0, 16) }}</span>
									<span :class="$style.dim">{{ i18n.ts._noteManagement.notesCount }}: {{ authors[item.note.user.id]?.notesCount ?? '?' }} · IP {{ authors[item.note.user.id]?.ipCount ?? '?' }} · FP {{ authors[item.note.user.id]?.fingerprintCount ?? '?' }}</span>
								</div>
								<div :class="$style.rowActions">
									<MkA :to="`/notes/${item.note.id}`" :class="$style.linkBtn"><i class="ti ti-external-link"></i></MkA>
									<button class="_button" :class="$style.linkBtn" @click="deleteOne(item.note.id)"><i class="ti ti-trash"></i> {{ i18n.ts.delete }}</button>
								</div>
							</div>
						</div>
						<div :class="$style.bar">
							<MkButton rounded :disabled="notesOffset === 0" @click="prevNotes"><i class="ti ti-chevron-left"></i></MkButton>
							<div :class="$style.dim">{{ Math.floor(notesOffset / NOTES_LIMIT) + 1 }}</div>
							<MkButton rounded primary :disabled="!notesCanMore" @click="nextNotes"><i class="ti ti-chevron-right"></i></MkButton>
						</div>
					</div>
				</div>
			</MkFolder>

			<!-- 指纹排查 -->
			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-fingerprint"></i></template>
				<template #label>{{ i18n.ts._noteManagement.fingerprintInvestigation }}</template>

				<div class="_gaps_m">
					<div :class="$style.filters">
						<MkSelect v-model="lookupType" :class="$style.filterItem">
							<template #label>{{ i18n.ts._noteManagement.lookupBy }}</template>
							<option value="ip">IP</option>
							<option value="fingerprint">{{ i18n.ts._noteManagement.fingerprint }}</option>
						</MkSelect>
						<MkInput v-model="lookupValue" :class="$style.grow"><template #label>{{ i18n.ts._noteManagement.value }}</template></MkInput>
						<MkButton rounded primary :wait="lookupLoading" @click="lookup"><i class="ti ti-search"></i> {{ i18n.ts._noteManagement.lookup }}</MkButton>
					</div>

					<MkResult v-if="lookupDone && relatedAccounts.length === 0" type="empty"/>
					<div v-else-if="relatedAccounts.length > 0" class="_gaps_s">
						<div :class="$style.bar">
							<span :class="$style.dim">{{ i18n.tsx._noteManagement.relatedFound({ n: relatedAccounts.length }) }}</span>
							<div :class="$style.spacer"></div>
							<MkButton rounded danger :disabled="!iAmAdmin || selectedAccounts.size === 0" :wait="banning" @click="banSelected"><i class="ti ti-ban"></i> {{ i18n.ts._noteManagement.banAndDelete }}</MkButton>
						</div>
						<div v-for="acct in relatedAccounts" :key="acct.userId" :class="$style.acctRow">
							<input type="checkbox" :checked="selectedAccounts.has(acct.userId)" :class="$style.check" @change="toggleAccount(acct.userId)"/>
							<MkA :to="`/admin/user/${acct.userId}`" :class="$style.author">@{{ acct.username }}</MkA>
							<span v-if="acct.isSuspended" :class="[$style.badge, $style.bad]">{{ i18n.ts._noteManagement.suspended }}</span>
							<span :class="$style.dim">{{ i18n.ts._noteManagement.localNotesCount }}: {{ acct.localNotesCount }}</span>
						</div>
					</div>
				</div>
			</MkFolder>

			<!-- 已删除归档 -->
			<MkFolder :defaultOpen="false">
				<template #icon><i class="ti ti-archive"></i></template>
				<template #label>{{ i18n.ts._noteManagement.deletedArchive }}</template>

				<div class="_gaps_m">
					<div :class="$style.bar">
						<MkInput v-model="archiveQuery" type="search" debounce :class="$style.grow"><template #prefix><i class="ti ti-search"></i></template><template #label>{{ i18n.ts._noteManagement.searchText }}</template></MkInput>
						<MkButton rounded @click="reloadArchive"><i class="ti ti-refresh"></i> {{ i18n.ts.reload }}</MkButton>
						<MkButton rounded danger :disabled="!iAmAdmin" :wait="purgingAll" @click="purgeAll"><i class="ti ti-trash"></i> {{ i18n.ts._noteManagement.purgeAll }}</MkButton>
					</div>

					<MkLoading v-if="archiveLoading"/>
					<MkResult v-else-if="archived.length === 0" type="empty"/>
					<div v-else class="_gaps_s">
						<div v-for="a in archived" :key="a.id" :class="$style.noteRow">
							<div :class="$style.noteMain">
								<div :class="$style.noteHead">
									<span :class="$style.author">@{{ a.username }}</span>
									<span :class="$style.badge">{{ a.visibility }}</span>
									<span :class="$style.dim">{{ i18n.ts._noteManagement.noteCreatedAt }}: <MkTime :time="a.noteCreatedAt"/></span>
								</div>
								<div v-if="a.cw" :class="$style.cw">CW: {{ a.cw }}</div>
								<Mfm v-if="a.text" :text="a.text" :nyaize="'respect'" :class="$style.text"/>
								<div :class="$style.metaLine">
									<span v-if="a.ip" :class="$style.mono"><i class="ti ti-map-pin"></i> {{ a.ip }}</span>
									<span v-if="a.fingerprint" :class="$style.mono"><i class="ti ti-fingerprint"></i> {{ a.fingerprint.slice(0, 16) }}</span>
									<span :class="$style.dim">{{ i18n.ts._noteManagement.deletedBy }}: @{{ a.deletedByUsername ?? a.deletedById }} · <MkTime :time="a.deletedAt"/></span>
								</div>
								<div v-if="a.reason" :class="$style.dim">{{ i18n.ts._noteManagement.reason }}: {{ a.reason }}</div>
								<div :class="$style.rowActions">
									<MkButton rounded :disabled="!iAmAdmin" @click="restore(a.id)"><i class="ti ti-restore"></i> {{ i18n.ts._noteManagement.restore }}</MkButton>
									<MkButton rounded danger :disabled="!iAmAdmin" @click="purgeOne(a.id)"><i class="ti ti-trash"></i> {{ i18n.ts._noteManagement.purge }}</MkButton>
								</div>
							</div>
						</div>
						<div :class="$style.bar">
							<MkButton rounded :disabled="archiveOffset === 0" @click="prevArchive"><i class="ti ti-chevron-left"></i></MkButton>
							<div :class="$style.dim">{{ Math.floor(archiveOffset / ARCHIVE_LIMIT) + 1 }}</div>
							<MkButton rounded primary :disabled="!archiveCanMore" @click="nextArchive"><i class="ti ti-chevron-right"></i></MkButton>
						</div>
					</div>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { computed, reactive, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkFolder from '@/components/MkFolder.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkSelect from '@/components/MkSelect.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import * as os from '@/os.js';
import { fetchInstance } from '@/instance.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { iAmAdmin, iAmModerator } from '@/i.js';

if (!iAmModerator) {
	throw new Error('moderator required');
}

const NOTES_LIMIT = 30;
const ARCHIVE_LIMIT = 30;

type AuthorSummary = { isSuspended: boolean; isSilenced: boolean; emailVerified: boolean; notesCount: number; ipCount: number; fingerprintCount: number };

const instanceMeta = await misskeyApi('admin/meta') as Misskey.entities.AdminMetaResponse;

// 紧急方案
const hideMode = ref<boolean>((instanceMeta as any).notesHideEmergencyMode ?? false);
const postingFrozen = ref<boolean>((instanceMeta as any).notesPostingFrozen ?? false);
const savingEmergency = ref(false);

async function saveEmergency() {
	savingEmergency.value = true;
	try {
		await os.apiWithDialog('admin/update-meta', {
			notesHideEmergencyMode: hideMode.value,
			notesPostingFrozen: postingFrozen.value,
		});
		await fetchInstance(true);
	} finally {
		savingEmergency.value = false;
	}
}

// 全部帖子
const f = reactive({
	query: '', username: '', visibility: 'all', sort: '+createdAt' as '+createdAt' | '-createdAt',
	ip: '', fingerprint: '', sinceDate: '', untilDate: '',
	withFiles: false, repliesOnly: false, renotesOnly: false, reportedOnly: false,
});
const items = ref<{ note: Misskey.entities.Note; ip: string | null; fingerprint: string | null }[]>([]);
const authors = ref<Record<string, AuthorSummary>>({});
const notesLoading = ref(false);
const notesOffset = ref(0);
const notesCanMore = ref(false);
const selected = reactive(new Set<string>());
const bulkDeleting = ref(false);

function buildNoteParams() {
	return {
		limit: NOTES_LIMIT, offset: notesOffset.value, sort: f.sort,
		query: f.query.trim() || null,
		username: f.username.trim() || null,
		visibility: f.visibility,
		withFiles: f.withFiles, repliesOnly: f.repliesOnly, renotesOnly: f.renotesOnly, reportedOnly: f.reportedOnly,
		ip: f.ip.trim() || null,
		fingerprint: f.fingerprint.trim() || null,
		sinceDate: f.sinceDate || null,
		untilDate: f.untilDate || null,
	};
}

async function loadNotes() {
	notesLoading.value = true;
	try {
		const res = await misskeyApi('admin/notes/list', buildNoteParams() as any) as any;
		items.value = res.items;
		authors.value = res.authors;
		notesCanMore.value = res.items.length >= NOTES_LIMIT;
	} finally {
		notesLoading.value = false;
	}
}

async function reloadNotes() { notesOffset.value = 0; selected.clear(); await loadNotes(); }
async function nextNotes() { notesOffset.value += NOTES_LIMIT; await loadNotes(); }
async function prevNotes() { notesOffset.value = Math.max(0, notesOffset.value - NOTES_LIMIT); await loadNotes(); }

function toggleSelect(id: string) { if (selected.has(id)) selected.delete(id); else selected.add(id); }

async function deleteOne(id: string) {
	const { canceled, result: reason } = await os.inputText({ title: i18n.ts._noteManagement.deleteReason });
	if (canceled) return;
	await os.apiWithDialog('admin/notes/delete-bulk', { noteIds: [id], reason: reason || null });
	await loadNotes();
}

async function bulkDelete() {
	if (selected.size === 0) return;
	const { canceled, result: reason } = await os.inputText({ title: i18n.tsx._noteManagement.bulkDeleteConfirm({ n: selected.size }) });
	if (canceled) return;
	bulkDeleting.value = true;
	try {
		await os.apiWithDialog('admin/notes/delete-bulk', { noteIds: [...selected], reason: reason || null });
		selected.clear();
		await loadNotes();
	} finally {
		bulkDeleting.value = false;
	}
}

// 指纹排查
const lookupType = ref<'ip' | 'fingerprint'>('ip');
const lookupValue = ref('');
const relatedAccounts = ref<Misskey.entities.AdminNotesRelatedAccountsResponse>([]);
const selectedAccounts = reactive(new Set<string>());
const lookupLoading = ref(false);
const lookupDone = ref(false);
const banning = ref(false);

function investigate(type: 'ip' | 'fingerprint', value: string) {
	lookupType.value = type;
	lookupValue.value = value;
	lookup();
}

async function lookup() {
	if (!lookupValue.value.trim()) return;
	lookupLoading.value = true;
	selectedAccounts.clear();
	try {
		relatedAccounts.value = await misskeyApi('admin/notes/related-accounts', {
			[lookupType.value]: lookupValue.value.trim(),
		} as any);
		lookupDone.value = true;
	} finally {
		lookupLoading.value = false;
	}
}

function toggleAccount(id: string) { if (selectedAccounts.has(id)) selectedAccounts.delete(id); else selectedAccounts.add(id); }

async function banSelected() {
	if (selectedAccounts.size === 0) return;
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.tsx._noteManagement.banConfirm({ n: selectedAccounts.size }) });
	if (canceled) return;
	banning.value = true;
	try {
		const res = await os.apiWithDialog('admin/notes/emergency-ban', { userIds: [...selectedAccounts], deleteNotes: true }) as any;
		await os.alert({ type: 'success', text: i18n.tsx._noteManagement.banDone({ users: res.bannedUserIds.length, notes: res.deletedNoteCount }) });
		await lookup();
	} finally {
		banning.value = false;
	}
}

// 已删除归档
const archived = ref<Misskey.entities.AdminNotesArchivedListResponse>([]);
const archiveQuery = ref('');
const archiveLoading = ref(false);
const archiveOffset = ref(0);
const archiveCanMore = ref(false);
const purgingAll = ref(false);

async function loadArchive() {
	archiveLoading.value = true;
	try {
		const res = await misskeyApi('admin/notes/archived-list', {
			limit: ARCHIVE_LIMIT, offset: archiveOffset.value,
			query: archiveQuery.value.trim() || null,
		} as any);
		archived.value = res;
		archiveCanMore.value = res.length >= ARCHIVE_LIMIT;
	} finally {
		archiveLoading.value = false;
	}
}

async function reloadArchive() { archiveOffset.value = 0; await loadArchive(); }
async function nextArchive() { archiveOffset.value += ARCHIVE_LIMIT; await loadArchive(); }
async function prevArchive() { archiveOffset.value = Math.max(0, archiveOffset.value - ARCHIVE_LIMIT); await loadArchive(); }

async function restore(id: string) {
	const { canceled } = await os.confirm({ type: 'question', text: i18n.ts._noteManagement.restoreConfirm });
	if (canceled) return;
	await os.apiWithDialog('admin/notes/restore', { id });
	await loadArchive();
}

async function purgeOne(id: string) {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._noteManagement.purgeConfirm });
	if (canceled) return;
	await os.apiWithDialog('admin/notes/archive-purge', { ids: [id] });
	await loadArchive();
}

async function purgeAll() {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts._noteManagement.purgeAllConfirm });
	if (canceled) return;
	purgingAll.value = true;
	try {
		await os.apiWithDialog('admin/notes/archive-purge', { all: true });
		await loadArchive();
	} finally {
		purgingAll.value = false;
	}
}

const headerActions = computed(() => []);
const headerTabs = computed(() => []);

definePage({
	title: i18n.ts._noteManagement.title,
	icon: 'ti ti-notes',
});

loadNotes();
loadArchive();
</script>

<style lang="scss" module>
.filters { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-end; }
.switches { display: flex; gap: 16px; flex-wrap: wrap; }
.grow { flex: 2 1 240px; }
.filterItem { flex: 1 1 160px; }
.bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.spacer { flex: 1; }
.dim { color: var(--MI_THEME-fgTransparentWeak); font-size: 90%; }
.noteRow { display: flex; gap: 10px; padding: 12px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); background: var(--MI_THEME-panel); }
.selectedRow { border-color: var(--MI_THEME-accent); background: var(--MI_THEME-accentedBg); }
.check { margin-top: 4px; flex-shrink: 0; }
.noteMain { min-width: 0; flex: 1; }
.noteHead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.author { font-weight: 700; }
.cw { font-weight: 700; opacity: 0.8; }
.text { overflow-wrap: anywhere; }
.metaLine { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-top: 6px; font-size: 88%; }
.mono { font-family: monospace; cursor: pointer; color: var(--MI_THEME-accent); overflow-wrap: anywhere; }
.rowActions { display: flex; gap: 8px; margin-top: 8px; }
.linkBtn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--MI_THEME-divider); border-radius: 999px; }
.acctRow { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--MI_THEME-divider); border-radius: var(--MI-radius); }
.badge { display: inline-flex; align-items: center; min-height: 20px; padding: 0 8px; border-radius: 999px; font-size: 78%; background: var(--MI_THEME-panelHighlight); white-space: nowrap; }
.ok { background: color(from var(--MI_THEME-success) srgb r g b / 0.18); color: var(--MI_THEME-success); }
.warn { background: color(from var(--MI_THEME-warn) srgb r g b / 0.18); color: var(--MI_THEME-warn); }
.bad { background: color(from var(--MI_THEME-error) srgb r g b / 0.18); color: var(--MI_THEME-error); }
.dimBadge { color: var(--MI_THEME-fgTransparentWeak); }
</style>
