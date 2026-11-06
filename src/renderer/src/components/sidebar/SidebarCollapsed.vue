<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { shortcut } from '@renderer/utils/platform'
import SidebarCollapsedGroup from './SidebarCollapsedGroup.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Design board "C · Collapsed": a 60px column of silo tiles and tab icons. The title row
// (traffic lights + navigation) spans the full window width above it — see App.vue.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
</script>

<template>
  <aside class="flex h-full min-h-0 w-[60px] shrink-0 flex-col items-center">
    <nav
      aria-label="Silos and tabs"
      class="thin-scroll flex min-h-0 w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto pt-1 pb-2"
    >
      <SidebarCollapsedGroup v-for="group in groupsStore.sortedGroups" :key="group.id" :group="group" />
    </nav>

    <div class="flex shrink-0 flex-col items-center gap-0.5 pt-2 pb-2.5">
      <button
        type="button"
        class="flex h-8 w-[34px] items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
        aria-label="New silo"
        :title="`New silo (${shortcut('N')})`"
        @click="uiStore.openAddGroupDialog()"
      >
        <span
          aria-hidden="true"
          class="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-current"
        >
          <AppIcon name="plus" :size="10" :stroke="3" />
        </span>
      </button>
      <button
        type="button"
        class="flex h-8 w-[34px] items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
        aria-label="Settings"
        :title="`Settings (${shortcut(',')})`"
        @click="uiStore.openSettingsPage()"
      >
        <AppIcon name="settings" :size="16" :stroke="1.8" />
      </button>
      <button
        type="button"
        class="flex h-8 w-[34px] items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
        aria-label="Expand sidebar"
        :title="`Expand sidebar (${shortcut('[')})`"
        @click="uiStore.toggleSidebar()"
      >
        <AppIcon name="sidebar-expand" :size="16" :stroke="1.8" />
      </button>
    </div>
  </aside>
</template>
