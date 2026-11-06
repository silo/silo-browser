<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
const menuRef = ref<HTMLDivElement | null>(null)

watch(
  () => uiStore.contextMenuVisible,
  async (visible) => {
    if (visible) {
      uiStore.hideSidebarTooltip()
      await nextTick()
      adjustPosition()
      menuRef.value?.querySelector<HTMLButtonElement>('button')?.focus()
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
  uiStore.hideContextMenu()
  action()
}

function moveFocus(e: KeyboardEvent, dir: 1 | -1): void {
  e.preventDefault()
  const buttons = Array.from(menuRef.value?.querySelectorAll<HTMLButtonElement>('button') ?? [])
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
  buttons[(i + dir + buttons.length) % buttons.length]?.focus()
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
        role="menu"
        class="absolute flex min-w-[190px] flex-col rounded-xl bg-panel p-1 shadow-menu"
        :style="{ left: uiStore.contextMenuX + 'px', top: uiStore.contextMenuY + 'px' }"
        @click.stop
        @keydown.down="moveFocus($event, 1)"
        @keydown.up="moveFocus($event, -1)"
      >
        <template v-for="(item, i) in uiStore.contextMenuItems" :key="i">
          <div v-if="item.separator" class="mx-2 my-1 h-px bg-line" />
          <button
            v-else
            type="button"
            role="menuitem"
            class="flex h-8 items-center rounded-lg px-2.5 text-left text-[13px] outline-none hover:bg-sel focus-visible:bg-sel"
            :class="item.danger ? 'text-danger' : 'text-fg1'"
            @click="handleAction(item.action)"
          >
            {{ item.label }}
          </button>
        </template>
      </div>
    </div>
  </Teleport>
</template>
