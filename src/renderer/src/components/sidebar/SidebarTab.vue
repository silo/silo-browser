<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import type { TabItem, ContextMenuEntry } from '@renderer/types'

const props = defineProps<{ tab: TabItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()

const isActive = computed(() => groupsStore.activeTabId === props.tab.id)

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

function activate(): void {
  groupsStore.activateTab(props.tab.id)
}

function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  e.stopPropagation()

  const webview = document.querySelector(
    `webview[data-tab-id="${props.tab.id}"]`
  ) as Electron.WebviewTag | null

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
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function handleDrop(e: DragEvent): void {
  e.preventDefault()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) return
  try {
    const data = JSON.parse(raw)
    if (data.type === 'tab' && data.id !== props.tab.id) {
      groupsStore.moveTab(data.id, props.tab.groupId, props.tab.order)
    }
  } catch {
    // ignore
  }
}
</script>

<template>
  <div
    :class="[
      'flex items-center px-2 py-1.5 cursor-pointer rounded mx-1 transition-colors relative',
      isActive ? 'bg-gray-600' : 'hover:bg-gray-700/50'
    ]"
    @click="activate"
    @contextmenu="handleContextMenu"
    :title="tab.name"
    draggable="true"
    @dragstart="handleDragStart"
    @dragover="handleDragOver"
    @drop="handleDrop"
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
    </div>
    <span v-if="uiStore.sidebarExpanded" class="ml-2 text-sm truncate text-gray-300">
      {{ tab.name }}
    </span>
    <svg
      v-if="hasAudio && uiStore.sidebarExpanded"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke-width="1.5"
      stroke="currentColor"
      class="w-3.5 h-3.5 ml-auto shrink-0 text-blue-400"
    >
      <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
    </svg>
  </div>
</template>
