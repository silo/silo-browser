import { app, ipcMain, nativeTheme, session, shell, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getCachedState, saveState } from './store'
import { checkForUpdates, quitAndInstall, openReleasesPage } from './updater'
import {
  clearExtensionData,
  extensions,
  handleGroupDeleted,
  installFromUrl,
  installFromWebStore,
  installUnpacked,
  isCancellation,
  listExtensions,
  removeExtension,
  setActiveGroups,
  setExtensionEnabled
} from './extensions'

/**
 * Compare the previous groups list to the new one (as sent by the renderer)
 * and return the ids that were removed. Used so we can run extension cleanup
 * for deleted groups on the same IPC round-trip that persists the change.
 */
function findRemovedGroupIds(prev: unknown[], next: unknown[]): string[] {
  const idOf = (g: unknown): string | null =>
    typeof g === 'object' && g !== null && typeof (g as { id?: unknown }).id === 'string'
      ? (g as { id: string }).id
      : null
  const nextIds = new Set(next.map(idOf).filter((id): id is string => id !== null))
  return prev
    .map(idOf)
    .filter((id): id is string => id !== null)
    .filter((id) => !nextIds.has(id))
}

export function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('app:relaunch', () => {
    app.relaunch()
    app.exit(0)
  })

  ipcMain.handle('store:get-state', () => {
    return getCachedState()
  })

  ipcMain.handle('store:save-groups', async (_event, groups: unknown[]) => {
    const removedIds = findRemovedGroupIds(getCachedState().groups, groups)
    await saveState({ groups })
    for (const id of removedIds) await handleGroupDeleted(id)
  })

  ipcMain.handle('store:save-active-tab', async (_event, tabId: string | null) => {
    await saveState({ activeTabId: tabId })
  })

  ipcMain.handle(
    'store:save-groups-and-active-tab',
    async (_event, groups: unknown[], activeTabId: string | null) => {
      const removedIds = findRemovedGroupIds(getCachedState().groups, groups)
      await saveState({ groups, activeTabId })
      for (const id of removedIds) await handleGroupDeleted(id)
    }
  )

  ipcMain.handle('store:save-sidebar-state', async (_event, expanded: boolean) => {
    await saveState({ sidebarExpanded: expanded })
  })

  ipcMain.handle('store:save-open-links-in-new-tab', async (_event, value: boolean) => {
    await saveState({ openLinksInNewTab: value })
  })

  ipcMain.handle(
    'store:save-theme',
    async (_event, themeMode: string, accentColor: string, surfaceColor: string) => {
      nativeTheme.themeSource = themeMode as 'dark' | 'light' | 'system'
      await saveState({ themeMode, accentColor, surfaceColor })
    }
  )

  ipcMain.handle(
    'store:save-child-tabs',
    async (_event, childTabs: unknown[], activeChildTabId: string | null) => {
      await saveState({ childTabs, activeChildTabId })
    }
  )

  ipcMain.handle(
    'store:save-default-sleep-after-minutes',
    async (_event, value: number) => {
      await saveState({ defaultSleepAfterMinutes: value })
    }
  )

  ipcMain.handle('store:save-confirm-close-child-tabs', async (_event, value: boolean) => {
    await saveState({ confirmCloseChildTabs: value })
  })

  ipcMain.handle('store:save-default-user-agent', async (_event, value: string) => {
    await saveState({ defaultUserAgent: value })
  })

  ipcMain.handle('store:clear-group-session', async (_event, groupId: string) => {
    const partition = `persist:silo-group-${groupId}`
    const ses = session.fromPartition(partition)
    await ses.clearStorageData()
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
  })

  ipcMain.handle('updater:quit-and-install', () => {
    quitAndInstall()
  })

  ipcMain.handle('updater:check-for-updates', () => {
    checkForUpdates()
  })

  ipcMain.handle('updater:open-releases-page', () => {
    openReleasesPage()
  })

  ipcMain.handle('extensions:list', async () => {
    return listExtensions()
  })

  ipcMain.handle('extensions:install-from-webstore', async (_event, input: string) => {
    try {
      const entry = await installFromWebStore(input)
      return { ok: true, entry }
    } catch (err) {
      if (isCancellation(err)) return { ok: true, cancelled: true, entry: null }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:install-from-url', async (_event, url: string) => {
    try {
      const entry = await installFromUrl(url)
      return { ok: true, entry }
    } catch (err) {
      if (isCancellation(err)) return { ok: true, cancelled: true, entry: null }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:install-unpacked', async () => {
    try {
      const entry = await installUnpacked()
      return { ok: true, entry }
    } catch (err) {
      if (isCancellation(err)) return { ok: true, cancelled: true, entry: null }
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'extensions:set-enabled',
    async (_event, extensionId: string, enabled: boolean) => {
      try {
        const entry = await setExtensionEnabled(extensionId, enabled)
        return { ok: true, entry }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  ipcMain.handle('extensions:remove', async (_event, extensionId: string) => {
    try {
      await removeExtension(extensionId)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('extensions:clear-data', async (_event, extensionId: string) => {
    try {
      const entry = await clearExtensionData(extensionId)
      return { ok: true, entry }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(
    'extensions:set-active-groups',
    async (_event, extensionId: string, groupIds: string[]) => {
      try {
        const entry = await setActiveGroups(extensionId, groupIds)
        return { ok: true, entry }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    }
  )

  // Sent on every active-tab change so extensions see the right URL when
  // their popup calls chrome.tabs.query({ active: true }).
  ipcMain.on('extensions:select-tab', (_event, webContentsId: number) => {
    extensions.selectActiveTab(webContentsId)
  })

  ipcMain.handle('dialog:export-config', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showSaveDialog(win, {
      title: 'Export Configuration',
      defaultPath: 'silo-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    const state = getCachedState()
    await writeFile(result.filePath, JSON.stringify(state, null, 2))
    return result.filePath
  })

  ipcMain.handle('dialog:import-config', async () => {
    const win = BrowserWindow.getFocusedWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Import Configuration',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    try {
      const raw = readFileSync(result.filePaths[0], 'utf-8')
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed.groups)) {
        const childTabs = Array.isArray(parsed.childTabs) ? parsed.childTabs : []
        const activeChildTabId =
          typeof parsed.activeChildTabId === 'string' ? parsed.activeChildTabId : null
        const themeMode = typeof parsed.themeMode === 'string' ? parsed.themeMode : undefined
        const accentColor = typeof parsed.accentColor === 'string' ? parsed.accentColor : undefined
        const surfaceColor = typeof parsed.surfaceColor === 'string' ? parsed.surfaceColor : undefined
        await saveState({
          groups: parsed.groups,
          childTabs,
          activeChildTabId,
          ...(themeMode && { themeMode }),
          ...(accentColor && { accentColor }),
          ...(surfaceColor && { surfaceColor })
        })
        return parsed
      }
      return null
    } catch {
      return null
    }
  })
}
