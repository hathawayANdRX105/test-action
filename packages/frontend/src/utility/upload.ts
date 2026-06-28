/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { reactive, ref } from 'vue';
import * as Misskey from 'misskey-js';
import { v4 as uuid } from 'uuid';
import { readAndCompressImage } from '@misskey-dev/browser-image-resizer';
import { apiUrl } from '@@/js/config.js';
import { getCompressionConfig } from './upload/compress-config.js';
import { $i } from '@/i.js';
import { alert } from '@/os.js';
import { i18n } from '@/i18n.js';
import { instance } from '@/instance.js';
import { prefer } from '@/preferences.js';

type Uploading = {
	id: string;
	name: string;
	progressMax: number | undefined;
	progressValue: number | undefined;
	img: string;
};
export const uploads = ref<Uploading[]>([]);

const mimeTypeMap = {
	'image/webp': 'webp',
	'image/jpeg': 'jpg',
	'image/png': 'png',
} as const;

const UPLOAD_TIMEOUT_MS = 3 * 60 * 1000;
const UPLOAD_STALL_TIMEOUT_MS = 75 * 1000;

export function uploadFile(
	file: File,
	folder?: string | Misskey.entities.DriveFolder | null,
	name?: string,
	keepOriginal = false,
): Promise<Misskey.entities.DriveFile> & { id: string } {
	if ($i == null) throw new Error('Not logged in');

	const _folder = typeof folder === 'string' ? folder : folder?.id;
	const id = uuid();

	if ((file.size > instance.maxFileSize) || (file.size > ($i.policies.maxFileSizeMb * 1024 * 1024))) {
		alert({
			type: 'error',
			title: i18n.ts.failedToUpload,
			text: i18n.ts.cannotUploadBecauseExceedsFileSizeLimit,
		});
		return Object.assign(Promise.reject(), { id });
	}

	const filename = name ?? file.name ?? 'untitled';
	const extension = filename.split('.').length > 1 ? '.' + filename.split('.').pop() : '';
	const previewUrl = window.URL.createObjectURL(file);
	const ctx = reactive<Uploading>({
		id,
		name: prefer.s.keepOriginalFilename ? filename : id + extension,
		progressMax: undefined,
		progressValue: undefined,
		img: previewUrl,
	});
	let removed = false;
	const removeUpload = () => {
		if (removed) return;
		removed = true;
		uploads.value = uploads.value.filter(x => x.id !== id);
		window.URL.revokeObjectURL(previewUrl);
	};

	uploads.value.push(ctx);

	const promise = new Promise<Misskey.entities.DriveFile>((resolve, reject) => {
		(async (): Promise<void> => {
			const config = !keepOriginal ? await getCompressionConfig(file) : undefined;
			let resizedImage: Blob | undefined;
			if (config) {
				try {
					const resized = await readAndCompressImage(file, config);
					if (resized.size < file.size || file.type === 'image/webp') {
						// The compression may not always reduce the file size
						// (and WebP is not browser safe yet)
						resizedImage = resized;
					}
					if (_DEV_) {
						const saved = ((1 - resized.size / file.size) * 100).toFixed(2);
						console.log(`Image compression: before ${file.size} bytes, after ${resized.size} bytes, saved ${saved}%`);
					}

					ctx.name = file.type !== config.mimeType ? `${ctx.name}.${mimeTypeMap[config.mimeType]}` : ctx.name;
				} catch (err) {
					console.error('Failed to resize image', err);
				}
			}

			const formData = new FormData();
			formData.append('i', $i!.token);
			formData.append('force', 'true');
			formData.append('file', resizedImage ?? file);
			formData.append('name', ctx.name);
			if (_folder) formData.append('folderId', _folder);

			const xhr = new XMLHttpRequest();
			let settled = false;
			let stallTimer: number | undefined;

			const cleanup = () => {
				if (stallTimer != null) {
					window.clearTimeout(stallTimer);
					stallTimer = undefined;
				}
				removeUpload();
			};

			const showNetworkFailure = () => {
				alert({
					type: 'error',
					title: i18n.ts.failedToUpload,
					text: `${i18n.ts.network}: ${i18n.ts.tryAgain}`,
				});
			};

			const fail = (reason?: unknown, options: { showNetworkFailure?: boolean } = {}) => {
				if (settled) return;
				settled = true;
				cleanup();
				if (options.showNetworkFailure) {
					showNetworkFailure();
				}
				reject(reason instanceof Error ? reason : new Error('Upload failed'));
			};

			const succeed = (driveFile: Misskey.entities.DriveFile) => {
				if (settled) return;
				settled = true;
				cleanup();
				resolve(driveFile);
			};

			const resetStallTimer = () => {
				if (settled) return;
				if (stallTimer != null) {
					window.clearTimeout(stallTimer);
				}
				stallTimer = window.setTimeout(() => {
					fail(new Error('Upload stalled'), { showNetworkFailure: true });
					xhr.abort();
				}, UPLOAD_STALL_TIMEOUT_MS);
			};

			xhr.open('POST', apiUrl + '/drive/files/create', true);
			xhr.timeout = UPLOAD_TIMEOUT_MS;
			xhr.onload = ((ev: ProgressEvent<XMLHttpRequest>) => {
				if (xhr.status !== 200 || ev.target == null || ev.target.response == null) {
					// TODO: 消すのではなくて(ネットワーク的なエラーなら)再送できるようにしたい
					if (xhr.status === 413) {
						alert({
							type: 'error',
							title: i18n.ts.failedToUpload,
							text: i18n.ts.cannotUploadBecauseExceedsFileSizeLimit,
						});
					} else if (ev.target?.response) {
						const res = JSON.parse(ev.target.response);
						if (res.error?.id === 'bec5bd69-fba3-43c9-b4fb-2894b66ad5d2') {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: i18n.ts.cannotUploadBecauseInappropriate,
							});
						} else if (res.error?.id === 'd08dbc37-a6a9-463a-8c47-96c32ab5f064') {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: i18n.ts.cannotUploadBecauseNoFreeSpace,
							});
						} else {
							alert({
								type: 'error',
								title: i18n.ts.failedToUpload,
								text: `${res.error?.message}\n${res.error?.code}\n${res.error?.id}`,
							});
						}
					} else {
						alert({
							type: 'error',
							title: 'Failed to upload',
							text: `${JSON.stringify(ev.target?.response)}, ${JSON.stringify(xhr.response)}`,
						});
					}

					fail();
					return;
				}

				try {
					const driveFile = JSON.parse(ev.target.response);
					succeed(driveFile);
				} catch (err) {
					fail(err, { showNetworkFailure: true });
				}
			}) as (ev: ProgressEvent<EventTarget>) => any;

			xhr.onerror = () => {
				fail(new Error('Upload network error'), { showNetworkFailure: true });
			};

			xhr.ontimeout = () => {
				fail(new Error('Upload timed out'), { showNetworkFailure: true });
			};

			xhr.onabort = () => {
				fail(new Error('Upload aborted'), { showNetworkFailure: true });
			};

			xhr.onreadystatechange = () => {
				resetStallTimer();
			};

			xhr.onloadstart = () => {
				resetStallTimer();
			};

			xhr.onprogress = () => {
				resetStallTimer();
			};

			xhr.upload.onloadstart = () => {
				resetStallTimer();
			};

			xhr.upload.onprogress = ev => {
				resetStallTimer();
				if (ev.lengthComputable) {
					ctx.progressMax = ev.total;
					ctx.progressValue = ev.loaded;
				}
			};

			xhr.upload.onload = () => {
				resetStallTimer();
			};

			xhr.upload.onerror = () => {
				fail(new Error('Upload network error'), { showNetworkFailure: true });
			};

			xhr.upload.onabort = () => {
				fail(new Error('Upload aborted'), { showNetworkFailure: true });
			};

			resetStallTimer();
			xhr.send(formData);
		})().catch(err => {
			removeUpload();
			reject(err);
		});
	});
	return Object.assign(promise, { id });
}
