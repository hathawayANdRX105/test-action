/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { URLSearchParams } from 'node:url';
import { Inject, Injectable } from '@nestjs/common';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { ApiLoggerService } from '@/server/api/ApiLoggerService.js';
import type { MiMeta, MiNote } from '@/models/_.js';
import { CacheManagementService, type ManagedRedisKVCache } from '@/global/CacheManagementService.js';
import { TimeService } from '@/global/TimeService.js';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import type * as Redis from 'ioredis';

export interface CachedTranslation {
	sourceLang: string | undefined;
	text: string | undefined;
}

interface CachedTranslationEntity {
	l?: string;
	t?: string;
	u?: number;
}

const LIBRE_TRANSLATE_ATTEMPTS = 1;
const LIBRE_TRANSLATE_MIN_INTERVAL_MS = 5_500;
const LIBRE_TRANSLATE_RATE_LIMIT_COOLDOWN_MS = 1000 * 65;
const LIBRE_TRANSLATE_SLOT_KEY = 'translation:libreTranslate:nextSlot';
const LIBRE_TRANSLATE_SLOT_TTL_MS = 1000 * 60;

@Injectable()
export class NoteTranslationService {
	private readonly translationsCache: ManagedRedisKVCache<CachedTranslationEntity>;

	constructor(
		@Inject(DI.meta)
		private readonly serverSettings: MiMeta,

		@Inject(DI.redis)
		private readonly redisClient: Redis.Redis,

		private readonly httpRequestService: HttpRequestService,
		private readonly loggerService: ApiLoggerService,
		private readonly timeService: TimeService,
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
				return await this.fetchLibreTranslation(note, targetLang);
			}
		} catch (e) {
			this.loggerService.logger.error('Unhandled error from translation API: ', { e });
		}

		return null;
	}

	private async fetchLibreTranslation(note: MiNote & { text: string }, targetLang: string): Promise<CachedTranslation | null> {
		for (const libreTargetLang of this.getLibreTranslateTargetLangCandidates(targetLang)) {
			for (let attempt = 1; attempt <= LIBRE_TRANSLATE_ATTEMPTS; attempt++) {
				try {
					await this.reserveLibreTranslateSlot();
					const res = await this.httpRequestService.send(this.serverSettings.libreTranslateURL!, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json, */*',
						},
						body: JSON.stringify({
							q: note.text,
							source: 'auto',
							target: libreTargetLang,
							format: 'text',
							api_key: this.serverSettings.libreTranslateKey ?? '',
						}),
						timeout: this.serverSettings.translationTimeout,
						bypassProxy: true,
					}, {
						throwErrorWhenResponseNotOk: false,
					});

					const body = await res.text();
					if (!res.ok) {
						this.loggerService.logger.warn(`LibreTranslate returned ${res.status} ${res.statusText} for target=${libreTargetLang}: ${body.slice(0, 300)}`);
						if (res.status === 403 || res.status === 429) {
							await this.cooldownLibreTranslate(res.status);
							return null;
						}
						continue;
					}

					const json = JSON.parse(body) as {
						alternatives?: string[],
						detectedLanguage?: { [key: string]: string | number },
						translatedText?: string,
					};
					if (!json.translatedText) {
						this.loggerService.logger.warn(`LibreTranslate response did not include translatedText for target=${libreTargetLang}: ${body.slice(0, 300)}`);
						continue;
					}

					return {
						sourceLang: this.getLanguageDisplayName(json.detectedLanguage?.language),
						text: json.translatedText,
					};
				} catch (e) {
					this.loggerService.logger.warn(`LibreTranslate attempt ${attempt}/${LIBRE_TRANSLATE_ATTEMPTS} failed for target=${libreTargetLang}: ${e instanceof Error ? e.message : String(e)}`);
				}
			}
		}

		return null;
	}

	private async reserveLibreTranslateSlot(): Promise<void> {
		const waitMs = await this.reserveLibreTranslateDelay(LIBRE_TRANSLATE_MIN_INTERVAL_MS);
		if (waitMs > 0) await sleep(waitMs);
	}

	private async cooldownLibreTranslate(status: number): Promise<void> {
		await this.reserveLibreTranslateDelay(LIBRE_TRANSLATE_RATE_LIMIT_COOLDOWN_MS);
		this.loggerService.logger.warn(`LibreTranslate rate-limit cooldown scheduled after HTTP ${status}`);
	}

	private async reserveLibreTranslateDelay(intervalMs: number): Promise<number> {
		const now = this.timeService.now;
		const ttlMs = Math.max(LIBRE_TRANSLATE_SLOT_TTL_MS, intervalMs * 4);
		const result = await this.redisClient.eval(`
			local key = KEYS[1]
			local now = tonumber(ARGV[1])
			local interval = tonumber(ARGV[2])
			local ttl = tonumber(ARGV[3])
			local nextSlot = tonumber(redis.call('GET', key) or '0')
			local scheduled = now
			if nextSlot > now then
				scheduled = nextSlot
			end
			redis.call('SET', key, scheduled + interval, 'PX', ttl)
			return scheduled - now
		`, 1, LIBRE_TRANSLATE_SLOT_KEY, now, intervalMs, ttlMs);
		return Math.max(0, Number(result) || 0);
	}

	private getLibreTranslateTargetLangCandidates(targetLang: string): string[] {
		return [...new Set([
			this.normalizeLibreTranslateTargetLang(targetLang),
			targetLang,
			this.normalizeTargetLang(targetLang),
		].filter(lang => lang.length > 0))];
	}

	private normalizeLibreTranslateTargetLang(targetLang: string): string {
		const normalized = targetLang.trim();
		const lower = normalized.toLowerCase();
		if (lower === 'zh' || lower === 'zh-cn' || lower === 'zh-hans') return 'zh-Hans';
		if (lower === 'zh-tw' || lower === 'zh-hant' || lower === 'zh-hk') return 'zh-Hant';
		if (lower === 'pt-br') return 'pt-BR';
		return this.normalizeTargetLang(normalized);
	}

	private getLanguageDisplayName(language: string | number | undefined): string | undefined {
		if (typeof language !== 'string' || language.length === 0) return undefined;
		try {
			const languageNames = new Intl.DisplayNames(['en'], {
				type: 'language',
			});
			return languageNames.of(language);
		} catch {
			return language;
		}
	}
}
