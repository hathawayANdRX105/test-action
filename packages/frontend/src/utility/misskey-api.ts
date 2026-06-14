/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';
import { computed, reactive, ref } from 'vue';
import { apiUrl } from '@@/js/config.js';
import { $i } from '@/i.js';
import { getClientFingerprint } from '@/utility/fingerprint.js';
export const pendingApiRequestsCount = ref(0);

type ApiProgressState = {
	id: number;
	progress: number;
	startedAt: number;
	done: boolean;
	timer: number | null;
};

const API_PROGRESS_INITIAL = 8;
const API_PROGRESS_SOFT_MAX = 85;
let apiProgressId = 0;
const pendingApiProgress = reactive(new Map<number, ApiProgressState>());

function updateApiProgress(state: ApiProgressState): void {
	if (state.done) return;
	const elapsed = Date.now() - state.startedAt;
	const next = API_PROGRESS_INITIAL + (API_PROGRESS_SOFT_MAX - API_PROGRESS_INITIAL) * (1 - Math.exp(-elapsed / 2600));
	state.progress = Math.max(state.progress, Math.min(API_PROGRESS_SOFT_MAX, next));
}

function startApiProgress(): ApiProgressState {
	const state = reactive({
		id: ++apiProgressId,
		progress: API_PROGRESS_INITIAL,
		startedAt: Date.now(),
		done: false,
		timer: null,
	}) as ApiProgressState;

	state.timer = window.setInterval(() => updateApiProgress(state), 180);
	pendingApiProgress.set(state.id, state);
	return state;
}

function finishApiProgress(state: ApiProgressState): void {
	state.done = true;
	state.progress = 100;
	if (state.timer != null) {
		window.clearInterval(state.timer);
		state.timer = null;
	}
	window.setTimeout(() => {
		pendingApiProgress.delete(state.id);
	}, 220);
}

export const estimatedApiProgress = computed(() => {
	const values = [...pendingApiProgress.values()];
	if (values.length === 0) return null;
	const total = values.reduce((acc, state) => acc + state.progress, 0);
	return Math.round(total / values.length);
});

export type Endpoint = keyof Misskey.Endpoints;

export type Request<E extends Endpoint> = Misskey.Endpoints[E]['req'];

export type AnyRequest<E extends Endpoint | (string & unknown)> =
	(E extends Endpoint ? Request<E> : never) | object;

export type Response<E extends Endpoint | (string & unknown), P extends AnyRequest<E>> =
	E extends Endpoint
	? P extends Request<E> ? Misskey.api.SwitchCaseResponseType<E, P> : never
	: object;

// Implements Misskey.api.ApiClient.request
export function misskeyApi<
	ResT = void,
	E extends Endpoint | NonNullable<string> = Endpoint,
	P extends AnyRequest<E> = E extends Endpoint ? Request<E> : never,
	_ResT = ResT extends void ? Response<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as P & {},
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	if (endpoint.includes('://')) throw new Error('invalid endpoint');
	pendingApiRequestsCount.value++;
	const progressState = startApiProgress();

	const onFinally = () => {
		pendingApiRequestsCount.value--;
		finishApiProgress(progressState);
	};

	const promise = new Promise<_ResT>((resolve, reject) => {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
		};

		// ブラウザ指紋ハッシュを付与（管理者の溯源用、サーバー側で enableIpLogging 有効時のみ記録）。
		const fingerprint = getClientFingerprint();
		if (fingerprint != null) {
			headers['X-Client-Fingerprint'] = fingerprint;
		}

		// Append a credential
		const auth = token !== undefined
			? token
			: data.i !== undefined
				? data.i
				: $i?.token;

		if (auth) {
			headers['Authorization'] = `Bearer ${auth}`;
		}

		// Don't let the body value leak through
		delete data.i;

		// Send request
		window.fetch(`${apiUrl}/${endpoint}`, {
			method: 'POST',
			body: JSON.stringify(data),
			credentials: 'omit',
			cache: 'no-cache',
			headers,
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}

// Implements Misskey.api.ApiClient.request
export function misskeyApiGet<
	ResT = void,
	E extends keyof Misskey.Endpoints = keyof Misskey.Endpoints,
	P extends Misskey.Endpoints[E]['req'] = Misskey.Endpoints[E]['req'],
	_ResT = ResT extends void ? Misskey.api.SwitchCaseResponseType<E, P> : ResT,
>(
	endpoint: E,
	data: P & { i?: string | null; } = {} as P & {},
	token?: string | null | undefined,
	signal?: AbortSignal,
): Promise<_ResT> {
	pendingApiRequestsCount.value++;
	const progressState = startApiProgress();

	const onFinally = () => {
		pendingApiRequestsCount.value--;
		finishApiProgress(progressState);
	};

	const query = new URLSearchParams(data as any);

	const promise = new Promise<_ResT>((resolve, reject) => {
		// Append a credential
		const auth = token !== undefined
			? token
			: data.i !== undefined
				? data.i
				: $i?.token;

		const headers = auth
			? { 'Authorization': `Bearer ${auth}` }
			: undefined;

		// Don't let the body value leak through
		query.delete('i');

		// Send request
		window.fetch(`${apiUrl}/${endpoint}?${query}`, {
			method: 'GET',
			credentials: 'omit',
			cache: 'default',
			headers,
			signal,
		}).then(async (res) => {
			const body = res.status === 204 ? null : await res.json();

			if (res.status === 200) {
				resolve(body);
			} else if (res.status === 204) {
				resolve(undefined as _ResT); // void -> undefined
			} else {
				reject(body.error);
			}
		}).catch(reject);
	});

	promise.then(onFinally, onFinally);

	return promise;
}

export function printError(error: unknown): string {
	if (error != null && typeof(error) === 'object') {
		if ('info' in error && typeof (error.info) === 'object' && error.info) {
			if ('e' in error.info && typeof (error.info.e) === 'object' && error.info.e) {
				if ('message' in error.info.e && typeof (error.info.e.message) === 'string') return error.info.e.message;
				if ('code' in error.info.e && typeof (error.info.e.code) === 'string') return error.info.e.code;
				if ('id' in error.info.e && typeof (error.info.e.id) === 'string') return error.info.e.id;
			}
		}

		if ('message' in error && typeof (error.message) === 'string') return error.message;
		if ('code' in error && typeof (error.code) === 'string') return error.code;
		if ('id' in error && typeof (error.id) === 'string') return error.id;
	}

	return String(error);
}
