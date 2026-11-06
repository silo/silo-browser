<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <Transition name="status-bar">
    <div
      v-if="uiStore.hoveredLinkUrl"
      class="pointer-events-none absolute bottom-1.5 left-1.5 z-20 max-w-[70%] truncate rounded-lg bg-panel px-2.5 py-1 font-mono text-[11px] text-fg2 shadow-menu"
    >
      {{ uiStore.hoveredLinkUrl }}
    </div>
  </Transition>
</template>

<style scoped>
.status-bar-enter-active,
.status-bar-leave-active {
  transition: opacity 0.15s ease;
}
.status-bar-enter-from,
.status-bar-leave-to {
  opacity: 0;
}
</style>
