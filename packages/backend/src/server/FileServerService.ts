/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import sharp from 'sharp';
import { sharpBmp } from '@misskey-dev/sharp-read-bmp';
import type { Agents } from 'got';
import type { Config } from '@/config.js';
import type { MiDriveFile, DriveFilesRepository, MiUser } from '@/models/_.js';
import type { MiMeta } from '@/models/Meta.js';
import { DI } from '@/di-symbols.js';
import { createTemp } from '@/misc/create-temp.js';
import { FILE_TYPE_BROWSERSAFE } from '@/const.js';
import { StatusError } from '@/misc/status-error.js';
import type Logger from '@/logger.js';
import { DownloadService } from '@/core/DownloadService.js';
import { UrlPreviewProxyService } from '@/core/UrlPreviewProxyService.js';
import { IImageStreamable, ImageProcessingService, webpDefault } from '@/core/ImageProcessingService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { contentDisposition } from '@/misc/content-disposition.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { LoggerService } from '@/core/LoggerService.js';
import { bindThis } from '@/decorators.js';
import { isMimeImage } from '@/misc/is-mime-image.js';
import { correctFilename } from '@/misc/correct-filename.js';
import { handleRequestRedirectToOmitSearch } from '@/misc/fastify-hook-handlers.js';
import { renamePath } from '@/misc/rename-file.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { AuthenticateService, AuthenticationError } from '@/server/api/AuthenticateService.js';
import { SkRateLimiterService } from '@/server/SkRateLimiterService.js';
import { Keyed, RateLimit, sendRateLimitHeaders } from '@/misc/rate-limit-utils.js';
import { renderInlineError } from '@/misc/render-inline-error.js';
import {
	describeUrlPreviewProxy,
	renderUrlPreviewProxyError,
	tryUrlPreviewOutboundProxies,
	UrlPreviewProxyUnavailableError,
	type UrlPreviewProxyMode,
} from '@/misc/url-preview-proxy.js';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginOptions } from 'fastify';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const assets = `${_dirname}/../../server/file/assets/`;

type ParsedRange = {
	start: number;
	end: number;
};

