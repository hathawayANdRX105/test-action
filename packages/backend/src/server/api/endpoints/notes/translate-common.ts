/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { URLSearchParams } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import type { MiMeta, MiNote } from '@/models/_.js';
import { CacheManagementService, type ManagedRedisKVCache } from '@/global/CacheManagementService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';

export interface CachedTranslation {
	sourceLang: string | undefined;
	text: string | undefined;
}

interface CachedTranslationEntity {
	l?: string;
	t?: string;
	u?: number;
}

@Injectable()
export class NoteTranslationService {
	private readonly translationsCache: ManagedRedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,

		private readonly httpRequestService: HttpRequestService,
		private readonly loggerService: ApiLoggerService,
		cacheManagementService: CacheManagementService,
	) {
		this.translationsCache = cacheManagementService.createRedisKVCache<CachedTranslationEntity>('translations', {
			lifetime: 1000 * 60 * 60 * 24 * 7, // 1 week
			memoryCacheLifetime: 1000 * 60, // 1 minute
		});
	}

	public isAvailable(): boolean {
		const canDeeplFree = this.serverSettings.deeplFreeMode && !!this.serverSettings.deeplFreeInstance;
		const canDeepl = !!this.serverSettings.deeplAuthKey || canDeeplFree;
		const canLibre = !!this.serverSettings.libreTranslateURL;
		return canDeepl || canLibre;
	}

	public normalizeTargetLang(targetLang: string): string {
		return targetLang.includes('-') ? targetLang.split('-')[0] : targetLang;
	}

	public async translate(note: MiNote & { text: string }, targetLang: string): Promise<CachedTranslation | null> {
		let response = await this.getCachedTranslation(note, targetLang);
		if (!response) {
			this.loggerService.logger.debug(`Fetching new translation for note=${note.id} lang=${targetLang}`);
			response = await this.fetchTranslation(note, targetLang);
			if (!response) return null;

			await this.setCachedTranslation(note, targetLang, response);
		}
		return response;
	}

	@bindThis
	public async getCachedTranslation(note: MiNote, targetLang: string): Promise<CachedTranslation | null> {
		const cacheKey = `${note.id}@${targetLang}`;
		const cached = await this.translationsCache.get(cacheKey);
		if (cached && cached.u === note.updatedAt?.valueOf()) {
			return {
				sourceLang: cached.l,
				text: cached.t,
			};
		}
		return null;
	}

	@bindThis
	public async setCachedTranslation(note: MiNote, targetLang: string, translation: CachedTranslation): Promise<void> {
		const cacheKey = `${note.id}@${targetLang}`;

		await this.translationsCache.set(cacheKey, {
			l: translation.sourceLang,
			t: translation.text,
			u: note.updatedAt?.valueOf(),
		});
	}

	private async fetchTranslation(note: MiNote & { text: string }, targetLang: string): Promise<CachedTranslation | null> {
		try {
			const deeplFreeInstance = this.serverSettings.deeplFreeMode ? this.serverSettings.deeplFreeInstance : null;

			if (this.serverSettings.deeplAuthKey || deeplFreeInstance) {
				const params = new URLSearchParams();
				params.append('text', note.text);
				params.append('target_lang', targetLang);
				const headers: Record<string, string> = {
					'Content-Type': 'application/x-www-form-urlencoded',
					Accept: 'application/json, */*',
				};
				if (this.serverSettings.deeplAuthKey) headers.Authorization = `DeepL-Auth-Key ${this.serverSettings.deeplAuthKey}`;
				const endpoint = deeplFreeInstance ?? (this.serverSettings.deeplIsPro ? 'https://api.deepl.com/v2/translate' : 'https://api-free.deepl.com/v2/translate');

				const res = await this.httpRequestService.send(endpoint, {
					method: 'POST',
					headers,
					body: params.toString(),
					timeout: this.serverSettings.translationTimeout,
				});
				if (this.serverSettings.deeplAuthKey) {
					const json = (await res.json()) as {
						translations: {
							detected_source_language: string;
							text: string;
						}[];
					};

					return {
						sourceLang: json.translations[0].detected_source_language,
						text: json.translations[0].text,
					};
				} else {
					const json = (await res.json()) as {
						code: number,
						message: string,
						data: string,
						source_lang: string,
						target_lang: string,
						alternatives: string[],
					};

					const languageNames = new Intl.DisplayNames(['en'], {
						type: 'language',
					});

					return {
						sourceLang: languageNames.of(json.source_lang),
						text: json.data,
					};
				}
			}

			if (this.serverSettings.libreTranslateURL) {
				const res = await this.httpRequestService.send(this.serverSettings.libreTranslateURL, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json, */*',
					},
					body: JSON.stringify({
						q: note.text,
						source: 'auto',
						target: targetLang,
						format: 'text',
						api_key: this.serverSettings.libreTranslateKey ?? '',
					}),
					timeout: this.serverSettings.translationTimeout,
				});

				const json = (await res.json()) as {
					alternatives: string[],
					detectedLanguage: { [key: string]: string | number },
					translatedText: string,
				};

				const languageNames = new Intl.DisplayNames(['en'], {
					type: 'language',
				});

				return {
					sourceLang: languageNames.of(json.detectedLanguage.language as string),
					text: json.translatedText,
				};
			}
		} catch (e) {
			this.loggerService.logger.error('Unhandled error from translation API: ', { e });
		}

		return null;
	}
}
