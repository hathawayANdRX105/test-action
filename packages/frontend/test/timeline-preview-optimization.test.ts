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
		assert.match(previewTranslationSource, /const BATCH_SIZE = 20;/);
		assert.match(previewTranslationSource, /const FLUSH_DELAY_MS = 200;/);
		assert.match(previewTranslationSource, /misskeyApi\('notes\/translate-batch'/);
		assert.match(previewTranslationSource, /getCachedTranslation\(note\.id,\s*targetLang\)/);
		assert.match(previewTranslationSource, /setCachedTranslation\(noteId,\s*targetLang,\s*translation\)/);
		assert.match(previewTranslationSource, /prefer\.r\.autoTranslateNotes\.value/);
		assert.match(previewTranslationSource, /prefer\.r\.autoTranslateReplaceOriginal\.value/);

		for (const source of [masonryCardSource, forumCardSource]) {
			assert.match(source, /useTimelinePreviewTranslation/);
			assert.match(source, /getAppearNote/);
			assert.match(source, /translationNoteRef/);
			assert.match(source, /translatedPreview/);
			assert.match(source, /previewTranslationText/);
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

	test('normal note translation is bound to the displayed appearNote', () => {
		assert.match(skNoteSource, /<SkNoteTranslation :note="appearNote"/);
		assert.match(mkNoteSource, /<SkNoteTranslation :note="appearNote"/);
		assert.match(skNoteSubSource, /<MkSubNoteContent[^>]+:note="appearNote"/);
	});

	test('uses clear scope and view mode labels', () => {
		assert.match(timelineSource, /title:\s*'本地\+联邦'/);
		assert.match(timelineSource, /title:\s*'本地服务器'/);
		assert.match(timelineSource, /title:\s*'联邦服务器'/);
		assert.match(viewSwitchSource, /label:\s*i18n\.ts\._viewMode\?\.twitter \?\? 'X 风格'/);
		assert.match(viewSwitchSource, /label:\s*i18n\.ts\._viewMode\?\.forum \?\? 'Discourse 风格'/);
		assert.match(zhCnLocaleSource, /twitter:\s*"X 风格"/);
		assert.match(zhCnLocaleSource, /forum:\s*"Discourse 风格"/);
	});
});
