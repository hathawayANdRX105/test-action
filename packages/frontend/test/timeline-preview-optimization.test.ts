/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

import { assert, describe, test } from 'vitest';
import localStorageSource from '@/local-storage.ts?raw';
import mkNoteSource from '@/components/MkNote.vue?raw';
import skNoteSource from '@/components/SkNote.vue?raw';
import skNoteSubSource from '@/components/SkNoteSub.vue?raw';
import forumCardSource from '@/components/SkTimelineForumItem.vue?raw';
import masonryCardSource from '@/components/SkTimelineMasonryCard.vue?raw';
import autoTranslateSwitchSource from '@/components/SkAutoTranslateSwitch.vue?raw';
import viewSwitchSource from '@/components/SkTimelineViewSwitch.vue?raw';
import previewTranslationSource from '@/composables/use-timeline-preview-translation.ts?raw';
import timelineSource from '@/pages/timeline.vue?raw';
import zhCnLocaleSource from '../../../locales/zh-CN.yml?raw';

describe('timeline preview optimization', () => {
	test('removes only the category home tab while preserving hashtag filtering', () => {
		assert.notMatch(timelineSource, /key:\s*'category'\s+as const/);
		assert.notMatch(timelineSource, /type HomeTab = [^;]*'category'/);
		assert.notMatch(timelineSource, /homeTab\.value === 'category'/);
		assert.notMatch(timelineSource, /homeTab !== 'following' && homeTab !== 'category'/);
		assert.match(timelineSource, /const categoryHashtag = ref<string \| null>\(null\)/);
		assert.match(timelineSource, /:tag="categoryHashtag \?\? undefined"/);
		assert.match(timelineSource, /if \(v === 'category'\) \{[\s\S]*miLocalStorage\.setItem\(HOME_TAB_KEY,\s*'forYou'\);[\s\S]*return 'forYou';[\s\S]*\}/);
		assert.match(localStorageSource, /'home:scope'/);
	});

	test('masonry and forum previews use batched translation without URL preview rendering', () => {
		assert.match(previewTranslationSource, /const BATCH_SIZE = 4;/);
		assert.match(previewTranslationSource, /const FLUSH_DELAY_MS = 200;/);
		assert.match(previewTranslationSource, /const FAILURE_RETRY_DELAY_MS = 15_000;/);
		assert.match(previewTranslationSource, /const MAX_FAILURE_RETRIES = 2;/);
		assert.match(previewTranslationSource, /misskeyApi\('notes\/translate-batch'/);
		assert.match(previewTranslationSource, /getCachedTranslation\(note\.id,\s*targetLang\)/);
		assert.match(previewTranslationSource, /setCachedTranslation\(noteId,\s*targetLang,\s*translation\)/);
		assert.match(previewTranslationSource, /retryCount:\s*Ref<number>/);
		assert.match(previewTranslationSource, /retrying:\s*Ref<boolean>/);
		assert.match(previewTranslationSource, /scheduleRetry\(state\)/);
		assert.match(previewTranslationSource, /window\.setTimeout\(\(\) => \{[\s\S]*state\.translation\.value = null;[\s\S]*enqueue\(state\);/);
		assert.match(previewTranslationSource, /previewTranslationStatus/);
		assert.match(previewTranslationSource, /'翻译中\.\.\.'/);
		assert.match(previewTranslationSource, /'稍后自动重试'/);
		assert.match(previewTranslationSource, /prefer\.r\.autoTranslateNotes\.value/);
		assert.match(previewTranslationSource, /prefer\.r\.autoTranslateReplaceOriginal\.value/);

		for (const source of [masonryCardSource, forumCardSource]) {
			assert.match(source, /useTimelinePreviewTranslation/);
			assert.match(source, /getAppearNote/);
			assert.match(source, /translationNoteRef/);
			assert.match(source, /translatedPreview/);
			assert.match(source, /previewTranslationText/);
			assert.match(source, /previewTranslationStatus/);
			assert.notMatch(source, /SkUrlPreviewGroup|MkUrlPreview/);
			assert.match(source, /:preview="false"/);
		}
	});

	test('masonry cards proxy remote media and never fall back to remote originals', () => {
		assert.match(masonryCardSource, /import \{ getStaticImageUrl \} from '@\/utility\/media-proxy\.js';/);
		assert.match(masonryCardSource, /const cardImageUrl = computed/);
		assert.match(masonryCardSource, /return safeCardImageUrl\(image\.url\);/);
		assert.match(masonryCardSource, /function isSameOriginUrl/);
		assert.match(masonryCardSource, /function withGridCoverCacheKey/);
		assert.match(masonryCardSource, /gridCover/);
		assert.match(masonryCardSource, /:src="cardImageUrl"/);
		assert.match(masonryCardSource, /@error="onImageError"/);
		assert.match(masonryCardSource, /decoding="async"/);
		assert.match(masonryCardSource, /referrerpolicy="no-referrer"/);
		assert.notMatch(masonryCardSource, /firstImage\.thumbnailUrl \?\? firstImage\.url/);
		assert.notMatch(masonryCardSource, /<video\b/);
	});

	test('auto-translate popup stays within the mobile viewport without becoming a bottom sheet', () => {
		assert.match(autoTranslateSwitchSource, /:style="popupStyle"/);
		assert.match(autoTranslateSwitchSource, /function updatePopupPosition\(\): void/);
		assert.match(autoTranslateSwitchSource, /getBoundingClientRect\(\)/);
		assert.match(autoTranslateSwitchSource, /Math\.max\(MOBILE_MARGIN/);
		assert.match(autoTranslateSwitchSource, /\.cacheStats\s*\{[\s\S]*min-width:\s*0;[\s\S]*overflow:\s*hidden;[\s\S]*text-overflow:\s*ellipsis;/);
		assert.match(autoTranslateSwitchSource, /\.cacheRow\s*\{[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*8px;/);
		assert.match(autoTranslateSwitchSource, /@media \(max-width: 700px\) \{[\s\S]*position:\s*fixed;[\s\S]*right:\s*auto;[\s\S]*bottom:\s*auto;[\s\S]*width:\s*min\(320px,\s*calc\(100vw - 24px\)\);/);
		assert.notMatch(autoTranslateSwitchSource, /bottom:\s*16px;/);
	});

	test('mobile hashtag chips wrap instead of forcing horizontal scrolling', () => {
		assert.match(timelineSource, /@media \(max-width: 700px\) \{[\s\S]*\.tagChips\s*\{[\s\S]*flex-wrap:\s*wrap;[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
		assert.match(timelineSource, /\.tagChip,\s*\.tagChipMore\s*\{[\s\S]*flex:\s*0 1 auto;[\s\S]*max-width:\s*calc\(50vw - 16px\);/);
		assert.notMatch(timelineSource, /flex-wrap:\s*nowrap;[\s\S]*overflow-x:\s*auto;[\s\S]*scrollbar-width:\s*none;/);
	});

	test('normal note translation is bound to the displayed appearNote', () => {
		assert.match(skNoteSource, /<SkNoteTranslation :note="appearNote"/);
		assert.match(mkNoteSource, /<SkNoteTranslation :note="appearNote"/);
		assert.match(skNoteSubSource, /<MkSubNoteContent[^>]+:note="appearNote"/);
	});

	test('uses clear scope and view mode labels', () => {
		assert.match(timelineSource, /title:\s*'全部'/);
		assert.match(timelineSource, /title:\s*'本地服务器'/);
		assert.match(timelineSource, /title:\s*'联邦服务器'/);
		assert.match(viewSwitchSource, /label:\s*i18n\.ts\._viewMode\?\.twitter \?\? 'X 风格'/);
		assert.match(viewSwitchSource, /label:\s*i18n\.ts\._viewMode\?\.forum \?\? 'Discourse 风格'/);
		assert.match(zhCnLocaleSource, /twitter:\s*"X 风格"/);
		assert.match(zhCnLocaleSource, /forum:\s*"Discourse 风格"/);
	});
});
