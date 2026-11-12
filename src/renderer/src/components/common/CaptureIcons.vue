<script setup lang="ts">
import type { MediaCapture } from '@renderer/types'
import AppIcon from './AppIcon.vue'

/** Red "live" icons for camera / microphone / screen share in use (like Chrome's tab dot). */
withDefaults(defineProps<{ capture: MediaCapture; size?: number }>(), { size: 14 })
</script>

<template>
  <span
    v-if="capture.camera || capture.mic || capture.screen"
    aria-hidden="true"
    class="inline-flex shrink-0 items-center gap-1 text-badge"
  >
    <AppIcon v-if="capture.camera" name="camera" :size="size" :stroke="2" />
    <AppIcon v-if="capture.mic" name="mic" :size="size" :stroke="2" />
    <AppIcon v-if="capture.screen" name="screen-share" :size="size" :stroke="2" />
  </span>
</template>
