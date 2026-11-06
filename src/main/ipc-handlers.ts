import { app, ipcMain, nativeTheme, session, shell, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getCachedState, normalizeState, saveState } from './store'
import { checkForUpdates, quitAndInstall, openReleasesPage } from './updater'

export function registerIpcHandlers(): void {
  ipcMain.handle('app:get-version', () => {
    return app.getVersion()
  })

  ipcMain.handle('store:get-state', () => {
    return getCachedState()
  })

  ipcMain.handle('store:save-groups', async (_event, groups: unknown[]) => {
    await saveState({ groups })
  })

  ipcMain.handle('store:save-active-tab', async (_event, tabId: string | null) => {
    await saveState({ activeTabId: tabId })
  })

  ipcMain.handle(
    'store:save-groups-and-active-tab',
    async (_event, groups: unknown[], activeTabId: string | null) => {
      await saveState({ groups, activeTabId })
    }
  )

  ipcMain.handle('store:save-sidebar-state', async (_event, expanded: boolean) => {
    await saveState({ sidebarExpanded: expanded })
  })

  ipcMain.handle('store:save-open-links-in-new-tab', async (_event, value: boolean) => {
    await saveState({ openLinksInNewTab: value })
  })

  ipcMain.handle(
    'store:save-appearance',
    async (
      _event,
      appearance: {
        themeMode: string
        accentColor: string
        lightShade: string
        darkShade: string
        siloTint: string
      }
    ) => {
      const normalized = normalizeState({ ...getCachedState(), ...appearance })
      nativeTheme.themeSource = normalized.themeMode as 'dark' | 'light' | 'system'
      await saveState({
        themeMode: normalized.themeMode,
        accentColor: normalized.accentColor,
        lightShade: normalized.lightShade,
        darkShade: normalized.darkShade,
        siloTint: normalized.siloTint
      })
    }
  )

  ipcMain.handle('store:save-sidebar-layout', async (_event, layout: string) => {
    const normalized = normalizeState({ ...getCachedState(), sidebarLayout: layout })
    await saveState({ sidebarLayout: normalized.sidebarLayout })
  })

  // The window background and (Windows/Linux) title bar overlay follow the app chrome color,
  // which changes with theme, shade and the active silo's tint.
  ipcMain.handle(
    'window:set-chrome-colors',
    (event, colors: { background: string; symbol: string }) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      win.setBackgroundColor(colors.background)
      if (process.platform !== 'darwin') {
        win.setTitleBarOverlay({ color: colors.background, symbolColor: colors.symbol })
      }
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
        // Validate everything (and migrate legacy values) through the same path as startup,
        // keeping local-only state such as granted permissions and the active tab.
        const current = getCachedState()
        const merged = normalizeState({ ...current, ...parsed })
        await saveState({
          groups: merged.groups,
          // Child tabs belong to the imported tabs; never keep the current ones around
          childTabs: Array.isArray(parsed.childTabs) ? merged.childTabs : [],
          activeChildTabId: Array.isArray(parsed.childTabs) ? merged.activeChildTabId : null,
          themeMode: merged.themeMode,
          accentColor: merged.accentColor,
          lightShade: merged.lightShade,
          darkShade: merged.darkShade,
          siloTint: merged.siloTint,
          sidebarLayout: merged.sidebarLayout
        })
        nativeTheme.themeSource = merged.themeMode as 'dark' | 'light' | 'system'
        return parsed
      }
      return null
    } catch {
      return null
    }
  })
}
