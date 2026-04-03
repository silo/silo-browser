<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <Transition name="status-bar">
    <div
      v-if="uiStore.hoveredLinkUrl"
      class="absolute bottom-0 left-0 z-20 max-w-[70%] px-2 py-1 text-xs text-chrome-fg-secondary bg-surface-chrome/90 border border-chrome-border rounded-tr truncate pointer-events-none"
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
