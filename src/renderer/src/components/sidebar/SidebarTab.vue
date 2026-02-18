<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import { useSidebarDrag } from '@renderer/composables/useSidebarDrag'
import type { TabItem, ContextMenuEntry } from '@renderer/types'

const props = defineProps<{ tab: TabItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const webviewRegistry = useWebviewRegistry()
const drag = useSidebarDrag()

const tabEl = ref<HTMLElement | null>(null)

const isActive = computed(() => groupsStore.activeTabId === props.tab.id)

const isBeingDragged = computed(
  () => drag.isDraggingTab.value && drag.dragId.value === props.tab.id
)

const showIndicatorBefore = computed(
  () =>
    drag.dropTargetId.value === props.tab.id &&
    drag.dropTargetType.value === 'tab' &&
    drag.dropPosition.value === 'before' &&
    drag.dragId.value !== props.tab.id
)

const showIndicatorAfter = computed(
  () =>
    drag.dropTargetId.value === props.tab.id &&
    drag.dropTargetType.value === 'tab' &&
    drag.dropPosition.value === 'after' &&
    drag.dragId.value !== props.tab.id
)

const hasAudio = computed(() => {
  if (props.tab.isAudioPlaying) return true
  return topbarStore.childTabs.some(
    (ct) => ct.parentTabId === props.tab.id && ct.isAudioPlaying
  )
})

const faviconUrl = computed(() => {
  if (props.tab.iconUrl) return props.tab.iconUrl
  try {
    const url = new URL(props.tab.url)
    return `https://www.google.com/s2/favicons?domain=${url.hostname}&sz=32`
  } catch {
    return null
  }
})

const statusIcons = computed(() => {
  const icons: { path: string; color: string; badgeColor: string }[] = []
  if (!props.tab.notificationsEnabled) {
    icons.push({
      path: 'M9.143 17.082a24.248 24.248 0 0 0 3.844.148m-3.844-.148a23.856 23.856 0 0 1-5.455-1.31 8.964 8.964 0 0 0 2.3-5.542m3.155 6.852a3 3 0 0 0 5.667 1.97m1.965-2.277L21 21m-4.225-4.225a23.81 23.81 0 0 0 3.536-1.003A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6.53 6.53m10.245 10.245L6.53 6.53M3 3l3.53 3.53',
      color: 'text-blue-400',
      badgeColor: 'bg-blue-500'
    })
  }
  if (props.tab.isMuted) {
    icons.push({
      path: 'M17.25 9.75 19.5 12m0 0 2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6 4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z',
      color: 'text-red-400',
      badgeColor: 'bg-red-500'
    })
  }
  if (hasAudio.value && !props.tab.isMuted) {
    icons.push({
      path: 'M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z',
      color: 'text-blue-400',
      badgeColor: 'bg-blue-500'
    })
  }
  return icons
})

function activate(): void {
  groupsStore.activateTab(props.tab.id)
}

function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()

  const webview = webviewRegistry.getMain(props.tab.id)

  const items: ContextMenuEntry[] = [
    { label: 'Edit Tab...', action: () => uiStore.openEditTabDialog(props.tab.id) },
    { label: 'Reload', action: () => webview?.reload() },
    { separator: true },
    {
      label: props.tab.notificationsEnabled ? 'Disable Notifications' : 'Enable Notifications',
      action: () =>
        groupsStore.updateTab(props.tab.id, {
          notificationsEnabled: !props.tab.notificationsEnabled
        })
    },
    {
      label: props.tab.isMuted ? 'Unmute Tab' : 'Mute Tab',
      action: () =>
        groupsStore.updateTab(props.tab.id, {
          isMuted: !props.tab.isMuted
        })
    },
    { separator: true },
    {
      label: 'Delete Tab',
      action: () => groupsStore.removeTab(props.tab.id)
    }
  ]

  uiStore.showContextMenu(e.clientX, e.clientY, items)
}

