import { app } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
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
}

const VALID_THEME_MODES = ['dark', 'light', 'system']
const VALID_ACCENT_COLORS = ['blue', 'green', 'amber', 'red', 'violet', 'pink', 'cyan', 'orange', 'gray']
const VALID_SURFACE_COLORS = ['neutral', 'charcoal', 'slate', 'navy', 'forest', 'wine', 'plum', 'teal', 'earth']

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
  grantedPermissions: []
}

let cachedState: PersistedState = { ...defaultState }

function getStorePath(): string {
  return join(app.getPath('userData'), 'silo-config.json')
}

export function loadState(): PersistedState {
  const storePath = getStorePath()
  try {
    if (!existsSync(storePath)) return { ...defaultState }
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
        : []
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
  const storePath = getStorePath()
  try {
    const dir = dirname(storePath)
    await mkdir(dir, { recursive: true })
    await writeFile(storePath, JSON.stringify(cachedState, null, 2))
  } catch (err) {
    console.error('Failed to save state:', err)
  }
}
