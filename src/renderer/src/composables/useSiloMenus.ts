import { computed, type ComputedRef } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useWebviewRegistry } from './useWebviewRegistry'
import type { ContextMenuEntry, GroupItem, MediaCapture, TabItem } from '@renderer/types'

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
    // A tab on a call or playing sound never sleeps (it would end the call)
    if (tab.isLoaded && tab.id !== groupsStore.activeTabId && !groupsStore.isTabBusy(tab)) {
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
      { label: 'Delete silo…', danger: true, action: () => uiStore.openConfirmDeleteSilo(group.id) }
    ]
    uiStore.showContextMenu(x, y, items)
  }

  return { openTabMenu, openSiloMenu, openSiloMenuAt }
}

export interface TabStatus {
  /** Camera / microphone / screen share in use — by the tab or one of its pop-up tabs */
  camera: boolean
  mic: boolean
  screen: boolean
  audio: boolean
  muted: boolean
  bellOff: boolean
  asleep: boolean
  badge: number
  /** The single most important status, for the small badge on collapsed icons */
  primary: 'camera' | 'mic' | 'screen' | 'audio' | 'muted' | 'bell' | 'sleep' | null
}

const NO_CAPTURE: MediaCapture = { camera: false, mic: false, screen: false }

/** What a tab and its pop-up tabs capture, combined (a call in a pop-up shows on its parent). */
export function tabCapture(tab: TabItem): MediaCapture {
  const topbarStore = useTopbarTabsStore()
  const out = { ...(tab.capture ?? NO_CAPTURE) }
  for (const ct of topbarStore.childTabs) {
    if (ct.parentTabId !== tab.id || !ct.capture) continue
    out.camera ||= ct.capture.camera
    out.mic ||= ct.capture.mic
    out.screen ||= ct.capture.screen
  }
  return out
}

export function isCapturing(c: MediaCapture): boolean {
  return c.camera || c.mic || c.screen
}

/** Status flags for a tab row (audio playing in the tab or one of its pop-up tabs, etc.). */
export function useTabStatus(tab: () => TabItem): ComputedRef<TabStatus> {
  const topbarStore = useTopbarTabsStore()
  return computed(() => {
    const t = tab()
    const playing =
      !!t.isAudioPlaying ||
      topbarStore.childTabs.some((ct) => ct.parentTabId === t.id && ct.isAudioPlaying)
    const { camera, mic, screen } = tabCapture(t)
    const audio = playing && !t.isMuted
    const muted = t.isMuted
    const bellOff = !t.notificationsEnabled
    const asleep = !!t.isAsleep && !t.isLoaded
    const primary = camera
      ? 'camera'
      : mic
        ? 'mic'
        : screen
          ? 'screen'
          : audio
            ? 'audio'
            : muted
              ? 'muted'
              : bellOff
                ? 'bell'
                : asleep
                  ? 'sleep'
                  : null
    return {
      camera,
      mic,
      screen,
      audio,
      muted,
      bellOff,
      asleep,
      badge: t.notificationCount,
      primary
    }
  })
}

/** Spoken / tooltip text for what a tab is capturing, e.g. "using camera and microphone". */
export function captureLabel(c: MediaCapture): string {
  const parts: string[] = []
  if (c.camera) parts.push('camera')
  if (c.mic) parts.push('microphone')
  const using = parts.length ? `using ${parts.join(' and ')}` : ''
  return [using, c.screen ? 'sharing screen' : ''].filter(Boolean).join(', ')
}

export function formatBadge(n: number): string {
  return n > 99 ? '99+' : String(n)
}

export function siloUnread(group: GroupItem): number {
  return group.tabs.reduce((n, t) => n + (t.notificationCount || 0), 0)
}

/** What any tab in a silo (or its pop-up tabs) is capturing — shown on the silo tile. */
export function siloCapture(group: GroupItem): MediaCapture {
  const out = { ...NO_CAPTURE }
  for (const tab of group.tabs) {
    const c = tabCapture(tab)
    out.camera ||= c.camera
    out.mic ||= c.mic
    out.screen ||= c.screen
  }
  return out
}
