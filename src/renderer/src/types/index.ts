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
  currentUrl?: string // Runtime-only — tracks navigated URL
  currentTitle?: string // Runtime-only — tracks page title
  isAudioPlaying?: boolean // Runtime-only — tracks media playback
  isMuted: boolean
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

export interface AppState {
  groups: GroupItem[]
  activeTabId: string | null
  sidebarExpanded: boolean
  openLinksInNewTab: boolean
  childTabs: ChildTab[]
  activeChildTabId: string | null
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
