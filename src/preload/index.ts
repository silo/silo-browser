import { contextBridge, ipcRenderer } from 'electron'
import { join } from 'path'
import { electronAPI } from '@electron-toolkit/preload'

interface DisplayMediaPickRequest {
  requestId: number
  origin: string
  sources: { id: string; name: string; thumbnail: string; isScreen: boolean }[]
}

/** Subscribes to a main → renderer channel (menu accelerators etc.). */
function listen<T extends unknown[]>(channel: string, callback: (...args: T) => void): void {
  ipcRenderer.on(channel, (_event, ...args) => callback(...(args as T)))
}

function unlisten(channel: string): void {
  ipcRenderer.removeAllListeners(channel)
}

const api = {
  platform: process.platform as string,
  webviewPreloadPath: `file://${join(__dirname, 'webview.js')}`,
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
  saveAppearance: (appearance: {
    themeMode: string
    accentColor: string
    lightShade: string
    darkShade: string
    siloTint: string
  }): Promise<void> => ipcRenderer.invoke('store:save-appearance', appearance),
  saveSidebarLayout: (layout: string): Promise<void> =>
    ipcRenderer.invoke('store:save-sidebar-layout', layout),
  setChromeColors: (colors: { background: string; symbol: string }): Promise<void> =>
    ipcRenderer.invoke('window:set-chrome-colors', colors),
  saveChildTabs: (childTabs: unknown[], activeChildTabId: string | null): Promise<void> =>
    ipcRenderer.invoke('store:save-child-tabs', childTabs, activeChildTabId),
  saveDefaultSleepAfterMinutes: (value: number): Promise<void> =>
    ipcRenderer.invoke('store:save-default-sleep-after-minutes', value),
  saveConfirmCloseChildTabs: (value: boolean): Promise<void> =>
    ipcRenderer.invoke('store:save-confirm-close-child-tabs', value),
  saveDefaultUserAgent: (value: string): Promise<void> =>
    ipcRenderer.invoke('store:save-default-user-agent', value),
  clearGroupSession: (groupId: string): Promise<void> =>
    ipcRenderer.invoke('store:clear-group-session', groupId),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:open-external', url),
  exportConfig: (): Promise<string | null> => ipcRenderer.invoke('dialog:export-config'),
  importConfig: (): Promise<unknown | null> => ipcRenderer.invoke('dialog:import-config'),
  // sourceId: webContents id of the page that opened it (to attach the pop-up to that tab)
  onOpenInNewTab: (callback: (url: string, sourceId?: number) => void): void => {
    ipcRenderer.on('webview-context:open-in-new-tab', (_event, url: string, sourceId?: number) => {
      callback(url, sourceId)
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
  },
  onCloseTab: (callback: () => void): void => {
    ipcRenderer.on('shortcut:close-tab', () => {
      callback()
    })
  },
  removeCloseTabListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:close-tab')
  },
  onNewTab: (callback: () => void): void => {
    ipcRenderer.on('shortcut:new-tab', () => callback())
  },
  removeNewTabListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:new-tab')
  },
  onCommandBar: (callback: () => void): void => {
    ipcRenderer.on('shortcut:command-bar', () => callback())
  },
  removeCommandBarListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:command-bar')
  },
  onGoToTab: (callback: (index: number) => void): void => {
    ipcRenderer.on('shortcut:go-to-tab', (_event, index: number) => callback(index))
  },
  removeGoToTabListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:go-to-tab')
  },
  onNewGroup: (callback: () => void): void => {
    ipcRenderer.on('shortcut:new-group', () => {
      callback()
    })
  },
  removeNewGroupListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:new-group')
  },
  onOpenSettings: (callback: () => void): void => {
    ipcRenderer.on('shortcut:open-settings', () => {
      callback()
    })
  },
  removeOpenSettingsListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:open-settings')
  },
  onReloadTab: (callback: () => void): void => {
    ipcRenderer.on('shortcut:reload-tab', () => {
      callback()
    })
  },
  removeReloadTabListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:reload-tab')
  },
  onFind: (callback: () => void): void => {
    ipcRenderer.on('shortcut:find', () => callback())
  },
  removeFindListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:find')
  },
  onZoomIn: (callback: () => void): void => {
    ipcRenderer.on('shortcut:zoom-in', () => callback())
  },
  removeZoomInListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:zoom-in')
  },
  onZoomOut: (callback: () => void): void => {
    ipcRenderer.on('shortcut:zoom-out', () => callback())
  },
  removeZoomOutListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:zoom-out')
  },
  onZoomReset: (callback: () => void): void => {
    ipcRenderer.on('shortcut:zoom-reset', () => callback())
  },
  removeZoomResetListener: (): void => {
    ipcRenderer.removeAllListeners('shortcut:zoom-reset')
  },
  onPermissionRequest: (
    callback: (data: { requestId: number; permission: string; origin: string }) => void
  ): void => {
    ipcRenderer.on('permission:request', (_event, data) => {
      callback(data)
    })
  },
  removePermissionRequestListener: (): void => {
    ipcRenderer.removeAllListeners('permission:request')
  },
  respondToPermission: (requestId: number, granted: boolean): void => {
    ipcRenderer.send('permission:response', { requestId, granted })
  },
  onDisplayMediaPick: (callback: (data: DisplayMediaPickRequest) => void): void => {
    ipcRenderer.on('display-media:pick', (_event, data: DisplayMediaPickRequest) => {
      callback(data)
    })
  },
  removeDisplayMediaPickListener: (): void => {
    ipcRenderer.removeAllListeners('display-media:pick')
  },
  respondToDisplayMediaPick: (requestId: number, sourceId: string | null): void => {
    ipcRenderer.send('display-media:response', { requestId, sourceId })
  },
  // Custom per-tab shortcuts → hidden app-menu items, so they fire while a page has focus
  setTabShortcuts: (shortcuts: { tabId: string; accelerator: string }[]): Promise<void> =>
    ipcRenderer.invoke('menu:set-tab-shortcuts', shortcuts),
  onActivateTab: (callback: (tabId: string) => void): void =>
    listen('shortcut:activate-tab', callback),
  removeActivateTabListener: (): void => unlisten('shortcut:activate-tab'),
  onReopenClosedTab: (callback: () => void): void => listen('shortcut:reopen-closed-tab', callback),
  removeReopenClosedTabListener: (): void => unlisten('shortcut:reopen-closed-tab'),
  onGoToSilo: (callback: (index: number) => void): void => listen('shortcut:go-to-silo', callback),
  removeGoToSiloListener: (): void => unlisten('shortcut:go-to-silo'),
  onCycleTab: (callback: (step: number) => void): void => listen('shortcut:cycle-tab', callback),
  removeCycleTabListener: (): void => unlisten('shortcut:cycle-tab'),
  onNavigate: (callback: (direction: 'back' | 'forward') => void): void =>
    listen('shortcut:navigate', callback),
  removeNavigateListener: (): void => unlisten('shortcut:navigate'),
  onHardReload: (callback: () => void): void => listen('shortcut:hard-reload', callback),
  removeHardReloadListener: (): void => unlisten('shortcut:hard-reload'),
  onStopLoading: (callback: () => void): void => listen('shortcut:stop-loading', callback),
  removeStopLoadingListener: (): void => unlisten('shortcut:stop-loading'),
  onPrint: (callback: () => void): void => listen('shortcut:print', callback),
  removePrintListener: (): void => unlisten('shortcut:print'),
  onFindAgain: (callback: (direction: 1 | -1) => void): void =>
    listen('shortcut:find-again', callback),
  removeFindAgainListener: (): void => unlisten('shortcut:find-again'),
  onPageDevTools: (callback: () => void): void => listen('shortcut:page-devtools', callback),
  removePageDevToolsListener: (): void => unlisten('shortcut:page-devtools')
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
