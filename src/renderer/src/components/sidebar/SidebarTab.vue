<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTabDnd } from '@renderer/composables/useSidebarDnd'
import {
  captureLabel,
  formatBadge,
  useSiloMenus,
  useTabStatus
} from '@renderer/composables/useSiloMenus'
import { useTabShortcut } from '@renderer/composables/useTabShortcut'
import type { TabItem } from '@renderer/types'
import TabIcon from '@renderer/components/common/TabIcon.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import CaptureIcons from '@renderer/components/common/CaptureIcons.vue'

const props = defineProps<{ tab: TabItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { openTabMenu } = useSiloMenus()

const el = ref<HTMLElement | null>(null)
const dnd = useTabDnd(() => props.tab, el)
const status = useTabStatus(() => props.tab)
const hint = useTabShortcut(() => props.tab)

const isActive = computed(() => groupsStore.activeTabId === props.tab.id)

const label = computed(() => {
  const parts = [props.tab.name]
  const live = captureLabel(status.value)
  if (live) parts.push(live)
  if (status.value.badge) parts.push(`${status.value.badge} notifications`)
  if (status.value.audio) parts.push('playing audio')
  if (status.value.muted) parts.push('muted')
  if (status.value.bellOff) parts.push('notifications off')
  if (status.value.asleep) parts.push('asleep')
  return parts.join(', ')
})
</script>

<template>
  <div class="relative">
    <div
      v-if="dnd.indicatorBefore.value"
      class="pointer-events-none absolute -top-px right-2 left-2 z-10 h-0.5 rounded-full bg-accent"
    />
    <button
      ref="el"
      type="button"
      draggable="true"
      :aria-label="label"
      :aria-current="isActive ? 'page' : undefined"
      :aria-keyshortcuts="hint.aria || undefined"
      :title="hint.label ? `${tab.name} (${hint.label})` : tab.name"
      class="group flex h-8 w-full items-center gap-2.5 rounded-[9px] px-2 text-left transition-[background-color,opacity] duration-150"
      :class="[
        isActive ? 'bg-tab-on shadow-tab-on' : 'hover:bg-hover active:bg-press',
        dnd.isBeingDragged.value ? 'opacity-40' : ''
      ]"
      @click="groupsStore.activateTab(tab.id)"
      @contextmenu="openTabMenu($event, tab)"
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
        :size="18"
        :dim="status.asleep"
      />
      <span
        class="min-w-0 flex-1 truncate text-[13.5px]"
        :class="
          isActive
            ? 'font-semibold text-fg1'
            : status.asleep
              ? 'font-medium text-fg3'
              : 'font-medium text-fg2'
        "
      >
        {{ tab.name }}
      </span>
      <span class="flex shrink-0 items-center gap-1.5">
        <CaptureIcons :capture="status" :size="14" />
        <AppIcon v-if="status.audio" name="audio" :size="14" class="text-accent-txt" />
        <AppIcon v-if="status.muted" name="muted" :size="14" class="text-fg3" />
        <AppIcon v-if="status.bellOff" name="bell-off" :size="14" class="text-fg3" />
        <AppIcon v-if="status.asleep" name="moon" :size="13" :stroke="2" class="text-fg3" />
        <span
          v-if="status.badge"
          class="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] bg-badge px-[5px] text-[11px] font-semibold text-white"
        >
          {{ formatBadge(status.badge) }}
        </span>
        <!-- Shortcut: on hover, or on every tab while ⌘ / Ctrl is held -->
        <kbd
          v-if="hint.label"
          aria-hidden="true"
          class="font-mono text-[10.5px] text-fg3"
          :class="uiStore.modifierHeld ? 'inline' : 'hidden group-hover:inline'"
        >
          {{ hint.label }}
        </kbd>
      </span>
    </button>
    <div
      v-if="dnd.indicatorAfter.value"
      class="pointer-events-none absolute right-2 -bottom-px left-2 z-10 h-0.5 rounded-full bg-accent"
    />
  </div>
</template>
