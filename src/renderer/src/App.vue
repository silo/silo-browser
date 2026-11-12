<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useRecentlyClosedStore } from '@renderer/stores/recently-closed'
import { useWebviewRegistry, type WebviewTag } from '@renderer/composables/useWebviewRegistry'
import { useAppTheme } from '@renderer/composables/useAppTheme'
import { navigateWebview } from '@renderer/composables/usePageMessages'
import { isMac } from '@renderer/utils/platform'
import type { TabItem } from '@renderer/types'
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
const ConfirmDeleteSiloDialog = defineAsyncComponent(
  () => import('@renderer/components/dialogs/ConfirmDeleteSiloDialog.vue')
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
const recentlyClosed = useRecentlyClosedStore()
const webviewRegistry = useWebviewRegistry()

useAppTheme()

// Custom tab shortcuts are registered as app-menu accelerators by the main process, so they
// fire even while a page has focus. Re-sent only when the list actually changes.
const tabShortcuts = computed(() =>
  groupsStore.allTabsFlat
    .filter((t) => t.shortcut)
    .map((t) => ({ tabId: t.id, accelerator: t.shortcut as string }))
)
watch(
  () => JSON.stringify(tabShortcuts.value),
  () => {
    if (groupsStore.loaded) window.api.setTabShortcuts(tabShortcuts.value)
  }
)

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
  window.api.setTabShortcuts(tabShortcuts.value)
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('keyup', handleKeyup)
  window.addEventListener('blur', handleBlur)

  // Pop-up tabs: window.open / target=_blank links and "Open Link in New Tab"
  window.api.onOpenInNewTab((url: string, sourceId?: number) => openPopup(url, sourceId))

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
  window.api.onReopenClosedTab(() => recentlyClosed.reopenLast())
  window.api.onActivateTab((tabId: string) => activateFromShortcut(tabId))
  window.api.onGoToSilo((index: number) => goToSilo(index))
  window.api.onCycleTab((step: number) => cycleTab(step))
  window.api.onNavigate((direction) => navigate(direction))
  window.api.onHardReload(() => getActiveWebview()?.reloadIgnoringCache())
  window.api.onStopLoading(() => getActiveWebview()?.stop())
  window.api.onPrint(() => getActiveWebview()?.print())
  window.api.onFindAgain((direction) => uiStore.findAgain(direction))
  window.api.onPageDevTools(() => togglePageDevTools())
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
  window.api.removeReopenClosedTabListener()
  window.api.removeActivateTabListener()
  window.api.removeGoToSiloListener()
  window.api.removeCycleTabListener()
  window.api.removeNavigateListener()
  window.api.removeHardReloadListener()
  window.api.removeStopLoadingListener()
  window.api.removePrintListener()
  window.api.removeFindAgainListener()
  window.api.removePageDevToolsListener()
  window.removeEventListener('keyup', handleKeyup)
  window.removeEventListener('blur', handleBlur)
})

function getActiveWebview(): WebviewTag | null {
  return webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
}

/**
 * Opens a pop-up tab under the sidebar tab whose page opened it (`sourceId` = that page's
 * webContents id), remembering the opener so closing it returns there. A pop-up opened by a
 * tab in the background stays with that tab instead of taking over the one you're looking at.
 */
function openPopup(url: string, sourceId?: number): void {
  const source = typeof sourceId === 'number' ? webviewRegistry.findByWebContentsId(sourceId) : null
  let parent: TabItem | null = null
  let openerId: string | null = null
  if (source?.kind === 'main') {
    parent = groupsStore.findTab(source.tabId)
  } else if (source?.kind === 'child') {
    const child = topbarStore.findChild(source.childId)
    if (child) {
      parent = groupsStore.findTab(child.parentTabId)
      openerId = child.id
    }
  }
  if (!parent) {
    // Unknown source: the page you're looking at
    parent = groupsStore.activeTab
    openerId = topbarStore.activeTopbarTabId
  }
  if (!parent) return
  topbarStore.addChildTab(parent.id, parent.groupId, url, {
    openerId,
    activate: parent.id === groupsStore.activeTabId
  })
}

// After closing the pop-up you were on, give keyboard focus to the page now shown (like Chrome)
watch(
  () => topbarStore.activeTopbarTabId,
  (now, before) => {
    if (before && before !== now && !topbarStore.findChild(before)) {
      nextTick(() => getActiveWebview()?.focus())
    }
  }
)

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
  const target = groupsStore.currentGroup
  if (target) uiStore.openAddTabDialog(target.id)
}

// Open-only (never toggles): the menu accelerator and the keydown fallback may both fire
function openCommandBar(): void {
  if (groupsStore.groups.length === 0) return
  uiStore.openCommandBar()
}

