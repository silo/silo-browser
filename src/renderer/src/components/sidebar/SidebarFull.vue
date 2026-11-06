<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { isMac, shortcut, TRAFFIC_LIGHT_INSET } from '@renderer/utils/platform'
import SidebarGroup from './SidebarGroup.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Design board "C · Main — one sidebar": every silo and its tabs in one 240px column.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const isEmpty = computed(() => groupsStore.groups.length === 0)
const draftName = computed(() => uiStore.welcomeDraftName.trim())
</script>

<template>
  <aside class="flex h-full min-h-0 w-[240px] shrink-0 flex-col">
    <div
      class="app-drag flex h-11 shrink-0 items-center pr-2.5"
      :style="{ paddingLeft: isMac ? `${TRAFFIC_LIGHT_INSET}px` : '16px' }"
    >
      <button
        v-if="!isEmpty"
        type="button"
        class="app-no-drag ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-fg3 transition-colors hover:bg-hover hover:text-fg1"
        aria-label="Collapse sidebar"
        :title="`Collapse sidebar (${shortcut('[')})`"
        @click="uiStore.toggleSidebar()"
      >
        <AppIcon name="sidebar" :size="16" :stroke="1.8" />
      </button>
    </div>

    <nav
      aria-label="Silos and tabs"
      class="thin-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pt-0.5 pb-2"
    >
      <TransitionGroup tag="div" name="group-list" class="flex flex-col gap-2">
        <SidebarGroup v-for="group in groupsStore.sortedGroups" :key="group.id" :group="group" />
      </TransitionGroup>

      <!-- Welcome: preview of the first silo while it's being named -->
      <div v-if="isEmpty" class="flex flex-col gap-1.5 px-[15px]">
        <div v-if="draftName" class="flex flex-col gap-1">
          <div class="flex h-8 items-center gap-[9px]">
            <SiloTile
              :silo="{ name: draftName, color: uiStore.tintPreviewColor ?? '#2F63D8' }"
              :size="20"
              :radius="6"
              ring
            />
            <span class="truncate font-display text-[14px] font-bold tracking-[-0.01em]">
              {{ draftName }}
            </span>
          </div>
          <span class="pl-[29px] text-[12px] text-fg3">No tabs yet</span>
        </div>
        <div v-else class="flex h-8 items-center gap-[9px]">
          <span
            aria-hidden="true"
            class="h-5 w-5 rounded-[6px] border-[1.5px] border-dashed border-fg3"
          />
          <span class="text-[13px] text-fg3">Your silos will appear here</span>
        </div>
      </div>
    </nav>

    <div class="flex shrink-0 items-center gap-1 px-2.5 pt-2 pb-2.5">
      <button
        v-if="!isEmpty"
        type="button"
        class="flex h-[30px] items-center gap-2 rounded-lg px-2 text-[13px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
        :title="`New silo (${shortcut('N')})`"
        @click="uiStore.openAddGroupDialog()"
      >
        <span
          aria-hidden="true"
          class="flex h-[18px] w-[18px] items-center justify-center rounded-[6px] border-[1.5px] border-dashed border-current"
        >
          <AppIcon name="plus" :size="10" :stroke="3" />
        </span>
        New silo
      </button>
      <button
        type="button"
        class="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
        aria-label="Settings"
        :title="`Settings (${shortcut(',')})`"
        @click="uiStore.openSettingsPage()"
      >
        <AppIcon name="settings" :size="16" :stroke="1.8" />
      </button>
    </div>
  </aside>
</template>
