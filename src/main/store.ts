import { app } from 'electron'
import { readFileSync, existsSync, statSync } from 'fs'
import { writeFile, mkdir, rename, unlink } from 'fs/promises'
import { join, dirname } from 'path'

export interface PersistedState {
  groups: unknown[]
  activeTabId: string | null
  sidebarExpanded: boolean
  openLinksInNewTab: boolean
  childTabs: unknown[]
  activeChildTabId: string | null
  themeMode: string
  accentColor: string
  surfaceColor: string
  grantedPermissions: string[] // "origin::permission" entries
  defaultSleepAfterMinutes: number
  confirmCloseChildTabs: boolean
  defaultUserAgent: string
}

const VALID_THEME_MODES = ['dark', 'light', 'system']
const VALID_ACCENT_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'cyan', 'orange', 'gray']
const VALID_SURFACE_COLORS = ['neutral', 'charcoal', 'slate', 'navy', 'forest', 'wine', 'plum', 'teal', 'earth']

const CONFIG_FILENAME = 'silo-config.json'
const LOCAL_PREFS_FILENAME = 'silo-prefs.local.json'

const defaultState: PersistedState = {
  groups: [],
  activeTabId: null,
  sidebarExpanded: true,
  openLinksInNewTab: true,
  childTabs: [],
  activeChildTabId: null,
  themeMode: 'dark',
  accentColor: 'gray',
  surfaceColor: 'charcoal',
  grantedPermissions: [],
  defaultSleepAfterMinutes: 0,
  confirmCloseChildTabs: false,
  defaultUserAgent: ''
}

let cachedState: PersistedState = { ...defaultState }
let syncFolderPath: string | null = null
let localPrefsLoaded = false
let writeCounter = 0
let writeChain: Promise<void> = Promise.resolve()

function getLocalPrefsPath(): string {
  return join(app.getPath('userData'), LOCAL_PREFS_FILENAME)
}

function loadLocalPrefs(): void {
  if (localPrefsLoaded) return
  localPrefsLoaded = true
  try {
    const path = getLocalPrefsPath()
    if (!existsSync(path)) return
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw)
    if (typeof parsed.syncFolderPath === 'string' && parsed.syncFolderPath.length > 0) {
      syncFolderPath = parsed.syncFolderPath
    }
  } catch (err) {
    console.error('Failed to read local prefs:', err)
  }
}

