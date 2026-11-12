import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TabItem } from '@renderer/types'
import { useGroupsStore } from './groups'
import { useTopbarTabsStore } from './topbar-tabs'

/** A pop-up tab as it was when closed (enough to open it again). */
export interface ClosedChild {
  url: string
  title?: string
  iconUrl?: string
}

/** Persisted fields of a sidebar tab — what removing it would otherwise lose. */
export type ClosedTabSnapshot = Pick<
  TabItem,
  | 'id'
  | 'groupId'
  | 'name'
  | 'url'
  | 'iconUrl'
  | 'iconEmoji'
  | 'notificationsEnabled'
  | 'isMuted'
  | 'sleepAfterMinutes'
  | 'zoomLevel'
  | 'userAgent'
  | 'shortcut'
>

export type ClosedEntry =
  | ({
      kind: 'child'
      id: string
      closedAt: number
      parentTabId: string
      groupId: string
    } & ClosedChild)
  | {
      kind: 'tab'
      id: string
      closedAt: number
      tab: ClosedTabSnapshot
      /** Position in its silo when it was removed */
      index: number
      title?: string
      children: ClosedChild[]
    }

const MAX_ENTRIES = 25

/**
 * Recently closed pop-up tabs and removed sidebar tabs, newest first (⌘⇧T reopens them).
 * Runtime-only. Silos aren't recorded: deleting one wipes its logins, so it can't come back.
 */
export const useRecentlyClosedStore = defineStore('recentlyClosed', () => {
  const entries = ref<ClosedEntry[]>([])

  function push(entry: ClosedEntry): void {
    entries.value.unshift(entry)
    if (entries.value.length > MAX_ENTRIES) entries.value.length = MAX_ENTRIES
  }

  function recordChild(parentTabId: string, groupId: string, child: ClosedChild): void {
    if (!child.url || child.url === 'about:blank') return
    push({
      kind: 'child',
      id: crypto.randomUUID(),
      closedAt: Date.now(),
      parentTabId,
      groupId,
      ...child
    })
  }

  function recordTab(tab: TabItem, index: number, children: ClosedChild[]): void {
    push({
      kind: 'tab',
      id: crypto.randomUUID(),
      closedAt: Date.now(),
      index,
      title: tab.currentTitle,
      children,
      tab: {
        id: tab.id,
        groupId: tab.groupId,
        name: tab.name,
        url: tab.url,
        iconUrl: tab.iconUrl,
        iconEmoji: tab.iconEmoji,
        notificationsEnabled: tab.notificationsEnabled,
        isMuted: tab.isMuted,
        sleepAfterMinutes: tab.sleepAfterMinutes,
        zoomLevel: tab.zoomLevel,
        userAgent: tab.userAgent,
        shortcut: tab.shortcut
      }
    })
  }

  /** Whether the silo (and for pop-ups, the parent tab) it belonged to still exists. */
  function canRestore(entry: ClosedEntry): boolean {
    const groupsStore = useGroupsStore()
    if (entry.kind === 'child') {
      const parent = groupsStore.findTab(entry.parentTabId)
      return !!parent && parent.groupId === entry.groupId
    }
    return !!groupsStore.findGroup(entry.tab.groupId) && !groupsStore.findTab(entry.tab.id)
  }

  /** Entries that can still be reopened (for the command bar). */
  function restorable(): ClosedEntry[] {
    return entries.value.filter(canRestore)
  }

  function restore(entry: ClosedEntry): void {
    const groupsStore = useGroupsStore()
    const topbarStore = useTopbarTabsStore()
    if (entry.kind === 'child') {
      groupsStore.activateTab(entry.parentTabId)
      topbarStore.addChildTab(entry.parentTabId, entry.groupId, entry.url)
      return
    }
    const tab = groupsStore.restoreTab(entry.tab, entry.index)
    if (!tab) return
    groupsStore.activateTab(tab.id)
    for (const child of entry.children) {
      topbarStore.addChildTab(tab.id, tab.groupId, child.url, { activate: false, load: false })
    }
    // Land on the restored sidebar tab itself, with its pop-ups back in the top bar
    if (entry.children.length > 0) topbarStore.activateMainTab()
  }

  /** ⌘⇧T: reopens the most recent entry that can still be restored. */
  function reopenLast(): boolean {
    while (entries.value.length > 0) {
      const entry = entries.value.shift()!
      if (canRestore(entry)) {
        restore(entry)
        return true
      }
    }
    return false
  }

  function reopen(id: string): boolean {
    const idx = entries.value.findIndex((e) => e.id === id)
    if (idx === -1) return false
    const [entry] = entries.value.splice(idx, 1)
    if (!canRestore(entry)) return false
    restore(entry)
    return true
  }

  return { entries, recordChild, recordTab, restorable, reopenLast, reopen }
})
