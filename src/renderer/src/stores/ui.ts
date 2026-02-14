import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ContextMenuEntry } from '@renderer/types'

export const useUiStore = defineStore('ui', () => {
  const sidebarExpanded = ref(true)

  // Dialog state
  const addGroupDialogOpen = ref(false)
  const addTabDialogOpen = ref(false)
  const addTabTargetGroupId = ref<string | null>(null)
  const editGroupDialogOpen = ref(false)
  const editGroupTargetId = ref<string | null>(null)
  const editTabDialogOpen = ref(false)
  const editTabTargetId = ref<string | null>(null)

  // Context menu state
  const contextMenuVisible = ref(false)
  const contextMenuX = ref(0)
  const contextMenuY = ref(0)
  const contextMenuItems = ref<ContextMenuEntry[]>([])

  function toggleSidebar(): void {
    sidebarExpanded.value = !sidebarExpanded.value
    window.api.saveSidebarState(sidebarExpanded.value)
  }

  // --- Add dialogs ---
  function openAddGroupDialog(): void {
    addGroupDialogOpen.value = true
  }
  function closeAddGroupDialog(): void {
    addGroupDialogOpen.value = false
  }
  function openAddTabDialog(groupId: string): void {
    addTabTargetGroupId.value = groupId
    addTabDialogOpen.value = true
  }
  function closeAddTabDialog(): void {
    addTabDialogOpen.value = false
    addTabTargetGroupId.value = null
  }

  // --- Edit dialogs ---
  function openEditGroupDialog(groupId: string): void {
    editGroupTargetId.value = groupId
    editGroupDialogOpen.value = true
  }
  function closeEditGroupDialog(): void {
    editGroupDialogOpen.value = false
    editGroupTargetId.value = null
  }
  function openEditTabDialog(tabId: string): void {
    editTabTargetId.value = tabId
    editTabDialogOpen.value = true
  }
  function closeEditTabDialog(): void {
    editTabDialogOpen.value = false
    editTabTargetId.value = null
  }

  // --- Context menu ---
  function showContextMenu(x: number, y: number, items: ContextMenuEntry[]): void {
    contextMenuX.value = x
    contextMenuY.value = y
    contextMenuItems.value = items
    contextMenuVisible.value = true
  }
  function hideContextMenu(): void {
    contextMenuVisible.value = false
    contextMenuItems.value = []
  }

  // --- App settings ---
  const openLinksInNewTab = ref(true)

  function setOpenLinksInNewTab(value: boolean): void {
    openLinksInNewTab.value = value
    window.api.saveOpenLinksInNewTab(value)
  }

  // --- URL bar modal ---
  const urlBarOpen = ref(false)
  function openUrlBar(): void {
    urlBarOpen.value = true
  }
  function closeUrlBar(): void {
    urlBarOpen.value = false
  }

  // --- Settings dialog ---
  const settingsDialogOpen = ref(false)
  function openSettingsDialog(): void {
    settingsDialogOpen.value = true
  }
  function closeSettingsDialog(): void {
    settingsDialogOpen.value = false
  }

  async function loadFromDisk(): Promise<void> {
    const state = await window.api.getState()
    sidebarExpanded.value = state.sidebarExpanded ?? true
    openLinksInNewTab.value = state.openLinksInNewTab ?? true
  }

  return {
    sidebarExpanded,
    addGroupDialogOpen,
    addTabDialogOpen,
    addTabTargetGroupId,
    editGroupDialogOpen,
    editGroupTargetId,
    editTabDialogOpen,
    editTabTargetId,
    contextMenuVisible,
    contextMenuX,
    contextMenuY,
    contextMenuItems,
    toggleSidebar,
    openAddGroupDialog,
    closeAddGroupDialog,
    openAddTabDialog,
    closeAddTabDialog,
    openEditGroupDialog,
    closeEditGroupDialog,
    openEditTabDialog,
    closeEditTabDialog,
    showContextMenu,
    hideContextMenu,
    openLinksInNewTab,
    setOpenLinksInNewTab,
    urlBarOpen,
    openUrlBar,
    closeUrlBar,
    settingsDialogOpen,
    openSettingsDialog,
    closeSettingsDialog,
    loadFromDisk
  }
})
