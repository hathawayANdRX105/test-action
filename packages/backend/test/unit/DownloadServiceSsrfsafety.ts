/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'node:assert';
import { readFileSync } from 'node:fs';

const downloadServiceSource = readFileSync(new URL('../../src/core/DownloadService.ts', import.meta.url), 'utf8');
const driveServiceSource = readFileSync(new URL('../../src/core/DriveService.ts', import.meta.url), 'utf8');
const fileServerSource = readFileSync(new URL('../../src/server/FileServerService.ts', import.meta.url), 'utf8');
const urlPreviewServiceSource = readFileSync(new URL('../../src/server/web/UrlPreviewService.ts', import.meta.url), 'utf8');

describe('download service SSRF safety', () => {
	test('does not allow private network downloads by default', () => {
		assert.match(downloadServiceSource, /isLocalAddressAllowed\?: boolean/);
		assert.match(downloadServiceSource, /const isLocalAddressAllowed = options\.isLocalAddressAllowed \?\? false;/);
		assert.match(downloadServiceSource, /getAgentForHttp\(urlObj,\s*isLocalAddressAllowed\)/);
		assert.match(downloadServiceSource, /getAgentForHttps\(urlObj,\s*isLocalAddressAllowed\)/);
		assert.doesNotMatch(downloadServiceSource, /getAgentForHttp\(urlObj,\s*true\)/);
		assert.doesNotMatch(downloadServiceSource, /getAgentForHttps\(urlObj,\s*true\)/);
	});

	test('keeps user-controlled URL imports on the safe default path', () => {
		assert.match(driveServiceSource, /downloadService\.downloadUrl\(url,\s*path,\s*\{/);
		assert.doesNotMatch(driveServiceSource, /isLocalAddressAllowed:\s*true/);
		assert.match(fileServerSource, /downloadService\.downloadUrl\(url,\s*path,\s*\{ agent: options\.agent \}\)/);
	});

	test('rejects private network URL preview targets before fetching', () => {
		assert.match(urlPreviewServiceSource, /import \{ HttpRequestService,\s*isPrivateUrl \} from '@\/core\/HttpRequestService\.js';/);
		assert.match(urlPreviewServiceSource, /await this\.isPrivatePreviewUrl\(urlObj\)/);
		assert.match(urlPreviewServiceSource, /await this\.isPrivatePreviewUrl\(new URL\(summary\.url\)\)/);
		assert.match(urlPreviewServiceSource, /isPrivateUrl\(url,\s*this\.httpRequestService\.lookup\)/);
		assert.match(urlPreviewServiceSource, /URL_PREVIEW_PRIVATE_ADDRESS_BLOCKED/);
	});
});
