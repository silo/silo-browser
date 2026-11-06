import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppState, DisplayMediaPickRequest, GroupItem } from '../renderer/src/types'

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
  onOpenInNewTab: (callback: (url: string) => void) => void
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SiloApi
  }
}
