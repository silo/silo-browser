<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()

const tab = computed(() => {
  if (!uiStore.confirmRemoveTabTargetId) return null
  if (uiStore.confirmRemoveTabIsChild) {
    const child = topbarStore.childTabs.find((c) => c.id === uiStore.confirmRemoveTabTargetId)
    if (child) return { name: child.currentTitle || child.url }
  }
  return groupsStore.allTabsFlat.find((t) => t.id === uiStore.confirmRemoveTabTargetId) ?? null
})

function confirm(): void {
  if (uiStore.confirmRemoveTabTargetId) {
    if (uiStore.confirmRemoveTabIsChild) {
      topbarStore.removeChildTab(uiStore.confirmRemoveTabTargetId)
    } else {
      groupsStore.removeTab(uiStore.confirmRemoveTabTargetId)
    }
  }
  uiStore.closeConfirmRemoveTabDialog()
}

function close(): void {
  uiStore.closeConfirmRemoveTabDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      @click.self="close"
    >
      <div
        class="bg-surface-raised rounded-lg shadow-xl border border-border-default w-[400px] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 class="text-lg font-semibold text-fg-primary">Remove Tab</h2>
          <button
            @click="close"
            class="text-fg-muted hover:text-fg-primary transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-5 h-5"
            >
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 py-5">
          <p class="text-sm text-fg-secondary">
            Are you sure you want to remove
            <span class="font-semibold text-fg-primary">{{ tab?.name ?? 'this tab' }}</span>?
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <button
            @click="close"
            class="px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary bg-surface-hover hover:bg-surface-active rounded transition-colors"
          >
            Cancel
          </button>
          <button
            @click="confirm"
            class="px-4 py-2 text-sm text-white bg-semantic-danger hover:bg-semantic-danger-soft rounded transition-colors"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
