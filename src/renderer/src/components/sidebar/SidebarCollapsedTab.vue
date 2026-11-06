<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTabDnd } from '@renderer/composables/useSidebarDnd'
import { formatBadge, useSiloMenus, useTabStatus } from '@renderer/composables/useSiloMenus'
import type { GroupItem, TabItem } from '@renderer/types'
import TabIcon from '@renderer/components/common/TabIcon.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import type { AppIconName } from '@renderer/utils/icons'

// Icon-only tab button in the collapsed (60px) sidebar — design board "C · Collapsed".
const props = defineProps<{ tab: TabItem; group: GroupItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { openTabMenu } = useSiloMenus()

const el = ref<HTMLElement | null>(null)
const dnd = useTabDnd(() => props.tab, el)
const status = useTabStatus(() => props.tab)
const isActive = computed(() => groupsStore.activeTabId === props.tab.id)

const STATUS_ICON: Record<NonNullable<typeof status.value.primary>, AppIconName> = {
  audio: 'audio-small',
  muted: 'muted',
  bell: 'bell-off',
  sleep: 'moon'
}

const tooltipSub = computed(() => {
  const s = status.value
  const parts = [props.group.name]
  if (s.badge) parts.push(`${s.badge} unread`)
  if (s.asleep) parts.push('asleep, click to wake')
  else if (s.audio) parts.push('playing audio')
  else if (s.muted) parts.push('muted')
  else if (s.bellOff) parts.push('notifications off')
  return parts.join(' · ')
})

function showTooltip(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  uiStore.showSidebarTooltip(props.tab.name, rect.right + 8, rect.top + rect.height / 2, tooltipSub.value)
}
</script>

<template>
  <div class="relative">
    <div
      v-if="dnd.indicatorBefore.value"
      class="pointer-events-none absolute -top-px right-1 left-1 z-10 h-0.5 rounded-full bg-accent"
    />
    <button
      ref="el"
      type="button"
      draggable="true"
      :aria-label="`${tab.name} in ${group.name}` + (status.badge ? `, ${status.badge} notifications` : '')"
      :aria-current="isActive ? 'page' : undefined"
      class="relative flex h-9 w-10 items-center justify-center rounded-[10px] transition-[background-color,opacity] duration-150"
      :class="[
        isActive ? 'bg-tab-on shadow-tab-on' : 'hover:bg-hover active:bg-press',
        dnd.isBeingDragged.value ? 'opacity-40' : ''
      ]"
      @click="groupsStore.activateTab(tab.id)"
      @contextmenu="openTabMenu($event, tab)"
      @mouseenter="showTooltip"
      @mouseleave="uiStore.hideSidebarTooltip()"
      @dragstart="dnd.onDragstart"
      @dragover="dnd.onDragover"
      @drop="dnd.onDrop"
      @dragend="dnd.onDragend"
      @dragleave="dnd.onDragleave"
    >
      <TabIcon
        :name="tab.name"
        :url="tab.url"
        :icon-url="tab.iconUrl"
        :icon-emoji="tab.iconEmoji"
        :size="20"
        :dim="status.asleep"
      />
      <span
        v-if="status.badge"
        aria-hidden="true"
        class="absolute top-px right-0 flex h-4 min-w-4 items-center justify-center rounded-lg border-2 border-chrome bg-badge px-1 text-[9.5px] font-semibold text-white"
      >
        {{ formatBadge(status.badge) }}
      </span>
      <span
        v-if="status.primary"
        aria-hidden="true"
        class="absolute right-[3px] bottom-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-chrome"
        :class="status.primary === 'audio' ? 'bg-accent text-on-accent' : 'bg-[var(--status-ink)] text-white'"
      >
        <AppIcon :name="STATUS_ICON[status.primary]" :size="8" :stroke="3" />
      </span>
    </button>
    <div
      v-if="dnd.indicatorAfter.value"
      class="pointer-events-none absolute right-1 -bottom-px left-1 z-10 h-0.5 rounded-full bg-accent"
    />
  </div>
</template>
