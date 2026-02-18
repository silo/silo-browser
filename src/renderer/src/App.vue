<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import TheSidebar from '@renderer/components/sidebar/TheSidebar.vue'
import TheContentArea from '@renderer/components/content/TheContentArea.vue'
import ContextMenu from '@renderer/components/ContextMenu.vue'

const AddGroupDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/AddGroupDialog.vue')
)
const AddTabDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/AddTabDialog.vue')
)
const EditGroupDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/EditGroupDialog.vue')
)
const EditTabDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/EditTabDialog.vue')
)
const SettingsDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/SettingsDialog.vue')
)
const UpdateDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/UpdateDialog.vue')
)

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const webviewRegistry = useWebviewRegistry()

onMounted(async () => {
  const state = await window.api.getState()
  await Promise.all([groupsStore.loadFromDisk(state), uiStore.loadFromDisk(state)])
  await topbarStore.loadFromDisk(state)
  window.addEventListener('keydown', handleKeydown)

  // Listen for "Open in New Tab" from webview context menu
  window.api.onOpenInNewTab((url: string) => {
    const activeTab = groupsStore.activeTab
    if (activeTab) {
      topbarStore.addChildTab(activeTab.id, activeTab.groupId, url)
    }
  })

  // Listen for auto-updater
  window.api.onUpdateDownloaded((version: string) => {
    uiStore.showUpdateDialog(version)
  })

  // Listen for fallback update (native updater failed, manual download available)
  window.api.onUpdaterFallbackAvailable((version: string) => {
    uiStore.showFallbackUpdateDialog(version)
  })

  // Listen for up-to-date confirmation
  window.api.onUpdaterUpToDate(() => {
    uiStore.setUpdaterUpToDate()
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.api.removeOpenInNewTabListener()
  window.api.removeUpdateDownloadedListener()
  window.api.removeUpdaterFallbackAvailableListener()
  window.api.removeUpdaterUpToDateListener()
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
    const wv = webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
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
    const allTabs = groupsStore.allTabsFlat
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
  <AddGroupDialog v-if="uiStore.addGroupDialogOpen" />
  <AddTabDialog v-if="uiStore.addTabDialogOpen" />
  <EditGroupDialog v-if="uiStore.editGroupDialogOpen" />
  <EditTabDialog v-if="uiStore.editTabDialogOpen" />
  <SettingsDialog v-if="uiStore.settingsDialogOpen" />
  <UpdateDialog v-if="uiStore.updateDialogOpen" />
</template>
