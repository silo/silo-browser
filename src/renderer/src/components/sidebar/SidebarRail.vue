<script setup lang="ts">
import { computed, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useSiloMenus } from '@renderer/composables/useSiloMenus'
import { shiftShortcut, shortcut } from '@renderer/utils/platform'
import type { GroupItem } from '@renderer/types'
import SidebarRailSilo from './SidebarRailSilo.vue'
import SidebarTab from './SidebarTab.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'

// Design board "C · Main — rail + list": a 64px rail of silos plus the selected silo's tabs.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { openSiloMenuAt } = useSiloMenus()

const selected = computed<GroupItem | null>(() => groupsStore.currentGroup)

// Welcome screen (no silos yet): preview the first silo while it's being named
const isEmpty = computed(() => groupsStore.groups.length === 0)
const draftName = computed(() => uiStore.welcomeDraftName.trim())

const sortedTabs = computed(() =>
  selected.value ? [...selected.value.tabs].sort((a, b) => a.order - b.order) : []
)

// Once a tab is activated, the list follows the active tab again
watch(
  () => groupsStore.activeTabId,
  () => uiStore.setRailSilo(null)
)

function selectSilo(group: GroupItem): void {
  groupsStore.openSilo(group.id)
}

function openOptions(e: MouseEvent): void {
  if (!selected.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openSiloMenuAt(rect.left, rect.bottom + 4, selected.value)
}
</script>

<template>
  <div class="flex h-full min-h-0 shrink-0">
    <nav
      aria-label="Silos"
      class="chrome-transition flex w-16 shrink-0 flex-col items-center bg-rail"
    >
      <div aria-hidden="true" class="app-drag h-11 w-full shrink-0" />
      <div
        class="thin-scroll flex min-h-0 w-full flex-1 flex-col items-center gap-3 overflow-y-auto pt-2 pb-2"
      >
        <SidebarRailSilo
          v-for="group in groupsStore.sortedGroups"
          :key="group.id"
          :group="group"
          :selected="selected?.id === group.id"
          @select="selectSilo(group)"
        />
        <SiloTile
          v-if="isEmpty && draftName"
          :silo="{ name: draftName, color: uiStore.tintPreviewColor ?? '#2F63D8' }"
          :size="36"
          :radius="11"
          ring
          ring-gap="var(--rail)"
        />
        <span
          v-else-if="isEmpty"
          aria-hidden="true"
          class="h-9 w-9 shrink-0 rounded-[11px] border-[1.5px] border-dashed border-fg3"
        />
        <button
          v-if="!isEmpty"
          type="button"
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-fg3 text-fg2 transition-colors hover:border-fg2 hover:text-fg1"
          aria-label="New silo"
          :title="`New silo (${shortcut('N')})`"
          @click="uiStore.openAddGroupDialog()"
        >
          <AppIcon name="plus" :size="15" :stroke="2.2" />
        </button>
      </div>
      <div class="flex shrink-0 flex-col items-center gap-0.5 pt-2 pb-2.5">
        <button
          type="button"
          class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
          aria-label="Settings"
          :title="`Settings (${shortcut(',')})`"
          @click="uiStore.openSettingsPage()"
        >
          <AppIcon name="settings" :size="17" :stroke="1.8" />
        </button>
        <button
          v-if="!isEmpty"
          type="button"
          class="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
          aria-label="Collapse tab list"
          :title="`Collapse tab list (${shortcut('[')})`"
          @click="uiStore.toggleSidebar()"
        >
          <AppIcon name="sidebar-collapse" :size="17" :stroke="1.8" />
        </button>
      </div>
    </nav>

    <aside
      v-if="selected"
      :aria-label="`${selected.name} tabs`"
      class="flex min-h-0 w-[208px] shrink-0 flex-col"
    >
      <div class="app-drag flex flex-col gap-[3px] pt-[50px] pr-2 pb-2.5 pl-3.5">
        <div class="flex items-center gap-1.5">
          <h2
            class="m-0 min-w-0 flex-1 truncate font-display text-[19px] leading-[1.1] font-bold tracking-[-0.02em]"
          >
            {{ selected.name }}
          </h2>
          <button
            type="button"
            class="app-no-drag flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
            :aria-label="`${selected.name} options`"
            @click="openOptions"
          >
            <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.7" />
              <circle cx="12" cy="12" r="1.7" />
              <circle cx="19" cy="12" r="1.7" />
            </svg>
          </button>
        </div>
        <span class="flex items-center gap-[5px] text-[11.5px] text-fg3">
          <AppIcon name="shield" :size="12" :stroke="2" />
          Own session · {{ selected.tabs.length }} {{ selected.tabs.length === 1 ? 'tab' : 'tabs' }}
        </span>
      </div>
      <div class="thin-scroll flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
        <!-- Keyed by silo: switching silos swaps the list instantly instead of animating the
             old tabs out and the new ones in; reordering within a silo still animates. -->
        <TransitionGroup :key="selected.id" tag="div" name="tab-list" class="flex flex-col gap-px">
          <SidebarTab v-for="tab in sortedTabs" :key="tab.id" :tab="tab" />
        </TransitionGroup>
        <button
          type="button"
          class="flex h-8 w-full items-center gap-2.5 rounded-[9px] px-2 text-left text-[13.5px] text-fg3 transition-colors hover:bg-hover hover:text-fg2"
          @click="uiStore.openAddTabDialog(selected.id)"
        >
          <span
            aria-hidden="true"
            class="flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] border-dashed border-current"
          >
            <AppIcon name="plus" :size="10" :stroke="3" />
          </span>
          <span class="flex-1">Add tab</span>
          <kbd class="text-[10.5px]">{{ shiftShortcut('N') }}</kbd>
        </button>
      </div>
    </aside>
    <aside
      v-else-if="isEmpty"
      aria-label="Your silos"
      class="flex min-h-0 w-[208px] shrink-0 flex-col"
    >
      <div class="app-drag flex flex-col gap-[3px] pt-[50px] pr-2 pb-2.5 pl-3.5">
        <h2
          class="m-0 truncate font-display text-[19px] leading-[1.1] font-bold tracking-[-0.02em]"
          :class="draftName ? '' : 'text-fg3'"
        >
          {{ draftName || 'Your silos' }}
        </h2>
        <span class="flex items-center gap-[5px] text-[11.5px] text-fg3">
          <AppIcon name="shield" :size="12" :stroke="2" />
          {{ draftName ? 'Own session · no tabs yet' : 'They will appear here' }}
        </span>
      </div>
    </aside>
  </div>
</template>
