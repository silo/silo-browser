import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  AccentColor,
  ContextMenuEntry,
  DarkShade,
  DisplayMediaPickRequest,
  LightShade,
  SidebarLayout,
  SiloTint,
  ThemeMode
} from '@renderer/types'

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

  // 'sidebar' = one sidebar with every silo; 'rail' = silo rail + the selected silo's tabs
  const sidebarLayout = ref<SidebarLayout>('sidebar')
  function setSidebarLayout(layout: SidebarLayout): void {
    sidebarLayout.value = layout
    window.api.saveSidebarLayout(layout)
  }
  // Rail layout: which silo's tab list is shown when it has no active tab (e.g. an empty silo)
  const railSiloId = ref<string | null>(null)
  function setRailSilo(groupId: string | null): void {
    railSiloId.value = groupId
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

  // --- Link hover status bar ---
  const hoveredLinkUrl = ref<string | null>(null)
  function setHoveredLinkUrl(url: string): void {
    hoveredLinkUrl.value = url
  }
  function clearHoveredLinkUrl(): void {
    hoveredLinkUrl.value = null
  }

  // --- Confirm remove tab dialog ---
  const confirmRemoveTabDialogOpen = ref(false)
  const confirmRemoveTabTargetId = ref<string | null>(null)
  const confirmRemoveTabIsChild = ref(false)
  function openConfirmRemoveTabDialog(tabId: string, isChild = false): void {
    confirmRemoveTabTargetId.value = tabId
    confirmRemoveTabIsChild.value = isChild
    confirmRemoveTabDialogOpen.value = true
  }
  function closeConfirmRemoveTabDialog(): void {
    confirmRemoveTabDialogOpen.value = false
    confirmRemoveTabTargetId.value = null
    confirmRemoveTabIsChild.value = false
  }

  // --- Confirm delete silo dialog (deleting wipes the silo's logins) ---
  const confirmDeleteSiloId = ref<string | null>(null)
  function openConfirmDeleteSilo(groupId: string): void {
    hideContextMenu()
    confirmDeleteSiloId.value = groupId
  }
  function closeConfirmDeleteSilo(): void {
    confirmDeleteSiloId.value = null
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

  // --- Sidebar tooltip ---
  const sidebarTooltipText = ref('')
  const sidebarTooltipX = ref(0)
  const sidebarTooltipY = ref(0)
  const sidebarTooltipVisible = ref(false)
  const sidebarTooltipSub = ref('')
  function showSidebarTooltip(text: string, x: number, y: number, sub = ''): void {
    sidebarTooltipText.value = text
    sidebarTooltipSub.value = sub
    sidebarTooltipX.value = x
    sidebarTooltipY.value = y
    sidebarTooltipVisible.value = true
  }
  function hideSidebarTooltip(): void {
    sidebarTooltipVisible.value = false
  }

  // --- App settings ---
  const openLinksInNewTab = ref(true)
  const defaultSleepAfterMinutes = ref(60)
  const confirmCloseChildTabs = ref(false)
  const defaultUserAgent = ref('')

  function setOpenLinksInNewTab(value: boolean): void {
    openLinksInNewTab.value = value
    window.api.saveOpenLinksInNewTab(value)
  }

  function setDefaultSleepAfterMinutes(value: number): void {
    defaultSleepAfterMinutes.value = value
    window.api.saveDefaultSleepAfterMinutes(value)
  }

  function setConfirmCloseChildTabs(value: boolean): void {
    confirmCloseChildTabs.value = value
    window.api.saveConfirmCloseChildTabs(value)
  }

  function setDefaultUserAgent(value: string): void {
    defaultUserAgent.value = value
    window.api.saveDefaultUserAgent(value)
  }

  // --- Theme ---
  const themeMode = ref<ThemeMode>('system')
  const accentColor = ref<AccentColor>('black')
  const lightShade = ref<LightShade>('stone')
  const darkShade = ref<DarkShade>('pitch')
  const siloTint = ref<SiloTint>('subtle')
  // Temporarily tint the window with a color that isn't a silo yet (Welcome screen color pick)
  const tintPreviewColor = ref<string | null>(null)

  const systemPrefersDark = ref(
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
  )
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      systemPrefersDark.value = e.matches
    })
  }

  const effectiveTheme = computed<'dark' | 'light'>(() => {
    if (themeMode.value === 'system') return systemPrefersDark.value ? 'dark' : 'light'
    return themeMode.value
  })

  function persistAppearance(): Promise<void> {
    return window.api.saveAppearance({
      themeMode: themeMode.value,
      accentColor: accentColor.value,
      lightShade: lightShade.value,
      darkShade: darkShade.value,
      siloTint: siloTint.value
    })
  }

  function setThemeMode(mode: ThemeMode): Promise<void> {
    themeMode.value = mode
    return persistAppearance()
  }

  function setAccentColor(color: AccentColor): void {
    accentColor.value = color
    persistAppearance()
  }

  function setLightShade(shade: LightShade): void {
    lightShade.value = shade
    persistAppearance()
  }

  function setDarkShade(shade: DarkShade): void {
    darkShade.value = shade
    persistAppearance()
  }

  function setSiloTint(tint: SiloTint): void {
    siloTint.value = tint
    persistAppearance()
  }

  function setTintPreviewColor(color: string | null): void {
    tintPreviewColor.value = color
  }

  // Welcome screen: the first silo being named, previewed live in the sidebar
  const welcomeDraftName = ref('')

  // --- Permission request banner ---
  const permissionRequest = ref<{
    requestId: number
    permission: string
    origin: string
  } | null>(null)

  function showPermissionRequest(data: {
    requestId: number
    permission: string
    origin: string
  }): void {
    // Deny any pending request before showing a new one
    if (permissionRequest.value) {
      window.api.respondToPermission(permissionRequest.value.requestId, false)
    }
    permissionRequest.value = data
  }

  function respondToPermission(granted: boolean): void {
    if (permissionRequest.value) {
      window.api.respondToPermission(permissionRequest.value.requestId, granted)
      permissionRequest.value = null
    }
  }

  // --- Screen sharing source picker (Windows, Linux, macOS < 15) ---
  const displayMediaPick = ref<DisplayMediaPickRequest | null>(null)

  function showDisplayMediaPick(data: DisplayMediaPickRequest): void {
    // Cancel any pending pick before showing a new one
    if (displayMediaPick.value) {
      window.api.respondToDisplayMediaPick(displayMediaPick.value.requestId, null)
    }
    displayMediaPick.value = data
  }

  function respondToDisplayMediaPick(sourceId: string | null): void {
    if (displayMediaPick.value) {
      window.api.respondToDisplayMediaPick(displayMediaPick.value.requestId, sourceId)
      displayMediaPick.value = null
    }
  }

  // --- Find bar ---
  const findBarOpen = ref(false)
  // Last search, restored when the bar reopens (like Chrome)
  const lastFindText = ref('')
  // ⌘G / ⌘⇧G from the menu; FindBar watches `seq`
  const findCommand = ref<{ dir: 1 | -1; seq: number } | null>(null)
  let findSeq = 0
  function openFindBar(): void {
    findBarOpen.value = true
  }
  function closeFindBar(): void {
    findBarOpen.value = false
  }
  function findAgain(dir: 1 | -1): void {
    findBarOpen.value = true
    findCommand.value = { dir, seq: ++findSeq }
  }

  // --- Shortcut hints: shown on every tab while ⌘ (Ctrl) is held for a moment ---
  const modifierHeld = ref(false)
  let modifierTimer: ReturnType<typeof setTimeout> | null = null
  function setModifierDown(down: boolean): void {
    if (modifierTimer) clearTimeout(modifierTimer)
    modifierTimer = null
    if (down) modifierTimer = setTimeout(() => (modifierHeld.value = true), 400)
    else modifierHeld.value = false
  }

  // --- Command bar (⌘L; ⌘T opens it to start a new tab) ---
  const commandBarOpen = ref(false)
  /** 'address': edit the current address (⌘L). 'new-tab': open what you type in a new tab (⌘T). */
  const commandBarMode = ref<'address' | 'new-tab'>('address')
  function openCommandBar(mode: 'address' | 'new-tab' = 'address'): void {
    hideContextMenu()
    commandBarMode.value = mode
    commandBarOpen.value = true
  }
  function closeCommandBar(): void {
    commandBarOpen.value = false
  }

  // --- Settings page ---
  const settingsPageOpen = ref(false)
  function openSettingsPage(): void {
    settingsPageOpen.value = true
  }
  function closeSettingsPage(): void {
    settingsPageOpen.value = false
  }

  // --- Update state ---
  const updaterUpToDate = ref(false)
  function setUpdaterUpToDate(): void {
    updaterUpToDate.value = true
  }

  // --- Update dialog ---
  const updateDialogOpen = ref(false)
  const updateVersion = ref<string | null>(null)
  const fallbackVersion = ref<string | null>(null)
  function showUpdateDialog(version: string): void {
    updateVersion.value = version
    fallbackVersion.value = null
    updateDialogOpen.value = true
  }
  function showFallbackUpdateDialog(version: string): void {
    updateVersion.value = version
    fallbackVersion.value = version
    updateDialogOpen.value = true
  }
  function closeUpdateDialog(): void {
    updateDialogOpen.value = false
  }

  /** Settings changed on another computer (folder sync; the main process already saved them). */
  function applySyncSettings(settings: Record<string, unknown>): void {
    const s = settings
    if (typeof s.openLinksInNewTab === 'boolean') openLinksInNewTab.value = s.openLinksInNewTab
    if (typeof s.defaultSleepAfterMinutes === 'number')
      defaultSleepAfterMinutes.value = s.defaultSleepAfterMinutes
    if (typeof s.confirmCloseChildTabs === 'boolean')
      confirmCloseChildTabs.value = s.confirmCloseChildTabs
    if (typeof s.defaultUserAgent === 'string') defaultUserAgent.value = s.defaultUserAgent
    if (typeof s.themeMode === 'string') themeMode.value = s.themeMode as ThemeMode
    if (typeof s.accentColor === 'string') accentColor.value = s.accentColor as AccentColor
    if (typeof s.lightShade === 'string') lightShade.value = s.lightShade as LightShade
    if (typeof s.darkShade === 'string') darkShade.value = s.darkShade as DarkShade
    if (typeof s.siloTint === 'string') siloTint.value = s.siloTint as SiloTint
  }

  async function loadFromDisk(preloaded?: unknown): Promise<void> {
    const state = (preloaded ?? (await window.api.getState())) as Record<string, unknown>
    sidebarExpanded.value = (state.sidebarExpanded as boolean | undefined) ?? true
    openLinksInNewTab.value = (state.openLinksInNewTab as boolean | undefined) ?? true
    defaultSleepAfterMinutes.value = (state.defaultSleepAfterMinutes as number | undefined) ?? 60
    confirmCloseChildTabs.value = (state.confirmCloseChildTabs as boolean | undefined) ?? false
    defaultUserAgent.value = (state.defaultUserAgent as string | undefined) ?? ''
    sidebarLayout.value = (state.sidebarLayout as SidebarLayout | undefined) ?? 'sidebar'
    themeMode.value = (state.themeMode as ThemeMode | undefined) ?? 'system'
    accentColor.value = (state.accentColor as AccentColor | undefined) ?? 'black'
    lightShade.value = (state.lightShade as LightShade | undefined) ?? 'stone'
    darkShade.value = (state.darkShade as DarkShade | undefined) ?? 'pitch'
    siloTint.value = (state.siloTint as SiloTint | undefined) ?? 'subtle'
  }

  return {
    sidebarExpanded,
    sidebarLayout,
    setSidebarLayout,
    railSiloId,
    setRailSilo,
    addGroupDialogOpen,
    addTabDialogOpen,
    addTabTargetGroupId,
    editGroupDialogOpen,
    editGroupTargetId,
    editTabDialogOpen,
    editTabTargetId,
    hoveredLinkUrl,
    setHoveredLinkUrl,
    clearHoveredLinkUrl,
    confirmRemoveTabDialogOpen,
    confirmRemoveTabTargetId,
    confirmRemoveTabIsChild,
    openConfirmRemoveTabDialog,
    closeConfirmRemoveTabDialog,
    confirmDeleteSiloId,
    openConfirmDeleteSilo,
    closeConfirmDeleteSilo,
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
    sidebarTooltipText,
    sidebarTooltipSub,
    sidebarTooltipX,
    sidebarTooltipY,
    sidebarTooltipVisible,
    showSidebarTooltip,
    hideSidebarTooltip,
    openLinksInNewTab,
    setOpenLinksInNewTab,
    defaultSleepAfterMinutes,
    setDefaultSleepAfterMinutes,
    confirmCloseChildTabs,
    setConfirmCloseChildTabs,
    defaultUserAgent,
    setDefaultUserAgent,
    permissionRequest,
    showPermissionRequest,
    respondToPermission,
    displayMediaPick,
    showDisplayMediaPick,
    respondToDisplayMediaPick,
    findBarOpen,
    lastFindText,
    findCommand,
    openFindBar,
    closeFindBar,
    findAgain,
    modifierHeld,
    setModifierDown,
    commandBarOpen,
    commandBarMode,
    openCommandBar,
    closeCommandBar,
    settingsPageOpen,
    openSettingsPage,
    closeSettingsPage,
    updaterUpToDate,
    setUpdaterUpToDate,
    updateDialogOpen,
    updateVersion,
    fallbackVersion,
    showUpdateDialog,
    showFallbackUpdateDialog,
    closeUpdateDialog,
    themeMode,
    accentColor,
    lightShade,
    darkShade,
    siloTint,
    tintPreviewColor,
    welcomeDraftName,
    effectiveTheme,
    setThemeMode,
    setAccentColor,
    setLightShade,
    setDarkShade,
    setSiloTint,
    setTintPreviewColor,
    applySyncSettings,
    loadFromDisk
  }
})
