<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<FormSuspense :p="init">
			<div class="_gaps_m">
				<MkSwitch :modelValue="enableRegistration" @update:modelValue="onChange_enableRegistration">
					<template #label>{{ i18n.ts._serverSettings.openRegistration }}</template>
					<template #caption>
						<div>{{ i18n.ts._serverSettings.thisSettingWillAutomaticallyOffWhenModeratorsInactive }}</div>
						<div><i class="ti ti-alert-triangle" style="color: var(--MI_THEME-warn);"></i> {{ i18n.ts._serverSettings.openRegistrationWarning }}</div>
					</template>
				</MkSwitch>

				<MkSwitch v-model="emailRequiredForSignup" @change="onChange_emailRequiredForSignup">
					<template #label>{{ i18n.ts.emailRequiredForSignup }}</template>
				</MkSwitch>

				<MkSwitch v-model="approvalRequiredForSignup" @change="onChange_approvalRequiredForSignup">
					<template #label>{{ i18n.ts.approvalRequiredForSignup }}</template>
				</MkSwitch>

				<MkFolder>
					<template #icon><i class="ti ti-mail-cog"></i></template>
					<template #label>{{ i18n.ts.signupEmailRestriction }}</template>

					<div class="_gaps">
						<MkSwitch v-model="signupEmailRestriction" @update:modelValue="save_signupEmailRestriction">
							<template #label>{{ i18n.ts.enableSignupEmailRestriction }}</template>
							<template #caption>{{ i18n.ts.signupEmailRestrictionDescription }}</template>
						</MkSwitch>

						<div class="_gaps_s">
							<div v-for="(rule, i) in signupEmailRules" :key="i" :class="$style.ruleRow">
								<MkInput v-model="rule.domain" :class="$style.ruleDomain" :spellcheck="false" placeholder="qq.com">
									<template #label>{{ i18n.ts.domain }}</template>
								</MkInput>
								<MkInput v-model="rule.localPartRegex" :class="$style.ruleRegex" :spellcheck="false" placeholder="^[0-9]{1,10}$">
									<template #label>{{ i18n.ts.localPartRegex }}</template>
								</MkInput>
								<button class="_button" :class="$style.ruleDel" @click="signupEmailRules.splice(i, 1)"><i class="ti ti-trash"></i></button>
							</div>
							<div :class="$style.ruleActions">
								<MkButton rounded @click="signupEmailRules.push({ domain: '', localPartRegex: '' })"><i class="ti ti-plus"></i> {{ i18n.ts.add }}</MkButton>
								<MkButton rounded @click="applyEmailPreset">✨ Gmail + QQ</MkButton>
							</div>
						</div>

						<MkInput v-model="emailTest" :spellcheck="false" placeholder="123456@qq.com">
							<template #label>{{ i18n.ts.testEmail }}</template>
							<template #caption>
								<span v-if="emailTest.includes('@')" :style="{ color: emailTestResult ? 'var(--MI_THEME-success)' : 'var(--MI_THEME-error)', fontWeight: 700 }">
									<i :class="emailTestResult ? 'ti ti-check' : 'ti ti-x'"></i> {{ emailTestResult ? i18n.ts.emailAllowed : i18n.ts.emailNotAllowed }}
								</span>
							</template>
						</MkInput>

						<MkButton primary @click="save_signupEmailRules">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<FormLink to="/admin/server-rules">{{ i18n.ts.serverRules }}</FormLink>

				<MkFolder>
					<template #icon><i class="ph-drop ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.bubbleTimeline }}</template>

					<div class="_gaps">
							<div v-if="$i && !$i.policies.btlAvailable">
							<i class="ti ti-alert-triangle"></i> {{ i18n.ts.bubbleTimelineMustBeEnabled }}
						</div>

						<MkTextarea v-model="bubbleTimeline">
							<template #caption>{{ i18n.ts.bubbleTimelineDescription }}</template>
						</MkTextarea>

						<MkButton primary @click="save_bubbleTimeline">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #prefix><i class="ti ti-link"></i></template>
					<template #label>{{ i18n.ts.trustedLinkUrlPatterns }}</template>

					<div class="_gaps">
						<MkTextarea v-model="trustedLinkUrlPatterns">
							<template #caption>{{ i18n.ts.trustedLinkUrlPatternsDescription }}</template>
						</MkTextarea>

						<SkPatternTest :mutedWords="trustedLinkUrlPatterns"></SkPatternTest>

						<MkButton primary @click="save_trustedLinkUrlPatterns">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-lock-star"></i></template>
					<template #label>{{ i18n.ts.preservedUsernames }}</template>

					<div class="_gaps">
						<MkTextarea v-model="preservedUsernames">
							<template #caption>{{ i18n.ts.preservedUsernamesDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_preservedUsernames">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-message-exclamation"></i></template>
					<template #label>{{ i18n.ts.sensitiveWords }}</template>

					<div class="_gaps">
						<MkTextarea v-model="sensitiveWords">
							<template #caption>{{ i18n.ts.sensitiveWordsDescription }}<br>{{ i18n.ts.sensitiveWordsDescription2 }}</template>
						</MkTextarea>

						<SkPatternTest :mutedWords="sensitiveWords"></SkPatternTest>

						<MkButton primary @click="save_sensitiveWords">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-message-x"></i></template>
					<template #label>{{ i18n.ts.prohibitedWords }}</template>

					<div class="_gaps">
						<MkTextarea v-model="prohibitedWords">
							<template #caption>{{ i18n.ts.prohibitedWordsDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
						</MkTextarea>

						<SkPatternTest :mutedWords="prohibitedWords"></SkPatternTest>

						<MkButton primary @click="save_prohibitedWords">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-user-x"></i></template>
					<template #label>{{ i18n.ts.prohibitedWordsForNameOfUser }}</template>

					<div class="_gaps">
						<MkTextarea v-model="prohibitedWordsForNameOfUser">
							<template #caption>{{ i18n.ts.prohibitedWordsForNameOfUserDescription }}<br>{{ i18n.ts.prohibitedWordsDescription2 }}</template>
						</MkTextarea>

						<SkPatternTest :mutedWords="prohibitedWordsForNameOfUser"></SkPatternTest>

						<MkButton primary @click="save_prohibitedWordsForNameOfUser">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-eye-off"></i></template>
					<template #label>{{ i18n.ts.hiddenTags }}</template>

					<div class="_gaps">
						<MkTextarea v-model="hiddenTags">
							<template #caption>{{ i18n.ts.hiddenTagsDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_hiddenTags">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-search-off"></i></template>
					<template #label>隐藏的搜索热词</template>

					<div class="_gaps">
						<MkTextarea v-model="hiddenSearchTrendTerms">
							<template #caption>每行一个。这里只影响热门讨论、首页搜索推荐和探索页展示，不删除帖子，也不影响手动搜索。</template>
						</MkTextarea>
						<MkButton primary @click="save_hiddenSearchTrendTerms">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-eye-off"></i></template>
					<template #label>{{ i18n.ts.silencedInstances }}</template>

					<div class="_gaps">
						<MkTextarea v-model="silencedHosts">
							<template #caption>{{ i18n.ts.silencedInstancesDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_silencedHosts">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-eye-off"></i></template>
					<template #label>{{ i18n.ts.mediaSilencedInstances }}</template>

					<div class="_gaps">
						<MkTextarea v-model="mediaSilencedHosts">
							<template #caption>{{ i18n.ts.mediaSilencedInstancesDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_mediaSilencedHosts">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

				<MkFolder>
					<template #icon><i class="ti ti-ban"></i></template>
					<template #label>{{ i18n.ts.blockedInstances }}</template>

					<div class="_gaps">
						<MkTextarea v-model="blockedHosts">
							<template #caption>{{ i18n.ts.blockedInstancesDescription }}</template>
						</MkTextarea>
						<MkButton primary @click="save_blockedHosts">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>

					<MkFolder v-if="$i?.isRoot">
					<template #icon><i class="ph-lightning ph-bold ph-lg"></i></template>
					<template #label>{{ i18n.ts.setRootUser }}</template>
					<template #header><div :class="$style.folderHeader" v-html="i18n.ts.setRootUserWarning"></div></template>

					<div class="_gaps">
						<MkButton primary @click="selectUser">{{ i18n.ts.selectUser }}</MkButton>
						<div v-if="newRootUser != null" style="overflow: hidden;">
							<MkUserCardMini
								:user="newRootUser"
								:withChart="false"
							/>
						</div>
						<MkButton primary :disabled="newRootUser == null" @click="save_setRoot">{{ i18n.ts.save }}</MkButton>
					</div>
				</MkFolder>
			</div>
		</FormSuspense>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
	import { ref, computed, shallowRef } from 'vue';
	import type * as Misskey from 'misskey-js';
	import MkSwitch from '@/components/MkSwitch.vue';
	import MkInput from '@/components/MkInput.vue';
	import MkTextarea from '@/components/MkTextarea.vue';
	import FormSuspense from '@/components/form/suspense.vue';
	import * as os from '@/os.js';
	import { misskeyApi } from '@/utility/misskey-api.js';
	import { fetchInstance } from '@/instance.js';
	import { i18n } from '@/i18n.js';
	import { definePage } from '@/page.js';
	import MkButton from '@/components/MkButton.vue';
	import FormLink from '@/components/form/link.vue';
	import MkFolder from '@/components/MkFolder.vue';
	import MkUserCardMini from '@/components/MkUserCardMini.vue';
	import SkPatternTest from '@/components/SkPatternTest.vue';
	import { $i } from '@/i';
	import { refreshCurrentAccount } from '@/accounts.js';

	const enableRegistration = ref<boolean>(false);
	const emailRequiredForSignup = ref<boolean>(false);
	const approvalRequiredForSignup = ref<boolean>(false);
	const sensitiveWords = ref<string>('');
	const prohibitedWords = ref<string>('');
	const prohibitedWordsForNameOfUser = ref<string>('');
	const hiddenTags = ref<string>('');
	const hiddenSearchTrendTerms = ref<string>('');
	const preservedUsernames = ref<string>('');
	const bubbleTimeline = ref<string>('');
	const trustedLinkUrlPatterns = ref<string>('');
	const blockedHosts = ref<string>('');
	const silencedHosts = ref<string>('');
	const mediaSilencedHosts = ref<string>('');
	const signupEmailRestriction = ref<boolean>(false);
	const signupEmailRules = ref<{ domain: string; localPartRegex: string; }[]>([]);
	const emailTest = ref<string>('');
	const newRootUser = shallowRef<Misskey.entities.UserDetailed | null>(null);

	const emailTestResult = computed(() => {
		const email = emailTest.value.trim();
		const at = email.lastIndexOf('@');
		if (at <= 0) return false;
		const local = email.slice(0, at);
		const domain = email.slice(at + 1).toLowerCase();
		if (!signupEmailRestriction.value) return true;
		const rule = signupEmailRules.value.find(r => r.domain.trim().toLowerCase() === domain);
		if (rule == null) return false;
		if (rule.localPartRegex.trim().length > 0) {
			try {
				return new RegExp(rule.localPartRegex.trim()).test(local);
			} catch {
				return true;
			}
		}
		return true;
	});

	async function init() {
		const meta = await misskeyApi('admin/meta');
		enableRegistration.value = !meta.disableRegistration;
		emailRequiredForSignup.value = meta.emailRequiredForSignup;
		approvalRequiredForSignup.value = meta.approvalRequiredForSignup;
		sensitiveWords.value = meta.sensitiveWords.join('\n');
		prohibitedWords.value = meta.prohibitedWords.join('\n');
		prohibitedWordsForNameOfUser.value = meta.prohibitedWordsForNameOfUser.join('\n');
		hiddenTags.value = meta.hiddenTags.join('\n');
		hiddenSearchTrendTerms.value = (meta.hiddenSearchTrendTerms ?? []).join('\n');
		preservedUsernames.value = meta.preservedUsernames.join('\n');
		bubbleTimeline.value = meta.bubbleInstances.join('\n');
		trustedLinkUrlPatterns.value = meta.trustedLinkUrlPatterns.join('\n');
		blockedHosts.value = meta.blockedHosts.join('\n');
		silencedHosts.value = meta.silencedHosts?.join('\n') ?? '';
		mediaSilencedHosts.value = meta.mediaSilencedHosts.join('\n');
		signupEmailRestriction.value = meta.signupEmailRestriction ?? false;
		signupEmailRules.value = (meta.signupEmailRules ?? []).map(r => ({ domain: r.domain, localPartRegex: r.localPartRegex }));
	}

	async function onChange_enableRegistration(value: boolean) {
		if (value) {
			const { canceled } = await os.confirm({
				type: 'warning',
				text: i18n.ts.acknowledgeNotesAndEnable,
			});
			if (canceled) return;
		}

		enableRegistration.value = value;

		os.apiWithDialog('admin/update-meta', {
			disableRegistration: !value,
		}).then(() => {
			fetchInstance(true);
		});
	}

	function onChange_emailRequiredForSignup(value: boolean) {
		os.apiWithDialog('admin/update-meta', {
			emailRequiredForSignup: value,
		}).then(() => {
			fetchInstance(true);
		});
	}

	function onChange_approvalRequiredForSignup(value: boolean) {
		os.apiWithDialog('admin/update-meta', {
			approvalRequiredForSignup: value,
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_bubbleTimeline() {
		os.apiWithDialog('admin/update-meta', {
			bubbleInstances: bubbleTimeline.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_trustedLinkUrlPatterns() {
		os.apiWithDialog('admin/update-meta', {
			trustedLinkUrlPatterns: trustedLinkUrlPatterns.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_preservedUsernames() {
		os.apiWithDialog('admin/update-meta', {
			preservedUsernames: preservedUsernames.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_sensitiveWords() {
		os.apiWithDialog('admin/update-meta', {
			sensitiveWords: sensitiveWords.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_prohibitedWords() {
		os.apiWithDialog('admin/update-meta', {
			prohibitedWords: prohibitedWords.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_prohibitedWordsForNameOfUser() {
		os.apiWithDialog('admin/update-meta', {
			prohibitedWordsForNameOfUser: prohibitedWordsForNameOfUser.value.split('\n'),
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_hiddenTags() {
		const normalizedHiddenTags = Array.from(new Set(hiddenTags.value
			.split('\n')
			.map(x => x.trim().replace(/^#+/, ''))
			.map(x => x.normalize('NFKC').toLowerCase())
			.filter(Boolean)));

		os.apiWithDialog('admin/update-meta', {
			hiddenTags: normalizedHiddenTags,
		}).then(() => {
			hiddenTags.value = normalizedHiddenTags.join('\n');
			fetchInstance(true);
		});
	}

	function save_hiddenSearchTrendTerms() {
		const normalizedHiddenSearchTrendTerms = Array.from(new Set(hiddenSearchTrendTerms.value
			.split('\n')
			.map(x => x.trim().replace(/^#+/, ''))
			.map(x => x.normalize('NFKC').toLowerCase())
			.filter(Boolean)));

		os.apiWithDialog('admin/update-meta', {
			hiddenSearchTrendTerms: normalizedHiddenSearchTrendTerms,
		}).then(() => {
			hiddenSearchTrendTerms.value = normalizedHiddenSearchTrendTerms.join('\n');
			fetchInstance(true);
		});
	}

	function save_blockedHosts() {
		os.apiWithDialog('admin/update-meta', {
			blockedHosts: blockedHosts.value.split('\n') || [],
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_silencedHosts() {
		os.apiWithDialog('admin/update-meta', {
			silencedHosts: silencedHosts.value.split('\n') || [],
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_mediaSilencedHosts() {
		os.apiWithDialog('admin/update-meta', {
			mediaSilencedHosts: mediaSilencedHosts.value.split('\n') || [],
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_signupEmailRestriction(value: boolean) {
		os.apiWithDialog('admin/update-meta', {
			signupEmailRestriction: value,
		}).then(() => {
			fetchInstance(true);
		});
	}

	function save_signupEmailRules() {
		const cleaned = signupEmailRules.value
			.map(r => ({ domain: r.domain.trim().toLowerCase(), localPartRegex: r.localPartRegex.trim() }))
			.filter(r => r.domain.length > 0);
		// 同时保存「开关」+「规则」,避免出现「规则存了但开关没开 → 不生效」。
		os.apiWithDialog('admin/update-meta', {
			signupEmailRestriction: signupEmailRestriction.value,
			signupEmailRules: cleaned,
		}).then(() => {
			signupEmailRules.value = cleaned;
			fetchInstance(true);
		});
	}

	function applyEmailPreset() {
		// QQ: 纯数字(防别名) / Gmail: 仅字母数字(禁 . 和 + 别名)
		signupEmailRules.value = [
			{ domain: 'qq.com', localPartRegex: '^[0-9]{1,10}$' },
			{ domain: 'gmail.com', localPartRegex: '^[a-zA-Z0-9]+$' },
		];
		signupEmailRestriction.value = true;
	}

	function selectUser() {
		os.selectUser({
			includeSelf: true,
			localOnly: true,
		}).then(_user => {
			newRootUser.value = _user;
		});
	}

		function save_setRoot() {
			if (newRootUser.value == null) return;

			os.apiWithDialog('admin/set-root', {
				userId: newRootUser.value.id,
			}).then(() => {
			refreshCurrentAccount();
		});
	}

	const headerTabs = computed(() => []);

	definePage(() => ({
		title: i18n.ts.moderation,
		icon: 'ti ti-shield',
	}));
</script>

<style lang="scss" module>
.folderHeader {
	padding: var(--MI-marginHalf);
	gap: var(--MI-marginHalf);
}

.ruleRow {
	display: flex;
	align-items: flex-end;
	gap: 8px;
}

.ruleDomain {
	flex: 0 0 40%;
	min-width: 0;
}

.ruleRegex {
	flex: 1;
	min-width: 0;
}

.ruleDel {
	flex: 0 0 auto;
	padding: 8px 10px;
	margin-bottom: 2px;
	color: var(--MI_THEME-error);

	&:hover { background: var(--MI_THEME-buttonHoverBg); }
}

.ruleActions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}
</style>
