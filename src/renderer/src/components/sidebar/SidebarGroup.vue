<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useGroupDnd } from '@renderer/composables/useSidebarDnd'
import {
  captureLabel,
  formatBadge,
  isCapturing,
  siloCapture,
  siloUnread,
  useSiloMenus
} from '@renderer/composables/useSiloMenus'
import type { GroupItem } from '@renderer/types'
import SidebarTab from './SidebarTab.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import CaptureIcons from '@renderer/components/common/CaptureIcons.vue'

const props = defineProps<{ group: GroupItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { openSiloMenu } = useSiloMenus()

const headerEl = ref<HTMLElement | null>(null)
const dnd = useGroupDnd(() => props.group, headerEl)

const isActiveSilo = computed(() => groupsStore.activeGroup?.id === props.group.id)
const open = computed(() => !props.group.isCollapsed)
const unread = computed(() => siloUnread(props.group))
const capture = computed(() => siloCapture(props.group))
const live = computed(() => (isCapturing(capture.value) ? captureLabel(capture.value) : ''))
const sortedTabs = computed(() => [...props.group.tabs].sort((a, b) => a.order - b.order))
</script>

<template>
  <section
    class="relative flex flex-col gap-px px-2 transition-opacity duration-200"
    :class="dnd.isBeingDragged.value ? 'opacity-40' : ''"
    :aria-label="group.name"
    @dragover="dnd.onBodyDragover"
    @drop="dnd.onBodyDrop"
  >
    <div
      v-if="dnd.indicatorBefore.value"
      class="pointer-events-none absolute -top-1 right-2 left-2 z-10 h-0.5 rounded-full bg-accent"
    />

    <div
      ref="headerEl"
      draggable="true"
      class="flex h-8 items-center gap-0.5 rounded-[9px] pl-[7px] transition-colors"
      :class="dnd.isDropHighlighted.value ? 'bg-accent-soft' : ''"
      @contextmenu="openSiloMenu($event, group)"
      @dragstart="dnd.onHeaderDragstart"
      @dragover="dnd.onHeaderDragover"
      @drop="dnd.onHeaderDrop"
      @dragend="dnd.onDragend"
      @dragleave="dnd.onDragleave"
    >
      <button
        type="button"
        class="flex h-[30px] min-w-0 flex-1 items-center gap-[9px] text-left"
        :aria-expanded="open"
        :aria-label="
          group.name +
          (live && !open ? `, ${live}` : '') +
          (unread && !open ? `, ${unread} unread` : '')
        "
        @click="groupsStore.toggleGroupCollapse(group.id)"
      >
        <SiloTile :silo="group" :size="20" :radius="6" :ring="isActiveSilo" />
        <span class="truncate font-display text-[14px] font-bold tracking-[-0.01em] text-fg1">
          {{ group.name }}
        </span>
        <AppIcon
          name="chevron"
          :size="12"
          :stroke="2.2"
          class="text-fg3 transition-transform duration-150"
          :class="open ? '' : '-rotate-90'"
        />
        <!-- Collapsed silo: show that one of its tabs is on a call -->
        <CaptureIcons v-if="!open && live" :capture="capture" :size="13" class="ml-auto" />
        <span
          v-if="!open && unread"
          :class="live ? 'ml-1.5' : 'ml-auto'"
          class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-badge px-[5px] text-[11px] font-semibold text-white"
        >
          {{ formatBadge(unread) }}
        </span>
      </button>
      <button
        type="button"
        class="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] text-fg3 transition-colors hover:bg-hover hover:text-fg1"
        :aria-label="`Add tab to ${group.name}`"
        :title="`Add tab to ${group.name}`"
        @click="uiStore.openAddTabDialog(group.id)"
      >
        <AppIcon name="plus" :size="14" :stroke="2.2" />
      </button>
    </div>

    <TransitionGroup v-if="open" tag="div" name="tab-list" class="flex flex-col gap-px">
      <SidebarTab v-for="tab in sortedTabs" :key="tab.id" :tab="tab" />
    </TransitionGroup>
    <button
      v-if="open && group.tabs.length === 0"
      type="button"
      class="flex h-7 items-center rounded-[9px] pl-[36px] text-left text-[12px] text-fg3 transition-colors hover:bg-hover hover:text-fg2"
      @click="uiStore.openAddTabDialog(group.id)"
    >
      No tabs yet — add one
    </button>

    <div
      v-if="dnd.indicatorAfter.value"
      class="pointer-events-none absolute right-2 -bottom-1 left-2 z-10 h-0.5 rounded-full bg-accent"
    />
  </section>
</template>
