import { ipcMain, session, shell, dialog, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { loadState, saveState } from './store'

export function registerIpcHandlers(): void {
  ipcMain.handle('store:get-state', () => {
    return loadState()
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

  ipcMain.handle('store:clear-group-session', async (_event, groupId: string) => {
    const partition = `persist:silo-group-${groupId}`
    const ses = session.fromPartition(partition)
    await ses.clearStorageData()
  })

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    await shell.openExternal(url)
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
    const state = loadState()
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
        await saveState({ groups: parsed.groups })
        return parsed
      }
      return null
    } catch {
      return null
    }
  })
}
