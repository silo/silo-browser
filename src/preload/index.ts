import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  platform: process.platform as string,
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  getState: (): Promise<unknown> => ipcRenderer.invoke('store:get-state'),
  saveGroups: (groups: unknown): Promise<void> => ipcRenderer.invoke('store:save-groups', groups),
  saveActiveTab: (tabId: string | null): Promise<void> =>
    ipcRenderer.invoke('store:save-active-tab', tabId),
  saveGroupsAndActiveTab: (groups: unknown, activeTabId: string | null): Promise<void> =>
    ipcRenderer.invoke('store:save-groups-and-active-tab', groups, activeTabId),
  saveSidebarState: (expanded: boolean): Promise<void> =>
    ipcRenderer.invoke('store:save-sidebar-state', expanded),
  saveOpenLinksInNewTab: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('store:save-open-links-in-new-tab', value),
  saveChildTabs: (childTabs: unknown[], activeChildTabId: string | null): Promise<void> =>
    ipcRenderer.invoke('store:save-child-tabs', childTabs, activeChildTabId),
  clearGroupSession: (groupId: string): Promise<void> =>
    ipcRenderer.invoke('store:clear-group-session', groupId),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  exportConfig: (): Promise<string | null> => ipcRenderer.invoke('dialog:export-config'),
  importConfig: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:import-config'),
  onOpenInNewTab: (callback: (url: string) => void): void => {
    ipcRenderer.on('webview-context:open-in-new-tab', (_event, url: string) => {
      callback(url)
    })
  },
  removeOpenInNewTabListener: (): void => {
    ipcRenderer.removeAllListeners('webview-context:open-in-new-tab')
  },
  onUpdateDownloaded: (callback: (version: string) => void): void => {
    ipcRenderer.on('updater:update-downloaded', (_event, version: string) => {
      callback(version)
    })
  },
  removeUpdateDownloadedListener: (): void => {
    ipcRenderer.removeAllListeners('updater:update-downloaded')
  },
  quitAndInstall: (): Promise<void> => ipcRenderer.invoke('updater:quit-and-install'),
  checkForUpdates: (): Promise<void> => ipcRenderer.invoke('updater:check-for-updates'),
  openReleasesPage: (): Promise<void> => ipcRenderer.invoke('updater:open-releases-page'),
  onUpdaterFallbackAvailable: (callback: (version: string) => void): void => {
    ipcRenderer.on('updater:fallback-available', (_event, version: string) => {
      callback(version)
    })
  },
  removeUpdaterFallbackAvailableListener: (): void => {
    ipcRenderer.removeAllListeners('updater:fallback-available')
  },
  onUpdaterUpToDate: (callback: () => void): void => {
    ipcRenderer.on('updater:up-to-date', () => {
      callback()
    })
  },
  removeUpdaterUpToDateListener: (): void => {
    ipcRenderer.removeAllListeners('updater:up-to-date')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
