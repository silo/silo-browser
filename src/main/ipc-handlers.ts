import { app, ipcMain, session, shell, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { getCachedState, saveState } from './store'
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
    'store:save-child-tabs',
    async (_event, childTabs: unknown[], activeChildTabId: string | null) => {
      await saveState({ childTabs, activeChildTabId })
    }
  )

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
        const childTabs = Array.isArray(parsed.childTabs) ? parsed.childTabs : []
        const activeChildTabId =
          typeof parsed.activeChildTabId === 'string' ? parsed.activeChildTabId : null
        await saveState({ groups: parsed.groups, childTabs, activeChildTabId })
        return parsed
      }
      return null
    } catch {
      return null
    }
  })
}
