<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
const menuRef = ref<HTMLDivElement | null>(null)

watch(
  () => uiStore.contextMenuVisible,
  async (visible) => {
    if (visible) {
      await nextTick()
      adjustPosition()
    }
  }
)

function adjustPosition(): void {
  const el = menuRef.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (rect.right > window.innerWidth) {
    uiStore.contextMenuX -= rect.right - window.innerWidth + 8
  }
  if (rect.bottom > window.innerHeight) {
    uiStore.contextMenuY -= rect.bottom - window.innerHeight + 8
  }
}

function handleAction(action: () => void): void {
  action()
  uiStore.hideContextMenu()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.contextMenuVisible"
      class="fixed inset-0 z-[100]"
      @click="uiStore.hideContextMenu()"
      @contextmenu.prevent="uiStore.hideContextMenu()"
    >
      <div
        ref="menuRef"
        class="absolute bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[180px]"
        :style="{ left: uiStore.contextMenuX + 'px', top: uiStore.contextMenuY + 'px' }"
        @click.stop
      >
        <template v-for="(item, i) in uiStore.contextMenuItems" :key="i">
          <div v-if="item.separator" class="border-t border-gray-700 my-1" />
          <button
            v-else
            class="w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            @click="handleAction(item.action)"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
