<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useWebviewRegistry, type WebviewTag } from '@renderer/composables/useWebviewRegistry'
import { useAppTheme } from '@renderer/composables/useAppTheme'
import TheSidebar from '@renderer/components/sidebar/TheSidebar.vue'
import TheNavigationBar from '@renderer/components/content/TheNavigationBar.vue'
import TheContentArea from '@renderer/components/content/TheContentArea.vue'
import ContextMenu from '@renderer/components/ContextMenu.vue'

const SiloDialog = defineAsyncComponent(() => import('@renderer/components/dialogs/SiloDialog.vue'))
const AddTabDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/AddTabDialog.vue')
)
const EditTabDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/EditTabDialog.vue')
)
const SettingsPage = defineAsyncComponent(
  () => import('@renderer/components/settings/SettingsPage.vue')
)
const ConfirmRemoveTabDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/ConfirmRemoveTabDialog.vue')
)
const UpdateDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/UpdateDialog.vue')
)
const DisplayMediaPickerDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/DisplayMediaPickerDialog.vue')
)
const CommandBar = defineAsyncComponent(() => import('@renderer/components/CommandBar.vue'))

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const webviewRegistry = useWebviewRegistry()

useAppTheme()

/**
 * The window is one CSS grid so the content area (and its webviews) never changes DOM parent
 * when the layout changes — moving a <webview> in the DOM would reload it.
 *   expanded:  sidebar on the left, title row + page on the right
 *   collapsed: title row across the full width, 60px icon column + page below
 *   settings:  silo rail + settings page
 */
const mode = computed<'expanded' | 'collapsed' | 'settings'>(() => {
  if (uiStore.settingsPageOpen) return 'settings'
  if (!uiStore.sidebarExpanded && groupsStore.groups.length > 0) return 'collapsed'
  return 'expanded'
})

const gridAreas = computed(() => {
  switch (mode.value) {
    case 'collapsed':
      return '"header header" "side content"'
    case 'settings':
      return '"side settings" "side settings"'
    default:
      return '"side header" "side content"'
  }
})

onMounted(async () => {
  const state = await window.api.getState()
  await Promise.all([groupsStore.loadFromDisk(state), uiStore.loadFromDisk(state)])
  await topbarStore.loadFromDisk(state)
  window.addEventListener('keydown', handleKeydown)

  // "Open in New Tab" from the webview context menu
  window.api.onOpenInNewTab((url: string) => {
    const activeTab = groupsStore.activeTab
    if (activeTab) topbarStore.addChildTab(activeTab.id, activeTab.groupId, url)
  })

  window.api.onUpdateDownloaded((version: string) => uiStore.showUpdateDialog(version))
  window.api.onUpdaterFallbackAvailable((version: string) =>
    uiStore.showFallbackUpdateDialog(version)
  )
  window.api.onUpdaterUpToDate(() => uiStore.setUpdaterUpToDate())
  window.api.onPermissionRequest((data) => uiStore.showPermissionRequest(data))
  // Screen sharing source picker (when the native system picker isn't available)
  window.api.onDisplayMediaPick((data) => uiStore.showDisplayMediaPick(data))

  // Menu accelerators from the main process (these also fire while a page has focus)
  window.api.onCloseTab(() => handleCloseTab())
  window.api.onNewTab(() => openAddTabForCurrentSilo())
  window.api.onNewGroup(() => uiStore.openAddGroupDialog())
  window.api.onCommandBar(() => openCommandBar())
  window.api.onGoToTab((index: number) => goToTab(index))
  window.api.onOpenSettings(() => toggleSettings())
  window.api.onReloadTab(() => getActiveWebview()?.reload())
  window.api.onFind(() => uiStore.openFindBar())
  window.api.onZoomIn(() => applyZoom(0.5))
  window.api.onZoomOut(() => applyZoom(-0.5))
  window.api.onZoomReset(() => applyZoom(0, true))
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.api.removeOpenInNewTabListener()
  window.api.removeUpdateDownloadedListener()
  window.api.removeUpdaterFallbackAvailableListener()
  window.api.removeUpdaterUpToDateListener()
  window.api.removeCloseTabListener()
  window.api.removeNewTabListener()
  window.api.removeNewGroupListener()
  window.api.removeCommandBarListener()
  window.api.removeGoToTabListener()
  window.api.removeOpenSettingsListener()
  window.api.removeReloadTabListener()
  window.api.removeZoomInListener()
  window.api.removeZoomOutListener()
  window.api.removeZoomResetListener()
  window.api.removePermissionRequestListener()
  window.api.removeDisplayMediaPickListener()
  window.api.removeFindListener()
})

function getActiveWebview(): WebviewTag | null {
  return webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
}

function applyZoom(delta: number, reset = false): void {
  const wv = getActiveWebview()
  if (!wv) return
  const newLevel = reset ? 0 : wv.getZoomLevel() + delta
  wv.setZoomLevel(newLevel)
  if (groupsStore.activeTabId) groupsStore.setTabZoomLevel(groupsStore.activeTabId, newLevel)
}

function toggleSettings(): void {
  if (uiStore.settingsPageOpen) uiStore.closeSettingsPage()
  else uiStore.openSettingsPage()
}

