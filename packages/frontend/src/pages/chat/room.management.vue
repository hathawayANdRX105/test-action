<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_gaps">
	<MkInfo>{{ i18n.ts._chat.managementDescription }}</MkInfo>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.announcement }}</div>
		<MkTextarea v-model="announcement" :max="2048">
			<template #label>{{ i18n.ts._chat.announcementContent }}</template>
			<template #caption>{{ i18n.ts._chat.announcementDescription }}</template>
		</MkTextarea>
		<MkSwitch v-model="announcementPinned">
			<template #label>{{ i18n.ts._chat.pinAnnouncement }}</template>
			<template #caption>{{ i18n.ts._chat.pinAnnouncementDescription }}</template>
		</MkSwitch>
		<MkButton primary :disabled="!announcementChanged" @click="saveAnnouncement">{{ i18n.ts.save }}</MkButton>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.silenceAll }}</div>
		<MkSwitch v-model="isSilenced" @update:modelValue="saveSilenced">
			<template #label>{{ i18n.ts._chat.silenceAll }}</template>
			<template #caption>{{ i18n.ts._chat.silenceAllDescription }}</template>
		</MkSwitch>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.slowMode }}</div>
		<MkInput v-model="slowModeSeconds" type="number" :min="0" :max="86400">
			<template #label>{{ i18n.ts._chat.slowModeInterval }}</template>
			<template #caption>{{ i18n.ts._chat.slowModeDescription }}</template>
		</MkInput>
		<MkButton primary :disabled="!slowModeChanged" @click="saveSlowMode">{{ i18n.ts.save }}</MkButton>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.keywordFilter }}</div>
		<MkTextarea v-model="keywordsText">
			<template #label>{{ i18n.ts._chat.keywordFilterList }}</template>
			<template #caption>{{ i18n.ts._chat.keywordFilterDescription }}</template>
		</MkTextarea>
		<MkInput v-model="keywordMuteSeconds" type="number" :min="-1">
			<template #label>{{ i18n.ts._chat.keywordMuteDuration }}</template>
			<template #caption>{{ i18n.ts._chat.keywordMuteDurationDescription }}</template>
		</MkInput>
		<MkButton primary :disabled="!keywordChanged" @click="saveKeywordFilter">{{ i18n.ts.save }}</MkButton>

		<div :class="$style.keywordMuteLog">
			<div :class="$style.titleRow">
				<div :class="$style.subTitle">
					<i class="ti ti-microphone-off"></i>
					<span>{{ i18n.ts.chatMuteLog }}</span>
				</div>
				<button v-if="muteLog.length > 0" class="_button" :class="$style.clearLogButton" @click="clearMuteLog">{{ i18n.ts.chatClearMuteLog }}</button>
			</div>

			<MkInput v-model="muteLogSearchQuery" type="search" :placeholder="i18n.ts.search" debounce :class="$style.inlineSearchInput" data-chat-keyword-mute-log-search>
				<template #prefix><i class="ti ti-search"></i></template>
			</MkInput>

			<MkLoading v-if="muteLogFetching && muteLog.length === 0"/>
			<div v-else-if="filteredMuteLog.length === 0" :class="$style.caption">{{ i18n.ts.chatNoMuteLog }}</div>
			<div v-else :class="[$style.muteLogList, $style.previewScrollList]" data-chat-keyword-mute-log-list>
				<div v-for="(log, i) in filteredMuteLog" :key="`${log.createdAt}-${i}`" :class="$style.muteLogRow">
					<MkA v-if="log.user" :class="$style.muteLogUserLink" :to="`${userPage(log.user)}`">
						<MkUserCardMini :user="log.user" :withChart="false"/>
					</MkA>
					<div v-else :class="$style.unknownUser">{{ i18n.ts.unknown }}</div>
					<div :class="$style.muteLogMeta">
						<span v-if="isStillMuted(log.mutedUntil)" :class="$style.muteLogStatus"><i class="ti ti-microphone-off"></i> {{ i18n.ts.chatStillMuted }}</span>
						<span :class="$style.muteLogKeyword">{{ i18n.tsx.chatMutedByKeyword({ keyword: log.keyword }) }}</span>
						<span :class="$style.muteLogTime">{{ dateString(log.createdAt) }}</span>
					</div>
				</div>
			</div>
		</div>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.mutedMembers }}</div>
		<MkLoading v-if="mutedFetching"/>
		<div v-else-if="mutedMembers.length === 0" :class="$style.caption">{{ i18n.ts._chat.noMutedMembers }}</div>
		<div v-else :class="$style.banList">
			<div v-for="m in mutedMembers" :key="m.id" :class="$style.banRow">
				<MkA :class="$style.banRowLink" :to="`${userPage(m.user!)}`">
					<MkUserCardMini :user="m.user!" :withChart="false"/>
				</MkA>
				<span :class="$style.mutedUntilLabel">{{ mutedUntilText(m) }}</span>
				<MkButton rounded :class="$style.banRowButton" @click="unmuteMember(m)">{{ i18n.ts._chat.unmuteMember }}</MkButton>
			</div>
		</div>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.banList }}</div>
		<MkLoading v-if="bansFetching"/>
		<div v-else-if="bans.length === 0" :class="$style.caption">{{ i18n.ts._chat.noBannedUsers }}</div>
		<div v-else :class="[$style.banList, $style.banScrollList]">
			<div v-for="ban in bans" :key="ban.id" :class="$style.banRow">
				<MkA :class="$style.banRowLink" :to="`${userPage(ban.user)}`">
					<MkUserCardMini :user="ban.user" :withChart="false"/>
				</MkA>
				<MkButton rounded :class="$style.banRowButton" @click="unban(ban)">{{ i18n.ts._chat.unbanUser }}</MkButton>
			</div>
		</div>
		<MkButton v-if="bansCanFetchMore" rounded :wait="bansMoreFetching" style="margin: 0 auto;" @click="fetchMoreBans">{{ i18n.ts.loadMore }}</MkButton>
	</div>

	<div :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.messageStats }}</div>
		<div v-if="stats == null" :class="$style.loading"><MkLoading :mini="true"/></div>
		<template v-else>
			<div :class="$style.statsGrid">
				<div>
					<span>{{ i18n.ts.total }}</span>
					<b>{{ stats.total }}</b>
				</div>
				<div>
					<span>{{ i18n.ts._chat.oldestMessage }}</span>
					<b>{{ stats.oldestAt == null ? '-' : dateString(stats.oldestAt) }}</b>
				</div>
				<div>
					<span>{{ i18n.ts._chat.newestMessage }}</span>
					<b>{{ stats.newestAt == null ? '-' : dateString(stats.newestAt) }}</b>
				</div>
			</div>
			<div :class="$style.chart" role="img" :aria-label="i18n.ts._chat.messageStats">
				<div v-for="item in stats.daily" :key="item.date" :class="$style.barWrap" :title="`${item.date}: ${item.count}`">
					<div :class="$style.barTrack">
						<div :class="$style.bar" :style="{ height: `${barHeight(item.count)}%` }"></div>
					</div>
					<span>{{ item.date.slice(5) }}</span>
				</div>
			</div>
		</template>
	</div>

	<div v-if="canManageRoomRoles" :class="$style.section">
		<div :class="$style.title">{{ i18n.ts._chat.autoDeleteMessages }}</div>
		<MkSwitch v-model="retentionEnabled">
			<template #label>{{ i18n.ts._chat.enableAutoDeleteMessages }}</template>
			<template #caption>{{ i18n.ts._chat.autoDeleteMessagesDescription }}</template>
		</MkSwitch>
		<MkInput v-model="retentionDays" type="number" :min="MIN_RETENTION_DAYS" :max="MAX_RETENTION_DAYS" :disabled="!retentionEnabled">
			<template #label>{{ i18n.ts._chat.autoDeleteDays }}</template>
			<template #caption>{{ i18n.ts._chat.autoDeleteDaysCaption }}</template>
		</MkInput>
		<MkButton primary :disabled="!canSaveRetention" @click="saveRetention">{{ i18n.ts.save }}</MkButton>
	</div>

	<div v-if="canManageRoomRoles" :class="[$style.section, $style.dangerSection]">
		<div :class="$style.title">{{ i18n.ts._chat.deleteAllMessages }}</div>
		<div :class="$style.caption">{{ i18n.ts._chat.deleteAllMessagesDescription }}</div>
		<MkButton danger @click="deleteAllMessages"><i class="ti ti-trash"></i> {{ i18n.ts._chat.deleteAllMessages }}</MkButton>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, onMounted, ref, watch } from 'vue';
import * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInfo from '@/components/MkInfo.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import MkLoading from '@/components/global/MkLoading.vue';
import MkUserCardMini from '@/components/MkUserCardMini.vue';
import { userPage } from '@/filters/user.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { ensureSignin } from '@/i.js';

const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 3650;
const $i = ensureSignin();
type ChatMuteLogEntry = { user: Misskey.entities.UserLite | null; keyword: string; mutedUntil: string | null; createdAt: string; };

const props = defineProps<{
	room: Misskey.entities.ChatRoom;
}>();

const emit = defineEmits<{
	(ev: 'updated', room: Misskey.entities.ChatRoom): void;
	(ev: 'cleared'): void;
}>();

const retentionEnabled = ref(props.room.messageRetentionDays != null);
const retentionDays = ref<number | string>(props.room.messageRetentionDays ?? 30);
const stats = ref<Misskey.Endpoints['chat/rooms/manage/stats']['res'] | null>(null);
const isSilenced = ref(props.room.isSilenced);
const slowModeSeconds = ref<number | string>(props.room.slowModeSeconds ?? 0);
const keywordsText = ref((props.room.bannedKeywords ?? []).join('\n'));
const keywordMuteSeconds = ref<number | string>(props.room.keywordMuteSeconds ?? 0);
const announcement = ref(props.room.announcement);
// 有正文时默认置顶；普通成员无法关闭聊天页横幅，仅管理员在此开关/清空
const announcementPinned = ref(props.room.announcementPinned || (props.room.announcement ?? '').trim().length > 0);
const announcementChanged = computed(() => announcement.value !== props.room.announcement || announcementPinned.value !== props.room.announcementPinned);
const bans = ref<Misskey.entities.ChatRoomsBansListResponse>([]);
const bansFetching = ref(true);
const bansMoreFetching = ref(false);
const bansCanFetchMore = ref(false);
const BANS_LIMIT = 30;
const mutedMembers = ref<Misskey.entities.ChatRoomMembership[]>([]);
const mutedFetching = ref(true);
const muteLog = ref<ChatMuteLogEntry[]>([]);
const muteLogFetching = ref(false);
const muteLogSearchQuery = ref('');
const canManageRoomRoles = computed(() => props.room.canManageRoomRoles === true || props.room.ownerId === $i?.id || $i?.isAdmin === true || $i?.isModerator === true);

