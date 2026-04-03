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
  zoomLevel: number // 0 = default (100%), persisted per-tab
}

export interface GroupItem {
  id: string
  name: string
  color: string
  iconEmoji?: string
  order: number
  isCollapsed: boolean
  tabs: TabItem[]
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
}

export type ThemeMode = 'dark' | 'light' | 'system'
export type AccentColor = 'blue' | 'green' | 'amber' | 'red' | 'violet' | 'pink' | 'cyan' | 'orange' | 'gray'
export type SurfaceColor = 'neutral' | 'charcoal' | 'slate' | 'navy' | 'forest' | 'wine' | 'plum' | 'teal' | 'earth'

export interface AppState {
  groups: GroupItem[]
  activeTabId: string | null
  sidebarExpanded: boolean
  openLinksInNewTab: boolean
  childTabs: ChildTab[]
  activeChildTabId: string | null
  themeMode: ThemeMode
  accentColor: AccentColor
  surfaceColor: string // SurfaceColor preset name or custom hex (e.g. '#1a2332')
  defaultSleepAfterMinutes: number
}

export interface ContextMenuItem {
  label: string
  action: () => void
  separator?: false
}

export interface ContextMenuSeparator {
  separator: true
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator
