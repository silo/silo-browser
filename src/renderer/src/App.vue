<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import TheSidebar from '@renderer/components/sidebar/TheSidebar.vue'
import TheContentArea from '@renderer/components/content/TheContentArea.vue'
import ContextMenu from '@renderer/components/ContextMenu.vue'
import AddGroupDialog from '@renderer/components/dialogs/AddGroupDialog.vue'
import AddTabDialog from '@renderer/components/dialogs/AddTabDialog.vue'
import EditGroupDialog from '@renderer/components/dialogs/EditGroupDialog.vue'
import EditTabDialog from '@renderer/components/dialogs/EditTabDialog.vue'
import SettingsDialog from '@renderer/components/dialogs/SettingsDialog.vue'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()

onMounted(async () => {
  await Promise.all([groupsStore.loadFromDisk(), uiStore.loadFromDisk()])
  window.addEventListener('keydown', handleKeydown)

  // Listen for "Open in New Tab" from webview context menu
  window.api.onOpenInNewTab((url: string) => {
    const activeTab = groupsStore.activeTab
    if (activeTab) {
      topbarStore.addChildTab(activeTab.id, activeTab.groupId, url)
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.api.removeOpenInNewTabListener()
})

function handleKeydown(e: KeyboardEvent): void {
  const mod = e.metaKey || e.ctrlKey

  // Ctrl/Cmd+T — open add tab dialog for first group
  if (mod && e.key === 't') {
    e.preventDefault()
    const firstGroup = groupsStore.sortedGroups[0]
    if (firstGroup) uiStore.openAddTabDialog(firstGroup.id)
    return
  }

  // Ctrl/Cmd+N — new group
  if (mod && e.key === 'n') {
    e.preventDefault()
    uiStore.openAddGroupDialog()
    return
  }

  // Ctrl/Cmd+W — close active child tab (never closes primary sidebar tabs)
  if (mod && e.key === 'w') {
    e.preventDefault()
    if (topbarStore.isChildActive) {
      topbarStore.removeChildTab(topbarStore.activeTopbarTabId!)
    }
    return
  }

  // Ctrl/Cmd+R — reload active webview (child or main)
  if (mod && e.key === 'r') {
    e.preventDefault()
    let wv: Electron.WebviewTag | null = null
    if (topbarStore.isChildActive) {
      wv = document.querySelector(
        `webview[data-child-tab-id="${topbarStore.activeTopbarTabId}"]`
      ) as Electron.WebviewTag | null
    } else if (groupsStore.activeTabId) {
      wv = document.querySelector(
        `webview[data-tab-id="${groupsStore.activeTabId}"]`
      ) as Electron.WebviewTag | null
    }
    wv?.reload()
    return
  }

  // Ctrl/Cmd+L — open URL bar
  if (mod && e.key === 'l') {
    e.preventDefault()
    uiStore.openUrlBar()
    return
  }

  // Ctrl/Cmd+, — open settings
  if (mod && e.key === ',') {
    e.preventDefault()
    uiStore.openSettingsDialog()
    return
  }

  // Ctrl/Cmd+[ or ] — sidebar toggle
  if (mod && (e.key === '[' || e.key === ']')) {
    e.preventDefault()
    uiStore.toggleSidebar()
    return
  }

  // Ctrl/Cmd+1-9 — switch to Nth loaded tab
  if (mod && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    const allTabs = groupsStore.groups.flatMap((g) => g.tabs)
    const idx = parseInt(e.key) - 1
    if (idx < allTabs.length) {
      groupsStore.activateTab(allTabs[idx].id)
    }
    return
  }

  // Escape — close context menu, settings, URL bar, or dialogs
  if (e.key === 'Escape') {
    uiStore.hideContextMenu()
    uiStore.closeUrlBar()
    uiStore.closeSettingsDialog()
  }
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-gray-900 text-white">
    <TheSidebar />
    <TheContentArea />
  </div>
  <ContextMenu />
  <AddGroupDialog />
  <AddTabDialog />
  <EditGroupDialog />
  <EditTabDialog />
  <SettingsDialog />
</template>
