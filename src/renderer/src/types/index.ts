export interface TabItem {
  id: string
  groupId: string
  name: string
  url: string
  iconUrl?: string
  iconEmoji?: string
  order: number
  isLoaded: boolean // Runtime-only, not persisted — tabs start unloaded on app restart
  notificationsEnabled: boolean
  notificationCount: number // Runtime-only
  sleepAfterMinutes: number // 0 = never, 30, 60, 120, 240
  lastActiveAt?: number // Runtime-only — timestamp of last deactivation
  currentUrl?: string // Runtime-only — tracks navigated URL
  currentTitle?: string // Runtime-only — tracks page title
  isAudioPlaying?: boolean // Runtime-only — tracks media playback
  isMuted: boolean
  isAsleep?: boolean // Runtime-only — true when the sleep timer unloaded the tab
  zoomLevel: number // 0 = default (100%), persisted per-tab
  userAgent?: string
  /** Custom keyboard shortcut (Electron accelerator, e.g. "Control+Alt+G"). Persisted. */
  shortcut?: string
  capture?: MediaCapture // Runtime-only — camera / mic / screen in use by the page
  isLoading?: boolean // Runtime-only
}

/** What a page is capturing right now (camera, microphone, screen share). */
export interface MediaCapture {
  camera: boolean
  mic: boolean
  screen: boolean
}

/**
 * How a silo's tile is drawn.
 * - letter: `value` is an optional custom letter (empty = first letter of the name)
 * - emoji:  `value` is the emoji
 * - icon:   `value` is an id from SILO_ICONS (utils/silo-icons.ts)
 * - image:  `value` is a data URL of an uploaded SVG/PNG logo
 */
export type SiloIconKind = 'letter' | 'emoji' | 'icon' | 'image'
export interface SiloIcon {
  kind: SiloIconKind
  value: string
}

export interface GroupItem {
  id: string
  name: string
  color: string
  icon?: SiloIcon
  /** @deprecated pre-rework emoji icon; migrated to `icon` on load */
  iconEmoji?: string
  order: number
  isCollapsed: boolean
  tabs: TabItem[]
  userAgent?: string
}

export interface ChildTab {
  id: string
  parentTabId: string
  groupId: string
  url: string
  currentUrl?: string
  currentTitle?: string
  iconUrl?: string
  isAudioPlaying?: boolean // Runtime-only — tracks media playback
  capture?: MediaCapture // Runtime-only
  isLoading?: boolean // Runtime-only
  /** Runtime-only: the pop-up it was opened from, or null when opened from the sidebar tab itself */
  openerId?: string | null
  /** Runtime-only: its webview exists. Pop-ups restored from the last session load when first shown. */
  isLoaded?: boolean
}

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentColor =
  | 'black'
  | 'blue'
  | 'green'
  | 'teal'
  | 'violet'
  | 'pink'
  | 'red'
  | 'orange'
  | 'graphite'
export type LightShade = 'stone' | 'paper' | 'snow' | 'cool' | 'sand' | 'mist'
export type DarkShade = 'pitch' | 'graphite' | 'warm' | 'cool' | 'charcoal' | 'violet'
export type SiloTint = 'off' | 'subtle' | 'strong'
export type SidebarLayout = 'sidebar' | 'rail'

export interface AppState {
  groups: GroupItem[]
  activeTabId: string | null
  sidebarExpanded: boolean
  sidebarLayout: SidebarLayout
  openLinksInNewTab: boolean
  childTabs: ChildTab[]
  activeChildTabId: string | null
  themeMode: ThemeMode
  accentColor: AccentColor
  lightShade: LightShade
  darkShade: DarkShade
  siloTint: SiloTint
  defaultSleepAfterMinutes: number
  confirmCloseChildTabs: boolean
  defaultUserAgent: string
}

export interface ContextMenuItem {
  label: string
  action: () => void
  separator?: false
  danger?: boolean
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator

export interface DisplayMediaSource {
  id: string
  name: string
  thumbnail: string // data URL
  isScreen: boolean
}

export interface DisplayMediaPickRequest {
  requestId: number
  origin: string
  sources: DisplayMediaSource[]
}