// Atomic JSON write: write to a unique temp file, then rename. The pid+counter
// suffix avoids two concurrent writes (multiple Silo instances on the same sync
// folder, or in-process races not covered by the writeChain) clobbering the
// same temp file. On failure, the temp file is cleaned up and the error is
// rethrown so callers can decide whether to surface it.
async function atomicWriteJson(targetPath: string, data: unknown): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp-${process.pid}-${++writeCounter}`
  try {
    await writeFile(tmp, JSON.stringify(data, null, 2))
    await rename(tmp, targetPath)
  } catch (err) {
    await unlink(tmp).catch(() => {})
    throw err
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

let warnedInaccessibleFolder: string | null = null

function getConfigPath(): string {
  loadLocalPrefs()
  if (syncFolderPath && isDirectory(syncFolderPath)) {
    warnedInaccessibleFolder = null
    return join(syncFolderPath, CONFIG_FILENAME)
  }
  if (syncFolderPath && warnedInaccessibleFolder !== syncFolderPath) {
    console.warn(
      `Silo sync folder not accessible (${syncFolderPath}); falling back to local storage.`
    )
    warnedInaccessibleFolder = syncFolderPath
  }
  return join(app.getPath('userData'), CONFIG_FILENAME)
}

export function loadState(): PersistedState {
  const storePath = getConfigPath()
  try {
    if (!existsSync(storePath)) {
      cachedState = { ...defaultState }
      return cachedState
    }
    const raw = readFileSync(storePath, 'utf-8')
    const parsed = JSON.parse(raw)
    const state: PersistedState = {
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
      activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
      sidebarExpanded:
        typeof parsed.sidebarExpanded === 'boolean' ? parsed.sidebarExpanded : true,
      openLinksInNewTab:
        typeof parsed.openLinksInNewTab === 'boolean' ? parsed.openLinksInNewTab : true,
      childTabs: Array.isArray(parsed.childTabs) ? parsed.childTabs : [],
      activeChildTabId:
        typeof parsed.activeChildTabId === 'string' ? parsed.activeChildTabId : null,
      themeMode:
        typeof parsed.themeMode === 'string' && VALID_THEME_MODES.includes(parsed.themeMode)
          ? parsed.themeMode
          : 'dark',
      accentColor:
        typeof parsed.accentColor === 'string' && VALID_ACCENT_COLORS.includes(parsed.accentColor)
          ? parsed.accentColor
          : 'gray',
      surfaceColor:
        typeof parsed.surfaceColor === 'string' &&
        (VALID_SURFACE_COLORS.includes(parsed.surfaceColor) ||
          /^#[0-9a-fA-F]{6}$/.test(parsed.surfaceColor))
          ? parsed.surfaceColor
          : 'charcoal',
      grantedPermissions: Array.isArray(parsed.grantedPermissions)
        ? parsed.grantedPermissions.filter((p: unknown) => typeof p === 'string')
        : [],
      defaultSleepAfterMinutes:
        typeof parsed.defaultSleepAfterMinutes === 'number' ? parsed.defaultSleepAfterMinutes : 0,
      confirmCloseChildTabs:
        typeof parsed.confirmCloseChildTabs === 'boolean' ? parsed.confirmCloseChildTabs : false,
      defaultUserAgent:
        typeof parsed.defaultUserAgent === 'string' ? parsed.defaultUserAgent : ''
    }
    cachedState = { ...state }
    return state
  } catch (err) {
    console.error('Failed to load state; falling back to defaults:', err)
    cachedState = { ...defaultState }
    return cachedState
  }
}

export function getCachedState(): PersistedState {
  return cachedState
}

export async function saveState(partial: Partial<PersistedState>): Promise<void> {
  cachedState = { ...cachedState, ...partial }
  // Serialize disk writes so a slower older write can't rename-clobber a faster
  // newer one on disk. Each queued task reads cachedState fresh at execution
  // time, so the on-disk file always converges to the latest cachedState.
  const task = writeChain.then(async () => {
    try {
      await atomicWriteJson(getConfigPath(), cachedState)
    } catch (err) {
      console.error('Failed to save state:', err)
    }
  })
  writeChain = task
  return task
}

export function getSyncFolderInfo(): { path: string | null; accessible: boolean } {
  loadLocalPrefs()
  if (!syncFolderPath) return { path: null, accessible: false }
  return { path: syncFolderPath, accessible: isDirectory(syncFolderPath) }
}

export function peekSyncFolder(path: string): { valid: boolean; hasExistingConfig: boolean } {
  if (!isDirectory(path)) return { valid: false, hasExistingConfig: false }
  return { valid: true, hasExistingConfig: isFile(join(path, CONFIG_FILENAME)) }
}

export async function setSyncFolderPath(
  path: string | null,
  mode: 'use-existing' | 'overwrite' = 'overwrite'
): Promise<PersistedState> {
  loadLocalPrefs()

  if (path !== null && !isDirectory(path)) {
    throw new Error(`Sync folder is not accessible: ${path}`)
  }

  // Do all the risky work first, BEFORE mutating any module state. If any step
  // throws, we exit here and nothing has changed — no rollback needed.
  const adopting =
    path !== null && mode === 'use-existing' && isFile(join(path, CONFIG_FILENAME))

  if (adopting) {
    // Validate the existing file is parseable. Without this, loadState()'s catch
    // would silently return defaults while leaving cachedState untouched —
    // adopting "succeeds" but the renderer keeps showing the previous data.
    try {
      JSON.parse(readFileSync(join(path!, CONFIG_FILENAME), 'utf-8'))
    } catch {
      throw new Error(`Existing config in ${path} is not valid JSON; refusing to adopt.`)
    }
  } else {
    // Write current cachedState to the future config location BEFORE committing
    // the pointer change. This covers three cases:
    //   - Overwrite onto an existing sync folder: replaces the cloud file.
    //   - Setting a new sync folder: seeds the file.
    //   - Clearing sync (path === null): persists current state to userData so
    //     a quit immediately after Clear doesn't lose the session's data to a
    //     stale local config.
    // A failure here (read-only folder, disk full) surfaces before any in-memory
    // mutation, so the previous setup stays intact.
    const futureConfigPath =
      path !== null
        ? join(path, CONFIG_FILENAME)
        : join(app.getPath('userData'), CONFIG_FILENAME)
    await atomicWriteJson(futureConfigPath, cachedState)
  }

  // Persist the new pointer atomically, then commit the in-memory mutation.
  // Writing local prefs last means a failure leaves the previous pointer
  // intact both on disk and in memory.
  await atomicWriteJson(getLocalPrefsPath(), { syncFolderPath: path })
  syncFolderPath = path
  warnedInaccessibleFolder = null

  return adopting ? loadState() : cachedState
}
