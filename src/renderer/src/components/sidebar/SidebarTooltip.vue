<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.sidebarTooltipVisible"
      class="fixed z-[100] bg-surface-raised border border-border-default rounded px-2 py-1 text-xs text-fg-primary shadow-lg whitespace-nowrap pointer-events-none"
      :style="{
        left: uiStore.sidebarTooltipX + 'px',
        top: uiStore.sidebarTooltipY + 'px',
        transform: 'translateY(-50%)'
      }"
    >
      {{ uiStore.sidebarTooltipText }}
    </div>
  </Teleport>
</template>
