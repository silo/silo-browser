import { computed, type ComputedRef } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useWebviewRegistry } from './useWebviewRegistry'
import type { ContextMenuEntry, GroupItem, TabItem } from '@renderer/types'

/** Right-click / "…" menus for tabs and silos, shared by every sidebar layout. */
export function useSiloMenus(): {
  openTabMenu: (e: MouseEvent, tab: TabItem) => void
  openSiloMenu: (e: MouseEvent, group: GroupItem) => void
  openSiloMenuAt: (x: number, y: number, group: GroupItem) => void
} {
  const groupsStore = useGroupsStore()
  const uiStore = useUiStore()
  const webviewRegistry = useWebviewRegistry()

  function openTabMenu(e: MouseEvent, tab: TabItem): void {
    e.preventDefault()
    e.stopPropagation()
    const webview = webviewRegistry.getMain(tab.id)
    const items: ContextMenuEntry[] = [
      { label: 'Edit tab…', action: () => uiStore.openEditTabDialog(tab.id) },
      { label: 'Reload', action: () => webview?.reload() },
      {
        label: 'Refresh icon',
        action: () => {
          groupsStore.updateTab(tab.id, { iconUrl: undefined })
          webview?.reload()
        }
      },
      { separator: true },
      {
        label: tab.isMuted ? 'Unmute tab' : 'Mute tab',
        action: () => groupsStore.updateTab(tab.id, { isMuted: !tab.isMuted })
      },
      {
        label: tab.notificationsEnabled ? 'Turn off notifications' : 'Turn on notifications',
        action: () =>
          groupsStore.updateTab(tab.id, { notificationsEnabled: !tab.notificationsEnabled })
      }
    ]
    if (tab.isLoaded && tab.id !== groupsStore.activeTabId) {
      items.push({ label: 'Put to sleep', action: () => groupsStore.sleepTab(tab.id) })
    }
    items.push(
      { separator: true },
      { label: 'Delete tab', danger: true, action: () => uiStore.openConfirmRemoveTabDialog(tab.id) }
    )
    uiStore.showContextMenu(e.clientX, e.clientY, items)
  }

  function openSiloMenu(e: MouseEvent, group: GroupItem): void {
    e.preventDefault()
    e.stopPropagation()
    openSiloMenuAt(e.clientX, e.clientY, group)
  }

  function openSiloMenuAt(x: number, y: number, group: GroupItem): void {
    const items: ContextMenuEntry[] = [
      { label: 'Edit silo…', action: () => uiStore.openEditGroupDialog(group.id) },
      { label: 'Add tab…', action: () => uiStore.openAddTabDialog(group.id) },
      { separator: true },
      { label: 'Delete silo', danger: true, action: () => groupsStore.removeGroup(group.id) }
    ]
    uiStore.showContextMenu(x, y, items)
  }

  return { openTabMenu, openSiloMenu, openSiloMenuAt }
}

export interface TabStatus {
  audio: boolean
  muted: boolean
  bellOff: boolean
  asleep: boolean
  badge: number
  /** The single most important status, for the small badge on collapsed icons */
  primary: 'audio' | 'muted' | 'bell' | 'sleep' | null
}

/** Status flags for a tab row (audio playing in the tab or one of its pop-up tabs, etc.). */
export function useTabStatus(tab: () => TabItem): ComputedRef<TabStatus> {
  const topbarStore = useTopbarTabsStore()
  return computed(() => {
    const t = tab()
    const playing =
      !!t.isAudioPlaying ||
      topbarStore.childTabs.some((ct) => ct.parentTabId === t.id && ct.isAudioPlaying)
    const audio = playing && !t.isMuted
    const muted = t.isMuted
    const bellOff = !t.notificationsEnabled
    const asleep = !!t.isAsleep && !t.isLoaded
    const primary = audio ? 'audio' : muted ? 'muted' : bellOff ? 'bell' : asleep ? 'sleep' : null
    return { audio, muted, bellOff, asleep, badge: t.notificationCount, primary }
  })
}

export function formatBadge(n: number): string {
  return n > 99 ? '99+' : String(n)
}

export function siloUnread(group: GroupItem): number {
  return group.tabs.reduce((n, t) => n + (t.notificationCount || 0), 0)
}
