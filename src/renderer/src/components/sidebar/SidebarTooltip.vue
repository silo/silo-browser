<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

// The hovered element can disappear (layout switch, settings, collapse) without a mouseleave,
// so also hide on any click, scroll, window blur or layout change.
function hide(): void {
  uiStore.hideSidebarTooltip()
}

watch(
  () => [uiStore.settingsPageOpen, uiStore.sidebarExpanded, uiStore.sidebarLayout],
  hide
)

onMounted(() => {
  window.addEventListener('mousedown', hide, true)
  window.addEventListener('wheel', hide, { passive: true })
  window.addEventListener('blur', hide)
})

onUnmounted(() => {
  window.removeEventListener('mousedown', hide, true)
  window.removeEventListener('wheel', hide)
  window.removeEventListener('blur', hide)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.sidebarTooltipVisible"
      role="tooltip"
      class="pointer-events-none fixed z-[100] flex flex-col gap-0.5 rounded-[9px] bg-tip-bg px-[11px] py-[7px] whitespace-nowrap text-tip-fg shadow-[0_10px_24px_rgba(0,0,0,.22)]"
      :style="{
        left: uiStore.sidebarTooltipX + 'px',
        top: uiStore.sidebarTooltipY + 'px',
        transform: 'translateY(-50%)'
      }"
    >
      <span class="text-[12.5px] font-semibold">{{ uiStore.sidebarTooltipText }}</span>
      <span v-if="uiStore.sidebarTooltipSub" class="text-[11.5px] opacity-80">
        {{ uiStore.sidebarTooltipSub }}
      </span>
    </div>
  </Teleport>
</template>
