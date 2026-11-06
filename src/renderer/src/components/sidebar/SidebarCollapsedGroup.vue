<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useGroupDnd } from '@renderer/composables/useSidebarDnd'
import { formatBadge, siloUnread, useSiloMenus } from '@renderer/composables/useSiloMenus'
import type { GroupItem } from '@renderer/types'
import SidebarCollapsedTab from './SidebarCollapsedTab.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// One silo in the collapsed (60px) sidebar: tile, tab icons and an add-tab button.
const props = defineProps<{ group: GroupItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { openSiloMenu } = useSiloMenus()

const headerEl = ref<HTMLElement | null>(null)
const dnd = useGroupDnd(() => props.group, headerEl)
const unread = computed(() => siloUnread(props.group))
const sortedTabs = computed(() => [...props.group.tabs].sort((a, b) => a.order - b.order))

function showTooltip(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const n = props.group.tabs.length
  const sub = [
    `${n} ${n === 1 ? 'tab' : 'tabs'}`,
    unread.value ? `${unread.value} unread` : '',
    props.group.isCollapsed ? 'click to show tabs' : 'click to hide tabs'
  ]
    .filter(Boolean)
    .join(' · ')
  uiStore.showSidebarTooltip(props.group.name, rect.right + 8, rect.top + rect.height / 2, sub)
}
</script>

<template>
  <section
    :aria-label="group.name"
    class="relative flex flex-col items-center gap-0.5 transition-opacity"
    :class="dnd.isBeingDragged.value ? 'opacity-40' : ''"
    @dragover="dnd.onBodyDragover"
    @drop="dnd.onBodyDrop"
  >
    <div
      v-if="dnd.indicatorBefore.value"
      class="pointer-events-none absolute -top-1.5 right-1 left-1 h-0.5 rounded-full bg-accent"
    />
    <button
      ref="headerEl"
      type="button"
      draggable="true"
      class="relative mb-1 flex h-7 w-10 items-center justify-center rounded-lg transition-colors"
      :class="dnd.isDropHighlighted.value ? 'bg-accent-soft' : 'hover:bg-hover'"
      :aria-label="group.name + (unread ? `, ${unread} unread` : '')"
      :aria-expanded="!group.isCollapsed"
      @click="groupsStore.toggleGroupCollapse(group.id)"
      @contextmenu="openSiloMenu($event, group)"
      @mouseenter="showTooltip"
      @mouseleave="uiStore.hideSidebarTooltip()"
      @dragstart="dnd.onHeaderDragstart"
      @dragover="dnd.onHeaderDragover"
      @drop="dnd.onHeaderDrop"
      @dragend="dnd.onDragend"
      @dragleave="dnd.onDragleave"
    >
      <SiloTile
        :silo="group"
        :size="24"
        :radius="7"
        :ring="groupsStore.activeGroup?.id === group.id"
      />
      <span
        v-if="group.isCollapsed && unread"
        aria-hidden="true"
        class="absolute -top-1 right-0 flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-chrome bg-badge px-1 text-[9.5px] font-semibold text-white"
      >
        {{ formatBadge(unread) }}
      </span>
    </button>
    <template v-if="!group.isCollapsed">
      <SidebarCollapsedTab v-for="tab in sortedTabs" :key="tab.id" :tab="tab" :group="group" />
      <button
        type="button"
        class="flex h-6 w-10 items-center justify-center rounded-[7px] text-fg3 transition-colors hover:bg-hover hover:text-fg1"
        :aria-label="`Add tab to ${group.name}`"
        :title="`Add tab to ${group.name}`"
        @click="uiStore.openAddTabDialog(group.id)"
      >
        <AppIcon name="plus" :size="13" :stroke="2.2" />
      </button>
    </template>
    <div
      v-if="dnd.indicatorAfter.value"
      class="pointer-events-none absolute right-1 -bottom-1.5 left-1 h-0.5 rounded-full bg-accent"
    />
  </section>
</template>