/** ⌘T adds a tab to the silo you're in (the rail's selected silo, else the active tab's). */
function openAddTabForCurrentSilo(): void {
  const target =
    (uiStore.railSiloId && groupsStore.findGroup(uiStore.railSiloId)) ||
    groupsStore.activeGroup ||
    groupsStore.sortedGroups[0]
  if (target) uiStore.openAddTabDialog(target.id)
}

// Open-only (never toggles): the menu accelerator and the keydown fallback may both fire
function openCommandBar(): void {
  if (groupsStore.groups.length === 0) return
  uiStore.openCommandBar()
}

function goToTab(index: number): void {
  const tab = groupsStore.allTabsFlat[index]
  if (tab) groupsStore.activateTab(tab.id)
}

function handleCloseTab(): void {
  if (topbarStore.isChildActive) {
    if (uiStore.confirmCloseChildTabs) {
      uiStore.openConfirmRemoveTabDialog(topbarStore.activeTopbarTabId!, true)
    } else {
      topbarStore.removeChildTab(topbarStore.activeTopbarTabId!)
    }
  } else if (groupsStore.activeTabId) {
    uiStore.openConfirmRemoveTabDialog(groupsStore.activeTabId)
  }
}

// Fallback for when the app chrome (not a page) has focus. Shortcuts that also exist as menu
// accelerators are handled by the menu first; the handlers are idempotent either way.
function handleKeydown(e: KeyboardEvent): void {
  const mod = e.metaKey || e.ctrlKey

  // Ctrl/Cmd+A — select all within the active page, not the whole app
  if (mod && e.key === 'a') {
    const active = document.activeElement
    if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      getActiveWebview()?.selectAll()
    }
    return
  }

  if (mod && e.key === 't') {
    e.preventDefault()
    openAddTabForCurrentSilo()
    return
  }

  if (mod && e.key === 'n') {
    e.preventDefault()
    uiStore.openAddGroupDialog()
    return
  }

  if (mod && e.key === 'r') {
    e.preventDefault()
    getActiveWebview()?.reload()
    return
  }

  if (mod && e.key === 'f') {
    e.preventDefault()
    uiStore.openFindBar()
    return
  }

  if (mod && e.key === 'l') {
    e.preventDefault()
    openCommandBar()
    return
  }

  if (mod && e.key === ',') {
    e.preventDefault()
    toggleSettings()
    return
  }

  if (mod && (e.key === '[' || e.key === ']')) {
    e.preventDefault()
    uiStore.toggleSidebar()
    return
  }

  if (mod && e.key >= '1' && e.key <= '9') {
    e.preventDefault()
    goToTab(parseInt(e.key) - 1)
    return
  }

  // Escape — close the topmost layer first
  if (e.key === 'Escape') {
    if (uiStore.contextMenuVisible) return uiStore.hideContextMenu()
    if (uiStore.displayMediaPick) return uiStore.respondToDisplayMediaPick(null)
    if (uiStore.commandBarOpen) return uiStore.closeCommandBar()
    if (uiStore.addGroupDialogOpen) return uiStore.closeAddGroupDialog()
    if (uiStore.addTabDialogOpen) return uiStore.closeAddTabDialog()
    if (uiStore.editGroupDialogOpen) return uiStore.closeEditGroupDialog()
    if (uiStore.editTabDialogOpen) return uiStore.closeEditTabDialog()
    if (uiStore.confirmRemoveTabDialogOpen) return uiStore.closeConfirmRemoveTabDialog()
    if (uiStore.updateDialogOpen) return uiStore.closeUpdateDialog()
    if (uiStore.findBarOpen) return uiStore.closeFindBar()
    if (uiStore.settingsPageOpen) return uiStore.closeSettingsPage()
  }
}
</script>

<template>
  <div
    class="chrome-transition grid h-screen w-screen overflow-hidden bg-chrome text-fg1"
    :style="{
      gridTemplateColumns: 'auto minmax(0, 1fr)',
      gridTemplateRows: '44px minmax(0, 1fr)',
      gridTemplateAreas: gridAreas
    }"
  >
    <div class="min-h-0" style="grid-area: side">
      <TheSidebar />
    </div>
    <TheNavigationBar
      v-show="mode !== 'settings'"
      :full-width="mode === 'collapsed'"
      style="grid-area: header"
    />
    <TheContentArea v-show="mode !== 'settings'" style="grid-area: content" />
    <SettingsPage v-if="mode === 'settings'" style="grid-area: settings" />
  </div>
  <ContextMenu />
  <CommandBar v-if="uiStore.commandBarOpen" />
  <SiloDialog v-if="uiStore.addGroupDialogOpen || uiStore.editGroupDialogOpen" />
  <AddTabDialog v-if="uiStore.addTabDialogOpen" />
  <EditTabDialog v-if="uiStore.editTabDialogOpen" />
  <ConfirmRemoveTabDialog v-if="uiStore.confirmRemoveTabDialogOpen" />
  <UpdateDialog v-if="uiStore.updateDialogOpen" />
  <DisplayMediaPickerDialog
    v-if="uiStore.displayMediaPick"
    :key="uiStore.displayMediaPick.requestId"
  />
</template>