const normalizedRetentionDays = computed(() => {
	if (!retentionEnabled.value) return null;
	const days = Number(retentionDays.value);
	if (!Number.isInteger(days)) return undefined;
	if (days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) return undefined;
	return days;
});
const canSaveRetention = computed(() => normalizedRetentionDays.value !== undefined);

function parseKeywords(text: string): string[] {
	return Array.from(new Set(text.split('\n').map(k => k.trim()).filter(k => k.length > 0))).slice(0, 100);
}

const slowModeChanged = computed(() => {
	const v = Number(slowModeSeconds.value);
	if (!Number.isInteger(v) || v < 0 || v > 86400) return false;
	return v !== (props.room.slowModeSeconds ?? 0);
});
const keywordChanged = computed(() => {
	const mute = Number(keywordMuteSeconds.value);
	if (!Number.isInteger(mute) || mute < -1) return false;
	const parsed = parseKeywords(keywordsText.value);
	const current = props.room.bannedKeywords ?? [];
	const keywordsDiffer = parsed.length !== current.length || parsed.some((k, i) => k !== current[i]);
	return keywordsDiffer || mute !== (props.room.keywordMuteSeconds ?? 0);
});
const maxDailyCount = computed(() => Math.max(1, ...(stats.value?.daily.map(item => item.count) ?? [0])));
const normalizedMuteLogSearchQuery = computed(() => muteLogSearchQuery.value.trim().normalize('NFC').toLowerCase());
const filteredMuteLog = computed(() => {
	const query = normalizedMuteLogSearchQuery.value;
	if (query === '') return muteLog.value;
	return muteLog.value.filter(log => muteLogMatchesSearch(log, query));
});

