/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';

const endpointListSource = readFileSync(new URL('../../src/server/api/endpoint-list.ts', import.meta.url), 'utf8');
const fileServerSource = readFileSync(new URL('../../src/server/FileServerService.ts', import.meta.url), 'utf8');
const urlPreviewSource = readFileSync(new URL('../../src/server/web/UrlPreviewService.ts', import.meta.url), 'utf8');
const endpointsModuleSource = readFileSync(new URL('../../src/server/api/EndpointsModule.ts', import.meta.url), 'utf8');
const translateBatchSource = readFileSync(new URL('../../src/server/api/endpoints/notes/translate-batch.ts', import.meta.url), 'utf8');
const translateCommonSource = readFileSync(new URL('../../src/server/api/endpoints/notes/translate-common.ts', import.meta.url), 'utf8');
const fastifyHookHandlersSource = readFileSync(new URL('../../src/misc/fastify-hook-handlers.ts', import.meta.url), 'utf8');

const chatReadEndpointPaths = [
	'../../src/server/api/endpoints/chat/history.ts',
	'../../src/server/api/endpoints/chat/messages/room-timeline.ts',
	'../../src/server/api/endpoints/chat/messages/user-timeline.ts',
	'../../src/server/api/endpoints/chat/rooms/joining.ts',
	'../../src/server/api/endpoints/chat/rooms/owned.ts',
	'../../src/server/api/endpoints/chat/rooms/show.ts',
] as const;

describe('timeline resource optimization source', () => {
	test('registers batched note translation endpoint with bounded input and concurrency', () => {
		assert.match(endpointListSource, /export \* as 'notes\/translate-batch'/);
		assert.match(translateBatchSource, /maxItems:\s*20/);
		assert.match(translateBatchSource, /const TRANSLATE_BATCH_CONCURRENCY = 1;/);
		assert.match(translateBatchSource, /translations:\s*\{\s*type:\s*'object'/);
		assert.match(translateBatchSource, /noteVisibilityService\.checkNoteVisibilityAsync/);
		assert.match(translateBatchSource, /getCachedTranslation/);
		assert.match(endpointsModuleSource, /NoteTranslationService/);
		assert.match(translateCommonSource, /setCachedTranslation/);
		assert.match(translateCommonSource, /normalizeLibreTranslateTargetLang/);
		assert.match(translateCommonSource, /fetchLibreTranslation/);
		assert.match(translateCommonSource, /throwErrorWhenResponseNotOk:\s*false/);
		assert.match(translateCommonSource, /LIBRE_TRANSLATE_ATTEMPTS/);
		assert.doesNotMatch(translateBatchSource, /new NoteTranslation/);
	});

	test('relaxes media and URL preview read limits without removing safety limits globally', () => {
		assert.match(fileServerSource, /\/files\/:key'[\s\S]*sendDriveFile/);
		assert.doesNotMatch(fileServerSource, /checkResourceLimit/);
		assert.match(fileServerSource, /checkSharedLimit\(reply,\s*actor,\s*group\)/);
		assert.match(fileServerSource, /size:\s*7200/);
		assert.match(fileServerSource, /dripRate:\s*1000/);
		assert.match(fileServerSource, /isReadableStoredInternalFile/);
		assert.match(fileServerSource, /falling back to original file/);
		assert.match(fileServerSource, /original is unavailable/);
		assert.match(fastifyHookHandlersSource, /\^gridCover=/);
		assert.match(fastifyHookHandlersSource, /return done\(\);/);

		assert.match(urlPreviewSource, /const URL_PREVIEW_ERROR_CACHE_SECONDS = 300;/);
		assert.match(urlPreviewSource, /size:\s*100/);
		assert.match(urlPreviewSource, /dripSize:\s*4/);
		assert.match(urlPreviewSource, /dripRate:\s*200/);
		assert.match(urlPreviewSource, /cacheError\(cacheKey,\s*url,\s*err,\s*URL_PREVIEW_ERROR_CACHE_SECONDS\)/);
	});

	test('chat read endpoints have explicit read-friendly limits', () => {
		for (const endpointPath of chatReadEndpointPaths) {
			const source = readFileSync(new URL(endpointPath, import.meta.url), 'utf8');
			assert.match(source, /kind:\s*'read:chat'/, endpointPath);
			assert.match(source, /limit:\s*\{[\s\S]*type:\s*'bucket',[\s\S]*size:\s*60,[\s\S]*dripRate:\s*1000,[\s\S]*\}/, endpointPath);
		}
	});
});
