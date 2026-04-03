import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AccentColor, ContextMenuEntry, SurfaceColor, ThemeMode } from '@renderer/types'

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
  const defaultSleepAfterMinutes = ref(0)

  function setOpenLinksInNewTab(value: boolean): void {
    openLinksInNewTab.value = value
    window.api.saveOpenLinksInNewTab(value)
  }

  function setDefaultSleepAfterMinutes(value: number): void {
    defaultSleepAfterMinutes.value = value
    window.api.saveDefaultSleepAfterMinutes(value)
  }

  // --- Theme ---
  const themeMode = ref<ThemeMode>('dark')
  const accentColor = ref<AccentColor>('gray')
  const surfaceColor = ref<string>('charcoal')

  const ACCENT_CONFIG: Record<AccentColor, { hue: number; saturation: number }> = {
    blue: { hue: 220, saturation: 90 },
    green: { hue: 150, saturation: 70 },
    amber: { hue: 38, saturation: 92 },
    red: { hue: 0, saturation: 85 },
    violet: { hue: 270, saturation: 75 },
    pink: { hue: 330, saturation: 80 },
    cyan: { hue: 190, saturation: 85 },
    orange: { hue: 25, saturation: 92 },
    gray: { hue: 220, saturation: 8 }
  }

  const SURFACE_COLOR_CONFIG: Record<SurfaceColor, { dark: string; light: string }> = {
    neutral: { dark: '#1f2937', light: '#f3f4f6' },
    charcoal: { dark: '#141414', light: '#f5f5f5' },
    slate: { dark: '#1a2332', light: '#f0f4f8' },
    navy: { dark: '#1a1d33', light: '#edf0ff' },
    forest: { dark: '#1a2920', light: '#edf7f0' },
    wine: { dark: '#2a1a1e', light: '#fbf0f0' },
    plum: { dark: '#231a2e', light: '#f5f0fa' },
    teal: { dark: '#1a2827', light: '#edf7f6' },
    earth: { dark: '#2a2318', light: '#faf6ed' }
  }

  function hexToLuminance(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const toLinear = (c: number): number =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
  }

  function mixHex(base: string, target: string, amount: number): string {
    const p = (h: string): number[] => [
      parseInt(h.slice(1, 3), 16),
      parseInt(h.slice(3, 5), 16),
      parseInt(h.slice(5, 7), 16)
    ]
    const [r1, g1, b1] = p(base)
    const [r2, g2, b2] = p(target)
    const m = (a: number, b: number): number => Math.round(a + (b - a) * amount)
    return (
      '#' +
      [m(r1, r2), m(g1, g2), m(b1, b2)].map((c) => c.toString(16).padStart(2, '0')).join('')
    )
  }

  const effectiveTheme = computed<'dark' | 'light'>(() => {
    if (themeMode.value === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    return themeMode.value
  })

  const CHROME_VARS = [
    '--chrome-fg-primary',
    '--chrome-fg-secondary',
    '--chrome-fg-muted',
    '--chrome-fg-faint',
    '--chrome-border',
    '--chrome-hover',
    '--chrome-active'
  ]

  function applyTheme(): void {
    document.documentElement.setAttribute('data-theme', effectiveTheme.value)
    const config = ACCENT_CONFIG[accentColor.value]
    document.documentElement.style.setProperty('--accent-hue', String(config.hue))
    document.documentElement.style.setProperty('--accent-saturation', `${config.saturation}%`)

    const sv = surfaceColor.value
    let surfaceHex: string | null = null
    if (sv in SURFACE_COLOR_CONFIG) {
      const sc = SURFACE_COLOR_CONFIG[sv as SurfaceColor]
      surfaceHex = sc[effectiveTheme.value]
      document.documentElement.style.setProperty('--surface-chrome', surfaceHex)
    } else {
      surfaceHex = sv
      document.documentElement.style.setProperty('--surface-chrome', surfaceHex)
    }

    // Set chrome-specific text/border/hover colors based on surface luminance
    if (!surfaceHex) {
      CHROME_VARS.forEach((v) => document.documentElement.style.removeProperty(v))
    } else {
      const lum = hexToLuminance(surfaceHex)
      const isLight = lum > 0.179
      const contrast = isLight ? '#000000' : '#ffffff'

      document.documentElement.style.setProperty(
        '--chrome-fg-primary',
        isLight ? '#111827' : '#ffffff'
      )
      document.documentElement.style.setProperty(
        '--chrome-fg-secondary',
        isLight ? '#374151' : '#f3f4f6'
      )
      document.documentElement.style.setProperty(
        '--chrome-fg-muted',
        isLight ? '#6b7280' : '#d1d5db'
      )
      document.documentElement.style.setProperty(
        '--chrome-fg-faint',
        isLight ? '#9ca3af' : '#9ca3af'
      )
      document.documentElement.style.setProperty('--chrome-border', mixHex(surfaceHex, contrast, 0.12))
      document.documentElement.style.setProperty('--chrome-hover', mixHex(surfaceHex, contrast, 0.12))
      document.documentElement.style.setProperty('--chrome-active', mixHex(surfaceHex, contrast, 0.2))
    }
  }

  function persistTheme(): Promise<void> {
    return window.api.saveTheme(themeMode.value, accentColor.value, surfaceColor.value)
  }

  async function setThemeMode(mode: ThemeMode): Promise<void> {
    themeMode.value = mode
    // Must await IPC so nativeTheme.themeSource is updated before we read matchMedia
    await persistTheme()
    applyTheme()
  }

  function setAccentColor(color: AccentColor): void {
    accentColor.value = color
    applyTheme()
    persistTheme()
  }

  function setSurfaceColor(color: string): void {
    surfaceColor.value = color
    applyTheme()
    persistTheme()
  }

  // Listen for OS theme changes when in 'system' mode
  if (typeof window !== 'undefined') {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (themeMode.value === 'system') applyTheme()
    })
  }

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

  // --- URL bar modal ---
  const urlBarOpen = ref(false)
  function openUrlBar(): void {
    urlBarOpen.value = true
  }
  function closeUrlBar(): void {
    urlBarOpen.value = false
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

  async function loadFromDisk(preloaded?: unknown): Promise<void> {
    const state = (preloaded ?? await window.api.getState()) as Record<string, unknown>
    sidebarExpanded.value = (state.sidebarExpanded as boolean | undefined) ?? true
    openLinksInNewTab.value = (state.openLinksInNewTab as boolean | undefined) ?? true
    defaultSleepAfterMinutes.value = (state.defaultSleepAfterMinutes as number | undefined) ?? 0
    themeMode.value = (state.themeMode as ThemeMode | undefined) ?? 'dark'
    accentColor.value = (state.accentColor as AccentColor | undefined) ?? 'gray'
    surfaceColor.value = (state.surfaceColor as string | undefined) ?? 'charcoal'
    applyTheme()
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
    hoveredLinkUrl,
    setHoveredLinkUrl,
    clearHoveredLinkUrl,
    confirmRemoveTabDialogOpen,
    confirmRemoveTabTargetId,
    confirmRemoveTabIsChild,
    openConfirmRemoveTabDialog,
    closeConfirmRemoveTabDialog,
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
    defaultSleepAfterMinutes,
    setDefaultSleepAfterMinutes,
    permissionRequest,
    showPermissionRequest,
    respondToPermission,
    urlBarOpen,
    openUrlBar,
    closeUrlBar,
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
    surfaceColor,
    effectiveTheme,
    setThemeMode,
    setAccentColor,
    setSurfaceColor,
    applyTheme,
    loadFromDisk
  }
})