@Injectable()
export class FileServerService {
	private logger: Logger;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.meta)
		private readonly meta: MiMeta,

		@Inject(DI.driveFilesRepository)
		private driveFilesRepository: DriveFilesRepository,

		private fileInfoService: FileInfoService,
		private downloadService: DownloadService,
		private readonly urlPreviewProxyService: UrlPreviewProxyService,
		private imageProcessingService: ImageProcessingService,
		private videoProcessingService: VideoProcessingService,
		private internalStorageService: InternalStorageService,
		private loggerService: LoggerService,
		private authenticateService: AuthenticateService,
		private rateLimiterService: SkRateLimiterService,
	) {
		this.logger = this.loggerService.getLogger('server', 'gray');

		//this.createServer = this.createServer.bind(this);
	}

	@bindThis
	public createServer(fastify: FastifyInstance, options: FastifyPluginOptions, done: (err?: Error) => void) {
		fastify.addHook('onRequest', (request, reply, done) => {
			reply.header('Content-Security-Policy', 'default-src \'none\'; img-src \'self\'; media-src \'self\'; style-src \'unsafe-inline\'');
			reply.header('Access-Control-Allow-Origin', '*');

			// Tell crawlers not to index files endpoints.
			// https://developers.google.com/search/docs/crawling-indexing/block-indexing
			reply.header('X-Robots-Tag', 'noindex');
			done();
		});

		fastify.register((fastify, options, done) => {
			fastify.addHook('onRequest', handleRequestRedirectToOmitSearch);
			fastify.get('/files/app-default.jpg', (request, reply) => {
				const file = fs.createReadStream(`${_dirname}/assets/dummy.png`);
				reply.header('Content-Type', 'image/jpeg');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				return reply.send(file);
			});

			fastify.get<{ Params: { key: string; } }>('/files/:key', async (request, reply) => {
				if (!await this.checkRateLimit(request, reply, '/files/')) return;

				return await this.sendDriveFile(request, reply)
					.catch(err => this.errorHandler(request, reply, err));
			});
			fastify.get<{ Params: { key: string; } }>('/files/:key/*', async (request, reply) => {
				return await reply.redirect(`${this.config.url}/files/${request.params.key}`, 301);
			});
			done();
		});

		fastify.get<{
			Params: { url: string; };
			Querystring: { url?: string; };
		}>('/proxy/:url*', async (request, reply) => {
			const url = 'url' in request.query ? request.query.url : 'https://' + request.params.url;
			if (!url || !URL.canParse(url)) {
				reply.code(400);
				return;
			}

			if (!await this.checkRateLimit(request, reply, '/proxy/')) return;

			return await this.proxyHandler(request, reply)
				.catch(err => this.errorHandler(request, reply, err));
		});

		done();
	}

	@bindThis
	private async errorHandler(request: FastifyRequest<{ Params?: { [x: string]: any }; Querystring?: { [x: string]: any }; }>, reply: FastifyReply, err?: any) {
		this.logger.error(`Unhandled error in file server: ${renderInlineError(err)}`);

		reply.header('Cache-Control', 'max-age=300');

		if (request.query && 'fallback' in request.query) {
			return reply.sendFile('/dummy.png', assets);
		}

		if (err instanceof StatusError && (err.statusCode === 302 || err.isClientError)) {
			reply.code(err.statusCode);
			return;
		}

		if (err instanceof UrlPreviewProxyUnavailableError) {
			reply.header('Cache-Control', 'max-age=30');
			reply.code(503);
			return reply.send({
				error: {
					message: 'URL preview outbound proxy is unavailable',
					code: 'URL_PREVIEW_PROXY_UNAVAILABLE',
					id: '37177db1-7f9b-4a39-8a76-a5404f576f6e',
				},
			});
		}

		reply.code(500);
		return;
	}

	@bindThis
	private async sendDriveFile(request: FastifyRequest<{ Params: { key: string; } }>, reply: FastifyReply) {
		const key = request.params.key;
		const file = await this.getFileFromKey(key).then();

		if (file === '404') {
			reply.code(404);
			reply.header('Cache-Control', 'max-age=86400');
			return reply.sendFile('/dummy.png', assets);
		}

		if (file === '204') {
			reply.code(204);
			reply.header('Cache-Control', 'max-age=86400');
			return;
		}

		try {
			if (file.state === 'remote') {
				let image: IImageStreamable | null = null;

				if (file.fileRole === 'thumbnail') {
					if (isMimeImage(file.mime, 'sharp-convertible-image-with-bmp')) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.mediaProxy}/static.webp`);
						url.searchParams.set('url', file.url);
						url.searchParams.set('static', '1');

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					} else if (file.mime.startsWith('video/')) {
						const externalThumbnail = this.videoProcessingService.getExternalVideoThumbnailUrl(file.url);
						if (externalThumbnail) {
							file.cleanup();
							return await reply.redirect(externalThumbnail, 301);
						}

						image = await this.videoProcessingService.generateVideoThumbnail(file.path);
					}
				}

				if (file.fileRole === 'webpublic') {
					if (['image/svg+xml'].includes(file.mime)) {
						reply.header('Cache-Control', 'max-age=31536000, immutable');

						const url = new URL(`${this.config.mediaProxy}/svg.webp`);
						url.searchParams.set('url', file.url);

						file.cleanup();
						return await reply.redirect(url.toString(), 301);
					}
				}

				// set Content-Length before we chunk, so it can properly override when chunking.
				reply.header('Content-Length', file.file.size);

				if (!image) {
					if (file.file.size > 0) {
						reply.header('Accept-Ranges', 'bytes');
					}

					const data = createReadStreamWithRange(file.path, file.file.size, request.headers.range, reply);
					if (!data) {
						file.cleanup();
						return;
					}

					image = {
						data,
						ext: file.ext,
						type: file.mime,
					};
				}

				if ('pipe' in image.data && typeof image.data.pipe === 'function') {
					// image.dataがstreamなら、stream終了後にcleanup
					image.data.on('end', file.cleanup);
					image.data.on('close', file.cleanup);
				} else {
					// image.dataがstreamでないなら直ちにcleanup
					file.cleanup();
				}

				reply.header('Content-Type', FILE_TYPE_BROWSERSAFE.includes(image.type) ? image.type : 'application/octet-stream');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				reply.header('Content-Disposition',
					contentDisposition(
						'inline',
						correctFilename(file.filename, image.ext),
					),
				);
				return image.data;
			}

			if (file.fileRole !== 'original') {
				const filename = renamePath(file.filename, {
					suffix: file.fileRole === 'thumbnail' ? '-thumb' : '-web',
					extname: file.ext ? `.${file.ext}` : '.unknown',
				});

				reply.header('Content-Type', FILE_TYPE_BROWSERSAFE.includes(file.mime) ? file.mime : 'application/octet-stream');
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				reply.header('Content-Disposition', contentDisposition('inline', filename));

				if (file.file.size > 0) {
					reply.header('Accept-Ranges', 'bytes');
				}

				return createReadStreamWithRange(file.path, file.file.size, request.headers.range, reply);
			} else {
				reply.header('Content-Type', FILE_TYPE_BROWSERSAFE.includes(file.file.type) ? file.file.type : 'application/octet-stream');
				reply.header('Content-Length', file.file.size);
				reply.header('Cache-Control', 'max-age=31536000, immutable');
				reply.header('Content-Disposition', contentDisposition('inline', file.filename));

				if (file.file.size > 0) {
					reply.header('Accept-Ranges', 'bytes');
				}

				return createReadStreamWithRange(file.path, file.file.size, request.headers.range, reply);
			}
		} catch (e) {
			if ('cleanup' in file) file.cleanup();
			throw e;
		}
	}

	@bindThis
	private async proxyHandler(request: FastifyRequest<{ Params: { url: string; }; Querystring: { url?: string; }; }>, reply: FastifyReply) {
		const url = 'url' in request.query ? request.query.url : 'https://' + request.params.url;

		if (typeof url !== 'string') {
			reply.code(400);
			return;
		}

		// アバタークロップなど、どうしてもオリジンである必要がある場合
		const mustOrigin = 'origin' in request.query;
		const useUrlPreviewProxy = 'preview' in request.query && this.getUrlPreviewProxyMode() === 'outbound';

		if (this.config.externalMediaProxyEnabled && !mustOrigin && !useUrlPreviewProxy) {
			// 外部のメディアプロキシが有効なら、そちらにリダイレクト

			reply.header('Cache-Control', 'public, max-age=259200'); // 3 days

			const url = new URL(`${this.config.mediaProxy}/${request.params.url || ''}`);

			for (const [key, value] of Object.entries(request.query)) {
				url.searchParams.append(key, value);
			}

			return await reply.redirect(
				url.toString(),
				301,
			);
		}

		if (!request.headers['user-agent']) {
			throw new StatusError('User-Agent is required', 400, 'User-Agent is required');
		} else if (request.headers['user-agent'].toLowerCase().indexOf('misskey/') !== -1) {
			throw new StatusError(`Refusing to proxy recursive request to ${url} (from user-agent ${request.headers['user-agent']})`, 403, 'Proxy is recursive');
		}

		// Create temp file
		const file = await this.getStreamAndTypeFromUrl(url, { useUrlPreviewProxy });
		if (file === '404') {
			reply.code(404);
			reply.header('Cache-Control', 'max-age=86400');
			return reply.sendFile('/dummy.png', assets);
		}

		if (file === '204') {
			reply.code(204);
			reply.header('Cache-Control', 'max-age=86400');
			return;
		}

		try {
			const isConvertibleImage = isMimeImage(file.mime, 'sharp-convertible-image-with-bmp');
			const isAnimationConvertibleImage = isMimeImage(file.mime, 'sharp-animation-convertible-image-with-bmp');

			if (
				'emoji' in request.query ||
				'avatar' in request.query ||
				'static' in request.query ||
				'preview' in request.query ||
				'badge' in request.query
			) {
				if (!isConvertibleImage) {
					// 画像でないなら404でお茶を濁す
					throw new StatusError(`Unexpected non-convertible mime: ${file.mime}`, 404, 'Unexpected mime');
				}
			}

			let image: IImageStreamable | null = null;
			if ('emoji' in request.query || 'avatar' in request.query) {
				if (!isAnimationConvertibleImage && !('static' in request.query)) {
					image = {
						data: fs.createReadStream(file.path),
						ext: file.ext,
						type: file.mime,
					};
				} else {
					const data = (await sharpBmp(file.path, file.mime, { animated: !('static' in request.query) }))
						.resize({
							height: 'emoji' in request.query ? 128 : 320,
							withoutEnlargement: true,
						})
						.webp(webpDefault);

					image = {
						data,
						ext: 'webp',
						type: 'image/webp',
					};
				}
			} else if ('static' in request.query) {
				image = this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(file.path, file.mime), 498, 422);
			} else if ('preview' in request.query) {
				image = this.imageProcessingService.convertSharpToWebpStream(await sharpBmp(file.path, file.mime), 200, 200);
			} else if ('badge' in request.query) {
				const mask = (await sharpBmp(file.path, file.mime))
					.resize(96, 96, {
						fit: 'contain',
						position: 'centre',
						withoutEnlargement: false,
					})
					.greyscale()
					.normalise()
					.linear(1.75, -(128 * 1.75) + 128) // 1.75x contrast
					.flatten({ background: '#000' })
					.toColorspace('b-w');

				const stats = await mask.clone().stats();

				if (stats.entropy < 0.1) {
					// エントロピーがあまりない場合は404にする
					throw new StatusError('Skip to provide badge', 404);
				}

				const data = sharp({
					create: { width: 96, height: 96, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
				})
					.pipelineColorspace('b-w')
					.boolean(await mask.png().toBuffer(), 'eor');

				image = {
					data: await data.png().toBuffer(),
					ext: 'png',
					type: 'image/png',
				};
			} else if (file.mime === 'image/svg+xml') {
				image = this.imageProcessingService.convertToWebpStream(file.path, 2048, 2048);
			} else if (!file.mime.startsWith('image/') || !FILE_TYPE_BROWSERSAFE.includes(file.mime)) {
				throw new StatusError(`Blocked mime type: ${file.mime}`, 403, 'Blocked mime type');
			}

			if (!image) {
				const size = file.file?.size ?? fs.statSync(file.path).size;
				if (size > 0) {
					reply.header('Accept-Ranges', 'bytes');
				}

				const data = createReadStreamWithRange(file.path, size, request.headers.range, reply);
				if (!data) {
					if ('cleanup' in file) file.cleanup();
					return;
				}

				image = {
					data,
					ext: file.ext,
					type: file.mime,
				};
			}

			if ('cleanup' in file) {
				if ('pipe' in image.data && typeof image.data.pipe === 'function') {
					// image.dataがstreamなら、stream終了後にcleanup
					image.data.on('end', file.cleanup);
					image.data.on('close', file.cleanup);
				} else {
					// image.dataがstreamでないなら直ちにcleanup
					file.cleanup();
				}
			}

			reply.header('Content-Type', image.type);
			reply.header('Cache-Control', 'max-age=31536000, immutable');
			reply.header('Content-Disposition',
				contentDisposition(
					'inline',
					correctFilename(file.filename, image.ext),
				),
			);
			return image.data;
		} catch (e) {
			if ('cleanup' in file) file.cleanup();
			throw e;
		}
	}

	@bindThis
	private async getStreamAndTypeFromUrl(url: string, options: { useUrlPreviewProxy?: boolean } = {}): Promise<
		{ state: 'remote'; fileRole?: 'thumbnail' | 'webpublic' | 'original'; file?: MiDriveFile; mime: string; ext: string | null; path: string; cleanup: () => void; filename: string; }
		| { state: 'stored_internal'; fileRole: 'thumbnail' | 'webpublic' | 'original'; file: MiDriveFile; filename: string; mime: string; ext: string | null; path: string; }
		| '404'
		| '204'
	> {
		if (url.startsWith(`${this.config.url}/files/`)) {
			const key = url.replace(`${this.config.url}/files/`, '').split('/').shift();
			if (!key) throw new StatusError(`Invalid file URL ${url}`, 400, 'Invalid file url');

			return await this.getFileFromKey(key);
		}

		if (options.useUrlPreviewProxy) {
			return await this.downloadAndDetectTypeFromUrlWithUrlPreviewProxy(url);
		}

		return await this.downloadAndDetectTypeFromUrl(url);
	}

	@bindThis
	private async downloadAndDetectTypeFromUrlWithUrlPreviewProxy(url: string): Promise<
		{ state: 'remote'; mime: string; ext: string | null; path: string; cleanup: () => void; filename: string; }
	> {
		return tryUrlPreviewOutboundProxies(
			this.meta.urlPreviewOutboundProxies ?? [],
			proxy => this.downloadAndDetectTypeFromUrl(url, {
				agent: this.urlPreviewProxyService.createAgents(proxy),
			}),
			(proxy, error) => {
				this.logger.warn(`Failed URL preview media via proxy ${describeUrlPreviewProxy(proxy)}: ${renderUrlPreviewProxyError(error, proxy)}`);
			},
		);
	}

	@bindThis
	private async downloadAndDetectTypeFromUrl(url: string, options: { agent?: Agents } = {}): Promise<
		{ state: 'remote'; mime: string; ext: string | null; path: string; cleanup: () => void; filename: string; }
	> {
		const [path, cleanup] = await createTemp();
		try {
			const { filename } = await this.downloadService.downloadUrl(url, path, { agent: options.agent });

			const { mime, ext } = await this.fileInfoService.detectType(path);

			return {
				state: 'remote',
				mime, ext,
				path, cleanup,
				filename,
			};
		} catch (e) {
			cleanup();
			throw e;
		}
	}

	private getUrlPreviewProxyMode(): UrlPreviewProxyMode {
		return this.meta.urlPreviewProxyMode ?? (this.meta.urlPreviewSummaryProxyUrl ? 'summaly' : 'direct');
	}

	@bindThis
	private async getFileFromKey(key: string): Promise<
		{ state: 'remote'; fileRole: 'thumbnail' | 'webpublic' | 'original'; file: MiDriveFile; filename: string; url: string; mime: string; ext: string | null; path: string; cleanup: () => void; }
		| { state: 'stored_internal'; fileRole: 'thumbnail' | 'webpublic' | 'original'; file: MiDriveFile; filename: string; mime: string; ext: string | null; path: string; }
		| '404'
		| '204'
	> {
		// Fetch drive file
		const file = await this.driveFilesRepository.createQueryBuilder('file')
			.where('file.accessKey = :accessKey', { accessKey: key })
			.orWhere('file.thumbnailAccessKey = :thumbnailAccessKey', { thumbnailAccessKey: key })
			.orWhere('file.webpublicAccessKey = :webpublicAccessKey', { webpublicAccessKey: key })
			.getOne();

		if (file == null) return '404';

		const isThumbnail = file.thumbnailAccessKey === key;
		const isWebpublic = file.webpublicAccessKey === key;

		if (!file.storedInternal) {
			if (!(file.isLink && file.uri)) return '204';
			const result = await this.downloadAndDetectTypeFromUrl(file.uri);
			file.size = (await fs.promises.stat(result.path)).size;	// DB file.sizeは正確とは限らないので
			return {
				...result,
				url: file.uri,
				fileRole: isThumbnail ? 'thumbnail' : isWebpublic ? 'webpublic' : 'original',
				file,
				filename: file.name,
			};
		}

		const path = this.internalStorageService.resolvePath(key);

		if (isThumbnail || isWebpublic) {
			const { mime, ext } = await this.fileInfoService.detectType(path);
			return {
				state: 'stored_internal',
				fileRole: isThumbnail ? 'thumbnail' : 'webpublic',
				file,
				filename: file.name,
				mime, ext,
				path,
			};
		}

		return {
			state: 'stored_internal',
			fileRole: 'original',
			file,
			filename: file.name,
			// 古いファイルは修正前のmimeを持っているのでできるだけ修正してあげる
			mime: this.fileInfoService.fixMime(file.type),
			ext: null,
			path,
		};
	}

	// Based on ApiCallService
	private async checkRateLimit(
		request: FastifyRequest<{
			Body?: Record<string, unknown> | undefined,
			Querystring?: Record<string, unknown> | undefined,
			Params?: Record<string, unknown> | unknown,
		}>,
		reply: FastifyReply,
		group: string,
	): Promise<boolean> {
		const body = request.method === 'GET'
			? request.query
			: request.body;

		// https://datatracker.ietf.org/doc/html/rfc6750.html#section-2.1 (case sensitive)
		const token = request.headers.authorization?.startsWith('Bearer ')
			? request.headers.authorization.slice(7)
			: body?.['i'];
		if (token != null && typeof token !== 'string') {
			reply.code(400);
			return false;
		}

		// koa will automatically load the `X-Forwarded-For` header if `proxy: true` is configured in the app.
		let actor: string | MiUser = getIpHash(request.ip);
		if (token) {
			try {
				const [user] = await this.authenticateService.authenticate(token);
				actor = user ?? actor;
			} catch (err) {
				if (!(err instanceof AuthenticationError)) throw err;
			}
		}

		return await this.checkSharedLimit(reply, actor, group);
	}

	private async checkSharedLimit(reply: FastifyReply, actor: string | MiUser, group: string): Promise<boolean> {
		const limit: Keyed<RateLimit> = {
			key: group,
			type: 'bucket',

			// Keep an actor-level safety bucket, but do not rate-limit individual hot files.
			size: 7200,
			dripRate: 1000,
		};

		return await this.checkLimit(reply, actor, limit);
	}

	private async checkLimit(reply: FastifyReply, actor: string | MiUser, limit: Keyed<RateLimit>): Promise<boolean> {
		const info = await this.rateLimiterService.limit(limit, actor);

		sendRateLimitHeaders(reply, info);

		if (info.blocked) {
			reply.code(429);
			reply.send({
				error: {
					message: 'Rate limit exceeded. Please try again later.',
					code: 'RATE_LIMIT_EXCEEDED',
					id: 'd5826d14-3982-4d2e-8011-b9e9f02499ef',
				},
			});

			return false;
		}

		return true;
	}
}

function createReadStreamWithRange(path: string, size: number, rangeHeader: string | undefined, reply: FastifyReply): fs.ReadStream | undefined {
	if (!rangeHeader) return fs.createReadStream(path);
	if (size <= 0) {
		reply.code(416);
		reply.header('Content-Range', `bytes */${Math.max(size, 0)}`);
		reply.header('Content-Length', 0);
		reply.send();
		return undefined;
	}

	const range = parseRange(rangeHeader, size);
	if (!range) {
		reply.code(416);
		reply.header('Content-Range', `bytes */${size}`);
		reply.header('Content-Length', 0);
		reply.send();
		return undefined;
	}

	reply.header('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
	reply.header('Content-Length', range.end - range.start + 1);
	reply.code(206);
	return fs.createReadStream(path, range);
}

export function parseRange(rangeHeader: string, size: number): ParsedRange | null {
	if (!Number.isSafeInteger(size) || size <= 0) return null;

	const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
	if (!match) return null;

	const [, startText, endText] = match;
	if (startText === '' && endText === '') return null;

	let start: number;
	let end: number;

	if (startText === '') {
		const suffixLength = Number(endText);
		if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
		start = Math.max(size - suffixLength, 0);
		end = size - 1;
	} else {
		start = Number(startText);
		if (!Number.isSafeInteger(start) || start < 0 || start >= size) return null;
		end = endText === '' ? size - 1 : Number(endText);
		if (!Number.isSafeInteger(end) || end < start) return null;
		end = Math.min(end, size - 1);
	}

	return { start, end };
}
