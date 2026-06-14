/*
 * SPDX-FileCopyrightText: Universe Federation contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 自前のブラウザ指紋。canvas/webgl/screen/timezone/fonts などの特徴を集めて安定ハッシュ化する。
// 管理者の溯源用に各分量も保存・検索できるよう、ハッシュと明細の両方を返す。
// 外部依存・外部リクエストなし。値は localStorage にキャッシュして再計算を避ける。

const STORAGE_KEY = 'clientFingerprint';
const VERSION = 1;

type FingerprintComponents = Record<string, unknown>;
type CachedFingerprint = { v: number; hash: string; components: FingerprintComponents };

let cached: CachedFingerprint | null = null;

// cyrb53: 高速・衝突しにくい非暗号ハッシュ。16進文字列（最大16桁）を返す。
function cyrb53(str: string, seed = 0): string {
	let h1 = 0xdeadbeef ^ seed;
	let h2 = 0x41c6ce57 ^ seed;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
	return n.toString(16);
}

function safe<T>(fn: () => T, fallback: T): T {
	try {
		return fn();
	} catch {
		return fallback;
	}
}

function canvasFingerprint(): string {
	return safe(() => {
		const canvas = window.document.createElement('canvas');
		canvas.width = 240; canvas.height = 60;
		const ctx = canvas.getContext('2d');
		if (ctx == null) return 'no-2d';
		ctx.textBaseline = 'top';
		ctx.font = '14px "Arial"';
		ctx.fillStyle = '#f60';
		ctx.fillRect(125, 1, 62, 20);
		ctx.fillStyle = '#069';
		ctx.fillText('Sharkey,😺 fp 0123', 2, 15);
		ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
		ctx.fillText('Sharkey,😺 fp 0123', 4, 17);
		return cyrb53(canvas.toDataURL());
	}, 'no-canvas');
}

function webglInfo(): { vendor: string; renderer: string } {
	return safe(() => {
		const canvas = window.document.createElement('canvas');
		const gl = (canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
		if (gl == null) return { vendor: 'no-webgl', renderer: 'no-webgl' };
		const dbg = gl.getExtension('WEBGL_debug_renderer_info');
		const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : String(gl.getParameter(gl.VENDOR));
		const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
		return { vendor, renderer };
	}, { vendor: 'err', renderer: 'err' });
}

// 既知フォントが存在するかをベースライン幅差で検出する。
function detectFonts(): string {
	return safe(() => {
		const baseFonts = ['monospace', 'sans-serif', 'serif'];
		const testFonts = ['Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'Microsoft YaHei', 'SimSun', 'PingFang SC', 'Noto Sans CJK SC', 'Hiragino Sans', 'Yu Gothic', 'Meiryo'];
		const testString = 'mmmmmmmmmmlli😺';
		const testSize = '72px';
		const span = window.document.createElement('span');
		span.style.position = 'absolute';
		span.style.left = '-9999px';
		span.style.fontSize = testSize;
		span.textContent = testString;
		window.document.body.appendChild(span);
		const baseline: Record<string, { w: number; h: number }> = {};
		for (const base of baseFonts) {
			span.style.fontFamily = base;
			baseline[base] = { w: span.offsetWidth, h: span.offsetHeight };
		}
		const available: string[] = [];
		for (const font of testFonts) {
			let detected = false;
			for (const base of baseFonts) {
				span.style.fontFamily = `'${font}',${base}`;
				if (span.offsetWidth !== baseline[base].w || span.offsetHeight !== baseline[base].h) {
					detected = true;
					break;
				}
			}
			if (detected) available.push(font);
		}
		window.document.body.removeChild(span);
		return available.join(',');
	}, 'err');
}

function collectComponents(): FingerprintComponents {
	const nav = window.navigator;
	const scr = window.screen;
	return {
		userAgent: safe(() => nav.userAgent, 'err'),
		language: safe(() => nav.language, 'err'),
		languages: safe(() => (nav.languages ?? []).join(','), 'err'),
		platform: safe(() => nav.platform, 'err'),
		hardwareConcurrency: safe(() => nav.hardwareConcurrency ?? 0, 0),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		deviceMemory: safe(() => (nav as any).deviceMemory ?? 0, 0),
		timezone: safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone, 'err'),
		timezoneOffset: safe(() => new Date().getTimezoneOffset(), 0),
		screen: safe(() => `${scr.width}x${scr.height}x${scr.colorDepth}@${window.devicePixelRatio}`, 'err'),
		touchSupport: safe(() => (('ontouchstart' in window) || nav.maxTouchPoints > 0), false),
		canvas: canvasFingerprint(),
		webgl: webglInfo(),
		fonts: detectFonts(),
	};
}

function compute(): CachedFingerprint {
	const components = collectComponents();
	// ハッシュは安定した分量から作る（毎回同じ順序で直列化）。
	const basis = JSON.stringify(components);
	const hash = `${cyrb53(basis)}${cyrb53(basis, 1)}`; // 約16〜26桁の16進
	return { v: VERSION, hash, components };
}

function load(): CachedFingerprint {
	if (cached != null) return cached;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw != null) {
			const parsed = JSON.parse(raw) as CachedFingerprint;
			if (parsed.v === VERSION && typeof parsed.hash === 'string' && parsed.hash.length > 0) {
				cached = parsed;
				return cached;
			}
		}
	} catch { /* ignore */ }

	cached = compute();
	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
	} catch { /* ignore */ }
	return cached;
}

/** 同期で指紋ハッシュを返す（API ヘッダー用）。失敗時は null。 */
export function getClientFingerprint(): string | null {
	try {
		return load().hash;
	} catch {
		return null;
	}
}

/** 指紋ハッシュと分量明細を返す（サーバー登録用）。 */
export function getClientFingerprintDetail(): { hash: string; components: FingerprintComponents } | null {
	try {
		const c = load();
		return { hash: c.hash, components: c.components };
	} catch {
		return null;
	}
}
