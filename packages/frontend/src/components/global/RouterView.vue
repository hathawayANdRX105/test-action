<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_pageContainer" :class="$style.root">
	<KeepAlive v-if="isCacheable" :max="prefer.s.numberOfPageCache">
		<Suspense :timeout="0">
			<component :is="currentPageComponent" :key="key" v-bind="Object.fromEntries(currentPageProps)"/>

			<template #fallback>
				<MkLoading/>
			</template>
		</Suspense>
	</KeepAlive>
	<Suspense v-else :timeout="0">
		<component :is="currentPageComponent" :key="key" v-bind="Object.fromEntries(currentPageProps)"/>

		<template #fallback>
			<MkLoading/>
		</template>
	</Suspense>
</div>
</template>

<script lang="ts" setup>
import { computed, inject, ref, shallowRef, provide, nextTick } from 'vue';
import type { Component } from 'vue';
import { randomId } from '@@/js/random-id.js';
import type { Router } from '@/router.js';
import { prefer } from '@/preferences.js';
import MkLoadingPage from '@/pages/_loading_.vue';
import { DI } from '@/di.js';
import { deepEqual } from '@/utility/deep-equal.js';
import { assertFrontendAssetsCurrent, queueDisplayStateRestore } from '@/utility/frontend-consistency.js';

// Feed-like pages must stay cached so mobile back navigation restores the
// previous scroll anchor after opening a note.
const UNCACHED_ROUTES = new Set(['/my/notifications']);

const props = defineProps<{
	router?: Router;
}>();

const router = props.router ?? inject(DI.router);

if (router == null) {
	throw new Error('no router provided');
}

const viewId = randomId();
provide(DI.viewId, viewId);

const currentDepth = inject(DI.routerCurrentDepth, 0);
provide(DI.routerCurrentDepth, currentDepth + 1);

type CacheablePageComponent = Component & {
	pageCacheKey?: string;
};

function getPageKey(component: Component, fullPath: string): string {
	return (component as CacheablePageComponent).pageCacheKey ?? fullPath;
}

const current = router.current!;
const currentPageComponent = shallowRef('component' in current.route ? current.route.component : MkLoadingPage);
const currentPageProps = ref(current.props);
const currentRoutePath = ref(current.route.path);
const key = ref(getPageKey(currentPageComponent.value, router.getCurrentFullPath()));
const isCacheable = computed(() => !UNCACHED_ROUTES.has(currentRoutePath.value));

router.useListener('change', ({ resolved }) => {
	if (resolved == null || 'redirect' in resolved.route) return;
	if (resolved.route.path === currentRoutePath.value && deepEqual(resolved.props, currentPageProps.value)) return;
	const resolvedComponent: Component = 'component' in resolved.route ? resolved.route.component : MkLoadingPage;
	const currentRouter = router;

	function _() {
		currentPageComponent.value = resolvedComponent;
		currentPageProps.value = resolved.props;
		key.value = getPageKey(resolvedComponent, currentRouter.getCurrentFullPath());
		currentRoutePath.value = resolved.route.path;
	}

	_();
	queueDisplayStateRestore();
	nextTick(() => {
		assertFrontendAssetsCurrent().catch(err => {
			console.warn('Frontend consistency check failed.', err);
		});
	});
});
</script>

<style lang="scss" module>
.root {
	height: 100%;
	background-color: var(--MI_THEME-bg);
}
</style>