watch(() => props.room, (room, oldRoom) => {
	retentionEnabled.value = props.room.messageRetentionDays != null;
	retentionDays.value = props.room.messageRetentionDays ?? 30;
	isSilenced.value = props.room.isSilenced;
	slowModeSeconds.value = props.room.slowModeSeconds ?? 0;
	keywordsText.value = (props.room.bannedKeywords ?? []).join('\n');
	keywordMuteSeconds.value = props.room.keywordMuteSeconds ?? 0;
	announcement.value = props.room.announcement;
	announcementPinned.value = props.room.announcementPinned;
	loadStats();
	if (oldRoom != null && oldRoom.id !== room.id) {
		muteLogSearchQuery.value = '';
		loadBans();
		loadMutedMembers();
		loadMuteLog();
	}
});

onMounted(() => {
	loadStats();
	loadBans();
	loadMutedMembers();
	loadMuteLog();
});

function isMutedNow(membership: Misskey.entities.ChatRoomMembership) {
	return membership.mutedUntil != null && Date.parse(membership.mutedUntil) > Date.now();
}

function mutedUntilText(membership: Misskey.entities.ChatRoomMembership) {
	if (membership.mutedUntil == null) return '';
	if (new Date(membership.mutedUntil).getFullYear() >= 9999) return i18n.ts._chat.mutedForever;
	return i18n.tsx._chat.mutedUntil({ time: dateString(membership.mutedUntil) });
}

function isStillMuted(mutedUntil: string | null): boolean {
	if (mutedUntil == null) return false;
	return new Date(mutedUntil).getTime() > Date.now();
}

function muteLogMatchesSearch(log: ChatMuteLogEntry, query: string): boolean {
	const user = log.user;
	const userHandle = user == null ? '' : user.host == null ? `@${user.username}` : `@${user.username}@${user.host}`;
	return [
		log.keyword,
		user?.id ?? '',
		user?.username ?? '',
		user?.name ?? '',
		userHandle,
	].some(value => value.toLowerCase().includes(query));
}

async function loadMuteLog() {
	muteLogFetching.value = true;
	try {
		muteLog.value = await misskeyApi('chat/rooms/mute-log', {
			roomId: props.room.id,
			limit: 100,
		});
	} catch {
		muteLog.value = [];
	} finally {
		muteLogFetching.value = false;
	}
}

async function clearMuteLog() {
	const { canceled } = await os.confirm({ type: 'warning', text: i18n.ts.chatMuteLogClearConfirm });
	if (canceled) return;
	await os.apiWithDialog('chat/rooms/clear-mute-log', { roomId: props.room.id });
	muteLog.value = [];
}

async function loadMutedMembers() {
	mutedFetching.value = true;
	try {
		// 禁言中のメンバーは多くないため、メンバー一覧を取得してフィルタする
		const res = await misskeyApi('chat/rooms/members', {
			roomId: props.room.id,
			limit: 100,
		});
		mutedMembers.value = res.filter(m => isMutedNow(m) && m.user != null);
	} catch {
		mutedMembers.value = [];
	} finally {
		mutedFetching.value = false;
	}
}

async function unmuteMember(membership: Misskey.entities.ChatRoomMembership) {
	await os.apiWithDialog('chat/rooms/unmute-member', {
		roomId: props.room.id,
		userId: membership.userId,
	});
	mutedMembers.value = mutedMembers.value.filter(m => m.id !== membership.id);
}

async function saveSilenced(value: boolean) {
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		isSilenced: value,
	});
	emit('updated', updated);
}

async function saveSlowMode() {
	if (!slowModeChanged.value) return;
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		slowModeSeconds: Number(slowModeSeconds.value),
	});
	emit('updated', updated);
}

async function saveKeywordFilter() {
	if (!keywordChanged.value) return;
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		bannedKeywords: parseKeywords(keywordsText.value),
		keywordMuteSeconds: Number(keywordMuteSeconds.value),
	});
	keywordsText.value = ((updated.bannedKeywords ?? []) as string[]).join('\n');
	emit('updated', updated);
}

