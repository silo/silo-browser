<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { shortcut } from '@renderer/utils/platform'
import type { GroupItem } from '@renderer/types'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Narrow silo rail shown next to the Settings page (design board "C · Settings").
const groupsStore = useGroupsStore()
const uiStore = useUiStore()

function goToSilo(group: GroupItem): void {
  const lastId = groupsStore.lastTabBySilo[group.id]
  const target =
    (lastId && group.tabs.find((t) => t.id === lastId)) ||
    [...group.tabs].sort((a, b) => a.order - b.order)[0]
  if (target) {
    groupsStore.activateTab(target.id) // also closes settings
  } else {
    uiStore.closeSettingsPage()
    uiStore.openAddTabDialog(group.id)
  }
}
</script>

<template>
  <nav aria-label="Silos" class="flex h-full w-[60px] shrink-0 flex-col items-center">
    <div aria-hidden="true" class="app-drag h-11 w-full shrink-0" />
    <div class="thin-scroll flex min-h-0 flex-1 flex-col items-center gap-2.5 overflow-y-auto pt-3">
      <button
        v-for="group in groupsStore.sortedGroups"
        :key="group.id"
        type="button"
        class="rounded-[10px] transition-transform hover:scale-105 active:scale-95"
        :aria-label="`${group.name} silo`"
        :title="group.name"
        @click="goToSilo(group)"
      >
        <SiloTile :silo="group" :size="32" :radius="10" />
      </button>
    </div>
    <div class="shrink-0 pt-2 pb-2.5">
      <button
        type="button"
        class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-fg1 text-[var(--base)]"
        aria-label="Settings"
        aria-pressed="true"
        :title="`Close settings (Esc or ${shortcut(',')})`"
        @click="uiStore.closeSettingsPage()"
      >
        <AppIcon name="settings" :size="17" />
      </button>
    </div>
  </nav>
</template>
