<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import DialogShell from '@renderer/components/common/DialogShell.vue'

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
  <DialogShell
    :title="uiStore.confirmRemoveTabIsChild ? 'Close tab' : 'Remove tab'"
    :width="400"
    @close="close"
    @submit="confirm"
  >
    <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
      <template v-if="uiStore.confirmRemoveTabIsChild">
        Close <span class="font-semibold text-fg1">{{ tab?.name ?? 'this tab' }}</span>?
      </template>
      <template v-else>
        Remove <span class="font-semibold text-fg1">{{ tab?.name ?? 'this tab' }}</span> from
        the sidebar? You stay signed in — other tabs in this silo keep the same logins.
      </template>
    </p>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      <button type="submit" class="btn btn-danger" autofocus>
        {{ uiStore.confirmRemoveTabIsChild ? 'Close' : 'Remove' }}
        <kbd class="text-[10.5px] opacity-85">↵</kbd>
      </button>
    </template>
  </DialogShell>
</template>