async function saveAnnouncement() {
	const text = announcement.value ?? '';
	// 有正文时默认置顶，确保聊天区能显示
	const pinned = text.trim().length > 0 ? true : false;
	announcementPinned.value = pinned;
	const updated = await os.apiWithDialog('chat/rooms/update', {
		roomId: props.room.id,
		announcement: text,
		announcementPinned: pinned,
	});
	emit('updated', updated);
}

async function loadBans() {
	bansFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/bans/list', {
			roomId: props.room.id,
			limit: BANS_LIMIT,
		});
		bans.value = res.filter(b => b.user != null);
		bansCanFetchMore.value = res.length >= BANS_LIMIT;
	} catch {
		bans.value = [];
	} finally {
		bansFetching.value = false;
	}
}

async function fetchMoreBans() {
	const untilId = bans.value.at(-1)?.id;
	if (untilId == null || bansMoreFetching.value) return;

	bansMoreFetching.value = true;
	try {
		const res = await misskeyApi('chat/rooms/bans/list', {
			roomId: props.room.id,
			limit: BANS_LIMIT,
			untilId,
		});
		bans.value = [...bans.value, ...res];
		bansCanFetchMore.value = res.length >= BANS_LIMIT;
	} finally {
		bansMoreFetching.value = false;
	}
}

async function unban(ban: Misskey.entities.ChatRoomsBansListResponse[number]) {
	await os.apiWithDialog('chat/rooms/bans/delete', {
		roomId: props.room.id,
		userId: ban.userId,
	});
	bans.value = bans.value.filter(b => b.id !== ban.id);
}

function dateString(value: string) {
	return new Date(value).toLocaleDateString();
}

function barHeight(count: number) {
	return Math.max(count === 0 ? 0 : 8, Math.round((count / maxDailyCount.value) * 100));
}

async function loadStats() {
	try {
		stats.value = await misskeyApi('chat/rooms/manage/stats', {
			roomId: props.room.id,
			days: 14,
		});
	} catch {
		// 取得失敗時はローディング表示のままにせず空扱いにする
		stats.value = { total: 0, oldestAt: null, newestAt: null, daily: [] } as Misskey.Endpoints['chat/rooms/manage/stats']['res'];
	}
}

async function saveRetention() {
	if (normalizedRetentionDays.value === undefined) return;

	const updated = await os.apiWithDialog('chat/rooms/manage/update', {
		roomId: props.room.id,
		messageRetentionDays: normalizedRetentionDays.value,
	});
	emit('updated', updated);
}

async function deleteAllMessages() {
	const auth = await os.authenticateDialog();
	if (auth.canceled) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts._chat.deleteAllMessagesConfirm,
	});
	if (canceled) return;

	await os.apiWithDialog('chat/rooms/manage/delete-all-messages', {
		roomId: props.room.id,
		password: auth.result.password,
	});
	await loadStats();
	emit('cleared');
}
</script>

<style lang="scss" module>
.section {
	display: grid;
	gap: 16px;
	padding: 16px;
	border: solid 1px color(from var(--MI_THEME-fg) srgb r g b / 0.12);
	border-radius: var(--MI-radius);
	background: color(from var(--MI_THEME-panel) srgb r g b / 0.55);
}

.dangerSection {
	border-color: color(from var(--MI_THEME-error) srgb r g b / 0.35);
}

	.title {
		font-weight: 700;
	}

	.titleRow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		min-width: 0;
	}

	.subTitle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.78);
		font-size: 0.9em;
		font-weight: 700;

		> span {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}
	}

	.keywordMuteLog {
		display: grid;
		gap: 10px;
		min-width: 0;
		padding-top: 4px;
	}

	.inlineSearchInput {
		min-width: 0;
	}

	.clearLogButton {
		flex: 0 0 auto;
		padding: 2px 10px;
		border: solid 1px color(from var(--MI_THEME-error) srgb r g b / 0.5);
		border-radius: 999px;
		color: var(--MI_THEME-error);
		font-size: 0.85em;

		&:hover {
			background: color(from var(--MI_THEME-error) srgb r g b / 0.1);
		}
	}

