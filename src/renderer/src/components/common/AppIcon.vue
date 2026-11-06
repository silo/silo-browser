<script setup lang="ts">
import { computed } from 'vue'

import { ICONS, type AppIconName } from '@renderer/utils/icons'

const props = withDefaults(
  defineProps<{ name: AppIconName; size?: number; stroke?: number; color?: string }>(),
  { size: 16, stroke: 1.9, color: 'currentColor' }
)

const d = computed(() => ICONS[props.name])
</script>

<template>
  <svg
    aria-hidden="true"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    :stroke="color"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="shrink-0"
  >
    <path :d="d" />
  </svg>
</template>
