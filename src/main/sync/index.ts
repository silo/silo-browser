/**
 * Folder sync: Electron side. Wires the engine (engine.ts) to the persisted state (store.ts),
 * the window, the folder picker and IPC. See docs/sync.md.
 */
import { app, BrowserWindow, dialog, ipcMain, nativeTheme, session, shell } from 'electron'
import { homedir, hostname } from 'os'
import { SyncEngine, type JoinMode } from './engine'
import {
  getCachedState,
  normalizeState,
  saveState,
  setSaveListener,
  type PersistedState
} from '../store'
import { SETTINGS_KEYS } from '../../shared/sync-model'

let engine: SyncEngine | null = null
let win: BrowserWindow | null = null
// sync:start only accepts the folder the user just picked in the native dialog
let pickedFolder: string | null = null

/** "Silos-MacBook-Pro.local" → "Silos MacBook Pro" */
function machineName(): string {
  const raw = hostname().replace(/\.(local|lan|home|localdomain)$/i, '')
  const pretty = raw.replace(/[-_]+/g, ' ').trim()
  return (pretty || (process.platform === 'darwin' ? 'Mac' : 'Computer')).slice(0, 60)
}

function send(channel: string, ...args: unknown[]): void {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args)
}

/** Call after loadState() and before the window is created. */
export function initSync(): void {
  engine = new SyncEngine({
    userDataDir: app.getPath('userData'),
    homeDir: homedir(),
    platform: process.platform,
    appVersion: app.getVersion(),
    machineName: machineName(),
    now: () => Date.now(),
    getState: () => getCachedState() as unknown as Record<string, unknown>,
    writeState: (partial) => {
      if (typeof partial.themeMode === 'string') {
        nativeTheme.themeSource = partial.themeMode as 'dark' | 'light' | 'system'
      }
      void saveState(partial as Partial<PersistedState>, { silent: true })
    },
    validSetting: (key, value) => {
      const normalized = normalizeState({ ...getCachedState(), [key]: value }) as unknown as Record<
        string,
        unknown
      >
      return normalized[key] === value
    },
    sendPatch: (patch) => send('sync:patch', patch),
    clearSession: (groupId) =>
      session.fromPartition(`persist:silo-group-${groupId}`).clearStorageData(),
    onStatus: (status) => send('sync:status', status),
    log: (message, err) => console.error(`[sync] ${message}`, err ?? '')
  })
  setSaveListener((partial) => engine?.onLocalSave(partial as Record<string, unknown>))
  engine.startup()
  registerSyncIpc()
  app.on('will-quit', () => engine?.flushSync())
}

export function attachSyncWindow(window: BrowserWindow): void {
  win = window
  // A reload of the app UI: hold patches until it has loaded its stores again. (Not
  // 'did-start-loading': that also fires whenever a <webview> inside the window loads.)
  window.webContents.on('did-navigate', () => engine?.rendererGone())
  window.webContents.on('render-process-gone', () => engine?.rendererGone())
  window.on('focus', () => engine?.onWindowFocus())
  window.on('closed', () => {
    if (win === window) win = null
    engine?.rendererGone()
  })
}

function registerSyncIpc(): void {
  ipcMain.handle('sync:ready', () => engine?.rendererReady())

  ipcMain.handle('sync:get-status', () => engine?.status() ?? null)

  ipcMain.handle('sync:choose-folder', async (event) => {
    if (!engine) return null
    const parent = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Choose a sync folder',
      buttonLabel: 'Use This Folder',
      message:
        'Pick a folder that syncs between your computers, such as one in iCloud Drive, Dropbox, Google Drive or OneDrive.',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    pickedFolder = result.filePaths[0]
    try {
      return { ok: true, summary: await engine.inspectFolder(pickedFolder) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sync:start', async (_event, mode: unknown, localOnly: unknown) => {
    if (!engine || !pickedFolder) return { ok: false, error: 'Choose a folder first' }
    const joinMode: JoinMode = mode === 'replace' ? 'replace' : 'combine'
    const ids = Array.isArray(localOnly)
      ? localOnly.filter((x): x is string => typeof x === 'string')
      : []
    try {
      await engine.start(pickedFolder, joinMode, ids)
      pickedFolder = null
      return { ok: true, status: engine.status() }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('sync:stop', async () => {
    if (!engine) return null
    try {
      await engine.stop()
    } catch {
      // Busy: the status still tells the truth
    }
    return engine.status()
  })

  ipcMain.handle('sync:resolve-removal', (_event, apply: unknown) => {
    engine?.resolveRemoval(apply === true)
    return engine?.status() ?? null
  })

  ipcMain.handle('sync:sync-now', async () => {
    await engine?.pull()
    return engine?.status() ?? null
  })

  ipcMain.handle('sync:open-folder', () => {
    const folder = engine?.status().folder
    if (folder) void shell.openPath(folder)
  })

  ipcMain.handle('sync:list-restore-points', () => engine?.listRestorePoints() ?? [])

  // Puts back silos, tabs and settings from a restore point. With sync on, that counts as an edit
  // on this computer and goes to the others too. The renderer reloads its stores afterwards.
  ipcMain.handle('sync:restore', async (_event, id: unknown) => {
    if (!engine || typeof id !== 'string') return false
    const point = engine.readRestorePoint(id)
    if (!point) return false
    engine.saveRestorePoint('Before restoring', true)
    const merged = normalizeState({ ...getCachedState(), ...point.settings, groups: point.groups })
    const partial: Partial<PersistedState> = { groups: merged.groups }
    for (const key of SETTINGS_KEYS) (partial as Record<string, unknown>)[key] = merged[key]
    nativeTheme.themeSource = merged.themeMode as 'dark' | 'light' | 'system'
    await saveState(partial)
    return true
  })
}