.loading {
	display: grid;
	place-items: center;
	min-height: 140px;
}

.statsGrid {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 10px;

	> div {
		min-width: 0;
		padding: 10px;
		border-radius: var(--MI-radius-sm);
		background: color(from var(--MI_THEME-bg) srgb r g b / 0.45);
	}

	span {
		display: block;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
		font-size: 0.85em;
	}

	b {
		display: block;
		margin-top: 4px;
		overflow: hidden;
		color: var(--MI_THEME-fg);
		text-overflow: ellipsis;
		white-space: nowrap;
	}
}

.chart {
	display: grid;
	grid-template-columns: repeat(14, minmax(12px, 1fr));
	align-items: end;
	gap: 6px;
	height: 180px;
	padding-top: 8px;
}

.barWrap {
	display: grid;
	grid-template-rows: 1fr auto;
	align-items: end;
	min-width: 0;
	height: 100%;
	gap: 6px;

	> span {
		overflow: hidden;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
		font-size: 0.72em;
		text-align: center;
		text-overflow: clip;
		white-space: nowrap;
	}
}

.barTrack {
	position: relative;
	height: 100%;
	min-height: 0;
	border-radius: var(--MI-radius-sm);
	background: color(from var(--MI_THEME-fg) srgb r g b / 0.08);
	overflow: hidden;
}

.bar {
	position: absolute;
	right: 0;
	bottom: 0;
	left: 0;
	border-radius: var(--MI-radius-sm) var(--MI-radius-sm) 0 0;
	background: linear-gradient(180deg, var(--MI_THEME-accent), color(from var(--MI_THEME-accent) srgb r g b / 0.62));
}

	.caption {
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.75);
		font-size: 0.9em;
	}

	.previewScrollList {
		max-height: min(360px, 44dvh);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 4px;
		scrollbar-gutter: stable;
	}

	.muteLogList {
		display: grid;
		gap: 10px;
		min-width: 0;
	}

	.muteLogRow {
		display: grid;
		gap: 6px;
		min-width: 0;
		padding: 10px;
		border-radius: var(--MI-radius-sm);
		background: color(from var(--MI_THEME-bg) srgb r g b / 0.42);
	}

	.muteLogUserLink {
		display: block;
		min-width: 0;

		&:hover {
			text-decoration: none;
		}
	}

	.unknownUser {
		overflow: hidden;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.7);
		font-size: 0.9em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.muteLogMeta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px 10px;
		min-width: 0;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.72);
		font-size: 0.84em;
	}

	.muteLogStatus {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex: 0 0 auto;
		padding: 2px 8px;
		border-radius: 999px;
		background: color(from var(--MI_THEME-warn) srgb r g b / 0.14);
		color: var(--MI_THEME-warn);
		font-weight: 700;
		white-space: nowrap;
	}

	.muteLogKeyword {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.muteLogTime {
		margin-left: auto;
		color: color(from var(--MI_THEME-fg) srgb r g b / 0.58);
		white-space: nowrap;
	}

.banList {
	display: grid;
	gap: 10px;
	min-width: 0;
}

	.banScrollList {
		max-height: min(360px, 48dvh);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-right: 4px;
		scrollbar-gutter: stable;
	}

.banRow {
	display: flex;
	align-items: center;
	gap: 8px;
	min-width: 0;
}

.banRowLink {
	flex: 1;
	min-width: 0;

	&:hover {
		text-decoration: none;
	}
}

.banRowButton {
	flex: 0 0 auto;
}

.mutedUntilLabel {
	flex: 0 0 auto;
	color: var(--MI_THEME-warn);
	font-size: 0.82em;
	white-space: nowrap;
}

	@media (max-width: 600px) {
		.titleRow {
			align-items: flex-start;
			flex-direction: column;
		}

		.statsGrid {
			grid-template-columns: 1fr;
		}

	.chart {
		gap: 4px;
	}

		.barWrap > span {
			font-size: 0.65em;
		}

		.muteLogTime {
			margin-left: 0;
			width: 100%;
		}
	}
</style>