function handleDragStart(e: DragEvent): void {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'tab', id: props.tab.id }))
  e.dataTransfer!.effectAllowed = 'move'
  // Delay so browser captures ghost image before opacity changes
  requestAnimationFrame(() => {
    drag.startTabDrag(props.tab.id, props.tab.groupId)
  })
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer!.dropEffect = 'move'

  if (!tabEl.value || !drag.isDraggingTab.value) return
  const pos = drag.positionFromEvent(e, tabEl.value)
  drag.updateDropTarget(props.tab.id, 'tab', pos)
}

function handleDrop(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) {
    drag.reset()
    return
  }
  try {
    const data = JSON.parse(raw)
    if (data.type === 'tab' && data.id !== props.tab.id) {
      const pos = tabEl.value ? drag.positionFromEvent(e, tabEl.value) : 'after'
      const targetOrder = pos === 'before' ? props.tab.order : props.tab.order + 1
      groupsStore.moveTab(data.id, props.tab.groupId, targetOrder)
    }
  } catch {
    // ignore
  }
  drag.reset()
}

function handleDragEnd(): void {
  drag.reset()
}

function handleDragLeave(e: DragEvent): void {
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!tabEl.value?.contains(relatedTarget)) {
    if (drag.dropTargetId.value === props.tab.id) {
      drag.clearDropTarget()
    }
  }
}
</script>

<template>
  <div class="relative">
    <!-- Drop indicator: before this tab -->
    <div
      v-if="showIndicatorBefore"
      class="absolute top-0 left-2 right-2 h-0.5 bg-blue-400 rounded-full z-10 pointer-events-none"
    />

    <div
      ref="tabEl"
      :class="[
        'flex items-center py-1.5 cursor-pointer rounded mx-1 transition-all relative',
        uiStore.sidebarExpanded ? 'px-2' : 'px-1 justify-center',
        isActive ? 'bg-gray-600' : 'hover:bg-gray-700/50',
        isBeingDragged ? 'opacity-40' : ''
      ]"
      @click="activate"
      @contextmenu="handleContextMenu"
      :title="tab.name"
      draggable="true"
      @dragstart="handleDragStart"
      @dragover="handleDragOver"
      @drop="handleDrop"
      @dragend="handleDragEnd"
      @dragleave="handleDragLeave"
    >
      <div class="relative shrink-0">
        <img
          v-if="faviconUrl && !tab.iconEmoji"
          :src="faviconUrl"
          class="w-5 h-5 rounded"
          :alt="tab.name"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
        />
        <span v-else-if="tab.iconEmoji" class="text-base w-5 text-center block">
          {{ tab.iconEmoji }}
        </span>
        <span
          v-else
          class="w-5 h-5 bg-gray-500 rounded flex items-center justify-center text-[10px] font-bold"
        >
          {{ tab.name.charAt(0).toUpperCase() }}
        </span>
        <span
          v-if="tab.notificationCount > 0"
          class="absolute -top-1 -right-1 min-w-[14px] h-[14px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5"
        >
          {{ tab.notificationCount > 99 ? '99+' : tab.notificationCount }}
        </span>
        <!-- Collapsed: first status icon as overlay badge at bottom-right -->
        <span
          v-if="!uiStore.sidebarExpanded && statusIcons.length"
          class="absolute -bottom-1 -right-1 w-3 h-3 rounded-full flex items-center justify-center"
          :class="statusIcons[0].badgeColor"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="w-2 h-2 text-white">
            <path stroke-linecap="round" stroke-linejoin="round" :d="statusIcons[0].path" />
          </svg>
        </span>
      </div>
      <span v-if="uiStore.sidebarExpanded" class="ml-2 text-sm truncate text-gray-300">
        {{ tab.name }}
      </span>
      <div
        v-if="statusIcons.length && uiStore.sidebarExpanded"
        class="ml-auto flex items-center gap-1 shrink-0"
      >
        <svg
          v-for="(icon, i) in statusIcons"
          :key="i"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-3.5 h-3.5"
          :class="icon.color"
        >
          <path stroke-linecap="round" stroke-linejoin="round" :d="icon.path" />
        </svg>
      </div>
    </div>

    <!-- Drop indicator: after this tab -->
    <div
      v-if="showIndicatorAfter"
      class="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-400 rounded-full z-10 pointer-events-none"
    />
  </div>
</template>
