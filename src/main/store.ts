import { app } from 'electron'
import { readFileSync, existsSync } from 'fs'
import { writeFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

export interface PersistedState {
  groups: unknown[]
  activeTabId: string | null
  sidebarExpanded: boolean
  sidebarLayout: string // 'sidebar' | 'rail'
  openLinksInNewTab: boolean
  childTabs: unknown[]
  activeChildTabId: string | null
  themeMode: string
  accentColor: string
  lightShade: string
  darkShade: string
  siloTint: string
  grantedPermissions: string[] // "origin::permission" entries
  defaultSleepAfterMinutes: number
  confirmCloseChildTabs: boolean
  defaultUserAgent: string
}

const VALID_THEME_MODES = ['dark', 'light', 'system']
const VALID_ACCENT_COLORS = [
  'black',
  'blue',
  'green',
  'teal',
  'violet',
  'pink',
  'red',
  'orange',
  'graphite'
]
// Accent names from before the design rework that no longer exist
const LEGACY_ACCENT_MAP: Record<string, string> = { gray: 'black', amber: 'orange', cyan: 'teal' }
const VALID_SIDEBAR_LAYOUTS = ['sidebar', 'rail']
const VALID_SILO_TINTS = ['off', 'subtle', 'strong']

// Keep in sync with LIGHT_SHADES / DARK_SHADES in src/renderer/src/utils/theme.ts
export const LIGHT_SHADE_HEX: Record<string, string> = {
  stone: '#F6F4F0',
  paper: '#F5F5F4',
  snow: '#FFFFFF',
  cool: '#F1F4F7',
  sand: '#F2ECE3',
  mist: '#E7E7EA'
}
export const DARK_SHADE_HEX: Record<string, string> = {
  pitch: '#0A0A0B',
  graphite: '#161616',
  warm: '#181513',
  cool: '#121519',
  charcoal: '#1E1E20',
  violet: '#14121A'
}

const defaultState: PersistedState = {
  groups: [],
  activeTabId: null,
  sidebarExpanded: true,
  // New installs start with the silo rail; configs written before this setting existed keep
  // the one-sidebar layout their users know (see normalizeState)
  sidebarLayout: 'rail',
  openLinksInNewTab: true,
  childTabs: [],
  activeChildTabId: null,
  themeMode: 'system',
  accentColor: 'black',
  lightShade: 'stone',
  darkShade: 'pitch',
  siloTint: 'subtle',
  grantedPermissions: [],
  defaultSleepAfterMinutes: 0,
  confirmCloseChildTabs: false,
  defaultUserAgent: ''
}

let cachedState: PersistedState = { ...defaultState }

function getStorePath(): string {
  return join(app.getPath('userData'), 'silo-config.json')
}

function pick<T extends string>(value: unknown, valid: T[] | string[], fallback: T): T {
  return typeof value === 'string' && (valid as string[]).includes(value) ? (value as T) : fallback
}

/**
 * Validates a raw config object (from disk or an imported file) and fills in defaults.
 * Also migrates settings written by older versions (e.g. legacy accent names).
 */
export function normalizeState(parsed: Record<string, unknown>): PersistedState {
  const rawAccent =
    typeof parsed.accentColor === 'string'
      ? (LEGACY_ACCENT_MAP[parsed.accentColor] ?? parsed.accentColor)
      : undefined
  return {
    groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    activeTabId: typeof parsed.activeTabId === 'string' ? parsed.activeTabId : null,
    sidebarExpanded: typeof parsed.sidebarExpanded === 'boolean' ? parsed.sidebarExpanded : true,
    // Missing = a config from before layouts existed → keep the one-sidebar layout
    sidebarLayout: pick(parsed.sidebarLayout, VALID_SIDEBAR_LAYOUTS, 'sidebar'),
    openLinksInNewTab:
      typeof parsed.openLinksInNewTab === 'boolean' ? parsed.openLinksInNewTab : true,
    childTabs: Array.isArray(parsed.childTabs) ? parsed.childTabs : [],
    activeChildTabId: typeof parsed.activeChildTabId === 'string' ? parsed.activeChildTabId : null,
    // Configs written before "system" became the default were always dark unless changed
    themeMode: pick(parsed.themeMode, VALID_THEME_MODES, 'dark'),
    accentColor: pick(rawAccent, VALID_ACCENT_COLORS, 'black'),
    lightShade: pick(parsed.lightShade, Object.keys(LIGHT_SHADE_HEX), 'stone'),
    darkShade: pick(parsed.darkShade, Object.keys(DARK_SHADE_HEX), 'pitch'),
    siloTint: pick(parsed.siloTint, VALID_SILO_TINTS, 'subtle'),
    grantedPermissions: Array.isArray(parsed.grantedPermissions)
      ? parsed.grantedPermissions.filter((p: unknown) => typeof p === 'string')
      : [],
    defaultSleepAfterMinutes:
      typeof parsed.defaultSleepAfterMinutes === 'number' ? parsed.defaultSleepAfterMinutes : 0,
    confirmCloseChildTabs:
      typeof parsed.confirmCloseChildTabs === 'boolean' ? parsed.confirmCloseChildTabs : false,
    defaultUserAgent: typeof parsed.defaultUserAgent === 'string' ? parsed.defaultUserAgent : ''
  }
}

export function loadState(): PersistedState {
  const storePath = getStorePath()
  try {
    if (!existsSync(storePath)) return { ...defaultState }
    const raw = readFileSync(storePath, 'utf-8')
    const state = normalizeState(JSON.parse(raw))
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