/** ⌘1–8: Nth tab of the current silo; ⌘9: its last tab (like Chrome). */
function goToTab(index: number): void {
  const group = groupsStore.currentGroup
  if (!group) return
  const tabs = groupsStore.sortedTabsOf(group)
  const tab = index >= 8 ? tabs[tabs.length - 1] : tabs[index]
  if (tab) activateFromShortcut(tab.id)
}

/** ⌃1–9 (Alt+1–9 on Windows/Linux): Nth silo, back on the tab last used there. */
function goToSilo(index: number): void {
  const group = groupsStore.sortedGroups[index]
  if (group) {
    uiStore.closeSettingsPage()
    groupsStore.openSilo(group.id)
  }
}

/** Next / previous tab in the current silo, wrapping around. */
function cycleTab(step: number): void {
  const group = groupsStore.currentGroup
  if (!group) return
  const tabs = groupsStore.sortedTabsOf(group)
  if (tabs.length === 0) return
  const current = tabs.findIndex((t) => t.id === groupsStore.activeTabId)
  const next =
    current === -1 ? (step > 0 ? 0 : tabs.length - 1) : (current + step + tabs.length) % tabs.length
  activateFromShortcut(tabs[next].id)
}

function activateFromShortcut(tabId: string): void {
  if (!groupsStore.findTab(tabId)) return
  groupsStore.activateTab(tabId)
  uiStore.hideContextMenu()
}

function navigate(direction: 'back' | 'forward'): void {
  navigateWebview(getActiveWebview(), direction)
}

function togglePageDevTools(): void {
  const wv = getActiveWebview()
  if (!wv) return
  if (wv.isDevToolsOpened()) wv.closeDevTools()
  else wv.openDevTools()
}

const activeIsLoading = computed(() => {
  if (topbarStore.isChildActive) {
    return !!topbarStore.findChild(topbarStore.activeTopbarTabId!)?.isLoading
  }
  return !!groupsStore.activeTab?.isLoading
})

function isTextField(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}

const MOD_KEY = isMac ? 'Meta' : 'Control'

function handleKeyup(e: KeyboardEvent): void {
  if (e.key === MOD_KEY) uiStore.setModifierDown(false)
}

function handleBlur(): void {
  uiStore.setModifierDown(false)
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
  // Holding ⌘ (Ctrl) shows the tab shortcut hints; any other key cancels them
  if (e.key === MOD_KEY) {
    if (!e.repeat) uiStore.setModifierDown(true)
    return
  }
  uiStore.setModifierDown(false)

  const mod = isMac ? e.metaKey : e.ctrlKey

  // Ctrl/Cmd+A — select all within the active page, not the whole app
  if (mod && e.key === 'a') {
    const active = document.activeElement
    if (!(active instanceof HTMLInputElement) && !(active instanceof HTMLTextAreaElement)) {
      e.preventDefault()
      getActiveWebview()?.selectAll()
    }
    return
  }

  if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
    e.preventDefault()
    recentlyClosed.reopenLast()
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

  // ⌃1–9 on macOS, Alt+1–9 elsewhere: go to silo N
  const siloChord = isMac
    ? e.ctrlKey && !e.metaKey && !e.altKey
    : e.altKey && !e.ctrlKey && !e.metaKey
  if (siloChord && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
    e.preventDefault()
    goToSilo(parseInt(e.code.slice(5)) - 1)
    return
  }

  if (mod && !e.altKey && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
    e.preventDefault()
    goToTab(parseInt(e.code.slice(5)) - 1)
    return
  }

  // Back / forward: ⌘← ⌘→ on macOS, Alt+← Alt+→ elsewhere (not while typing)
  const navChord = isMac
    ? e.metaKey && !e.altKey && !e.ctrlKey && !e.shiftKey
    : e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey
  if (
    navChord &&
    (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
    !isTextField(document.activeElement)
  ) {
    e.preventDefault()
    navigate(e.key === 'ArrowLeft' ? 'back' : 'forward')
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
    if (uiStore.confirmDeleteSiloId) return uiStore.closeConfirmDeleteSilo()
    if (uiStore.updateDialogOpen) return uiStore.closeUpdateDialog()
    if (uiStore.findBarOpen) return uiStore.closeFindBar()
    if (uiStore.settingsPageOpen) return uiStore.closeSettingsPage()
    // Nothing else open: Esc stops a loading page, like Chrome
    if (activeIsLoading.value) return getActiveWebview()?.stop()
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
  <ConfirmDeleteSiloDialog v-if="uiStore.confirmDeleteSiloId" />
  <UpdateDialog v-if="uiStore.updateDialogOpen" />
  <DisplayMediaPickerDialog
    v-if="uiStore.displayMediaPick"
    :key="uiStore.displayMediaPick.requestId"
  />
</template>
