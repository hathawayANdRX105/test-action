<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<!-- Replaced by the full changelog panel; keep this file as a thin alias for boot. -->
<MkChangelogPanel celebrate :markReadOnClose="true" @closed="$emit('closed')"/>
</template>

<script lang="ts" setup>
import MkChangelogPanel from '@/components/MkChangelogPanel.vue';

defineEmits<{
	(ev: 'closed'): void;
}>();
</script>
