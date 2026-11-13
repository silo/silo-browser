import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppState, DisplayMediaPickRequest, GroupItem } from '../renderer/src/types'
import type { SyncPatch } from '../shared/sync-model'
import type { FolderSummary, JoinMode, RestorePointInfo, SyncStatus } from '../shared/sync-types'

export interface SiloApi {
  platform: string
  webviewPreloadPath: string
  getAppVersion: () => Promise<string>
  getState: () => Promise<AppState>
  saveGroups: (groups: GroupItem[]) => Promise<void>
  saveActiveTab: (tabId: string | null) => Promise<void>
  saveGroupsAndActiveTab: (groups: unknown, activeTabId: string | null) => Promise<void>
  saveSidebarState: (expanded: boolean) => Promise<void>
  saveOpenLinksInNewTab: (value: boolean) => Promise<void>
  saveAppearance: (appearance: {
    themeMode: string
    accentColor: string
    lightShade: string
    darkShade: string
    siloTint: string
  }) => Promise<void>
  saveSidebarLayout: (layout: string) => Promise<void>
  setChromeColors: (colors: { background: string; symbol: string }) => Promise<void>
  saveChildTabs: (childTabs: unknown[], activeChildTabId: string | null) => Promise<void>
  saveDefaultSleepAfterMinutes: (value: number) => Promise<void>
  saveConfirmCloseChildTabs: (value: boolean) => Promise<void>
  saveDefaultUserAgent: (value: string) => Promise<void>
  clearGroupSession: (groupId: string) => Promise<void>
  openExternal: (url: string) => Promise<void>
  exportConfig: () => Promise<string | null>
  importConfig: () => Promise<unknown | null>
  onOpenInNewTab: (callback: (url: string, sourceId?: number) => void) => void
  removeOpenInNewTabListener: () => void
  onUpdateDownloaded: (callback: (version: string) => void) => void
  removeUpdateDownloadedListener: () => void
  quitAndInstall: () => Promise<void>
  checkForUpdates: () => Promise<void>
  openReleasesPage: () => Promise<void>
  onUpdaterFallbackAvailable: (callback: (version: string) => void) => void
  removeUpdaterFallbackAvailableListener: () => void
  onUpdaterUpToDate: (callback: () => void) => void
  removeUpdaterUpToDateListener: () => void
  onCloseTab: (callback: () => void) => void
  removeCloseTabListener: () => void
  onNewTab: (callback: () => void) => void
  removeNewTabListener: () => void
  onCommandBar: (callback: () => void) => void
  removeCommandBarListener: () => void
  onGoToTab: (callback: (index: number) => void) => void
  removeGoToTabListener: () => void
  onNewGroup: (callback: () => void) => void
  removeNewGroupListener: () => void
  onOpenSettings: (callback: () => void) => void
  removeOpenSettingsListener: () => void
  onReloadTab: (callback: () => void) => void
  removeReloadTabListener: () => void
  onFind: (callback: () => void) => void
  removeFindListener: () => void
  onZoomIn: (callback: () => void) => void
  removeZoomInListener: () => void
  onZoomOut: (callback: () => void) => void
  removeZoomOutListener: () => void
  onZoomReset: (callback: () => void) => void
  removeZoomResetListener: () => void
  onPermissionRequest: (
    callback: (data: { requestId: number; permission: string; origin: string }) => void
  ) => void
  removePermissionRequestListener: () => void
  respondToPermission: (requestId: number, granted: boolean) => void
  onDisplayMediaPick: (callback: (data: DisplayMediaPickRequest) => void) => void
  removeDisplayMediaPickListener: () => void
  respondToDisplayMediaPick: (requestId: number, sourceId: string | null) => void
  setTabShortcuts: (shortcuts: { tabId: string; accelerator: string }[]) => Promise<void>
  onActivateTab: (callback: (tabId: string) => void) => void
  removeActivateTabListener: () => void
  onAddSidebarTab: (callback: () => void) => void
  removeAddSidebarTabListener: () => void
  onReopenClosedTab: (callback: () => void) => void
  removeReopenClosedTabListener: () => void
  onGoToSilo: (callback: (index: number) => void) => void
  removeGoToSiloListener: () => void
  onCycleTab: (callback: (step: number) => void) => void
  removeCycleTabListener: () => void
  onNavigate: (callback: (direction: 'back' | 'forward') => void) => void
  removeNavigateListener: () => void
  onHardReload: (callback: () => void) => void
  removeHardReloadListener: () => void
  onStopLoading: (callback: () => void) => void
  removeStopLoadingListener: () => void
  onPrint: (callback: () => void) => void
  removePrintListener: () => void
  onFindAgain: (callback: (direction: 1 | -1) => void) => void
  removeFindAgainListener: () => void
  onPageDevTools: (callback: () => void) => void
  removePageDevToolsListener: () => void

  // Folder sync
  syncReady: () => Promise<void>
  syncGetStatus: () => Promise<SyncStatus | null>
  /** Opens the folder picker. null = cancelled */
  syncChooseFolder: () => Promise<
    { ok: true; summary: FolderSummary } | { ok: false; error: string } | null
  >
  syncStart: (
    mode: JoinMode,
    localOnly: string[]
  ) => Promise<{ ok: true; status: SyncStatus } | { ok: false; error: string }>
  syncStop: () => Promise<SyncStatus | null>
  syncResolveRemoval: (apply: boolean) => Promise<SyncStatus | null>
  syncNow: () => Promise<SyncStatus | null>
  syncOpenFolder: () => Promise<void>
  syncListRestorePoints: () => Promise<RestorePointInfo[]>
  syncRestore: (id: string) => Promise<boolean>
  onSyncStatus: (callback: (status: SyncStatus) => void) => void
  removeSyncStatusListener: () => void
  onSyncPatch: (callback: (patch: SyncPatch) => void) => void
  removeSyncPatchListener: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SiloApi
  }
}
