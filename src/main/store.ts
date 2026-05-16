import { app } from 'electron'
import { readFileSync, existsSync, statSync } from 'fs'
import { writeFile, mkdir, rename } from 'fs/promises'
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

async function saveLocalPrefs(): Promise<void> {
  const path = getLocalPrefsPath()
  try {
    await mkdir(dirname(path), { recursive: true })
    const tmp = `${path}.tmp`
    await writeFile(tmp, JSON.stringify({ syncFolderPath }, null, 2))
    await rename(tmp, path)
  } catch (err) {
    console.error('Failed to save local prefs:', err)
  }
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

function getConfigPath(): string {
  loadLocalPrefs()
  if (syncFolderPath && isDirectory(syncFolderPath)) {
    return join(syncFolderPath, CONFIG_FILENAME)
  }
  if (syncFolderPath) {
    console.warn(
      `Silo sync folder not accessible (${syncFolderPath}); falling back to local storage.`
    )
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
  } catch {
    return { ...defaultState }
  }
}

export function getCachedState(): PersistedState {
  return cachedState
}

export async function saveState(partial: Partial<PersistedState>): Promise<void> {
  cachedState = { ...cachedState, ...partial }
  const storePath = getConfigPath()
  try {
    const dir = dirname(storePath)
    await mkdir(dir, { recursive: true })
    const tmp = `${storePath}.tmp`
    await writeFile(tmp, JSON.stringify(cachedState, null, 2))
    await rename(tmp, storePath)
  } catch (err) {
    console.error('Failed to save state:', err)
  }
}

export function getSyncFolderPath(): string | null {
  loadLocalPrefs()
  return syncFolderPath
}

export function peekSyncFolder(path: string): { valid: boolean; hasExistingConfig: boolean } {
  if (!isDirectory(path)) return { valid: false, hasExistingConfig: false }
  return { valid: true, hasExistingConfig: existsSync(join(path, CONFIG_FILENAME)) }
}

export async function setSyncFolderPath(
  path: string | null,
  mode: 'use-existing' | 'overwrite' = 'overwrite'
): Promise<PersistedState> {
  loadLocalPrefs()

  if (path !== null && !isDirectory(path)) {
    throw new Error(`Sync folder is not accessible: ${path}`)
  }

  // If switching to a folder that already has a config and the user opted in,
  // adopt that config. Otherwise (overwrite, or no existing file), write the
  // current cached state to the new location.
  if (path !== null && mode === 'use-existing' && existsSync(join(path, CONFIG_FILENAME))) {
    syncFolderPath = path
    await saveLocalPrefs()
    return loadState()
  }

  syncFolderPath = path
  await saveLocalPrefs()
  await saveState({})
  return cachedState
}
