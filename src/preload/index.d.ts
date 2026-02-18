import { ElectronAPI } from '@electron-toolkit/preload'
import type { AppState, GroupItem } from '../renderer/src/types'

export interface SiloApi {
  platform: string
  getAppVersion: () => Promise<string>
  getState: () => Promise<AppState>
  saveGroups: (groups: GroupItem[]) => Promise<void>
  saveActiveTab: (tabId: string | null) => Promise<void>
  saveGroupsAndActiveTab: (groups: unknown, activeTabId: string | null) => Promise<void>
  saveSidebarState: (expanded: boolean) => Promise<void>
  saveOpenLinksInNewTab: (value: boolean) => Promise<void>
  saveChildTabs: (childTabs: unknown[], activeChildTabId: string | null) => Promise<void>
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
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: SiloApi
  }
}
