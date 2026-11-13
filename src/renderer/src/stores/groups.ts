import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { GroupItem, MediaCapture, SiloIcon, TabItem } from '@renderer/types'
import { applyPatchToGroups, type SyncPatch } from '../../../shared/sync-model'
import { useTopbarTabsStore } from './topbar-tabs'
import { useUiStore } from './ui'
import { useRecentlyClosedStore, type ClosedTabSnapshot } from './recently-closed'

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<GroupItem[]>([])
  const activeTabId = ref<string | null>(null)
  // Runtime-only: last tab used in each silo, so switching silos in the rail returns to it
  const lastTabBySilo = ref<Record<string, string>>({})
  // False until the saved state has been read — keeps the Welcome screen from flashing on launch
  const loaded = ref(false)

  // --- Getters ---

  const sortedGroups = computed(() => [...groups.value].sort((a, b) => a.order - b.order))

  const activeTab = computed<TabItem | null>(() => {
    if (!activeTabId.value) return null
    for (const group of groups.value) {
      const tab = group.tabs.find((t) => t.id === activeTabId.value)
      if (tab) return tab
    }
    return null
  })

  const activeGroup = computed<GroupItem | null>(() => {
    if (!activeTab.value) return null
    return groups.value.find((g) => g.id === activeTab.value!.groupId) ?? null
  })

  const allLoadedTabs = computed<TabItem[]>(() => {
    const loaded: TabItem[] = []
    for (const group of groups.value) {
      for (const tab of group.tabs) {
        if (tab.isLoaded) loaded.push(tab)
      }
    }
    return loaded
  })

  const totalNotifications = computed(() => {
    let count = 0
    for (const group of groups.value) {
      for (const tab of group.tabs) {
        count += tab.notificationCount
      }
    }
    return count
  })

  const allTabsFlat = computed<TabItem[]>(() =>
    sortedGroups.value.flatMap((g) => [...g.tabs].sort((a, b) => a.order - b.order))
  )

  /**
   * The silo you're "in": the rail's selected silo (set while it has no active tab),
   * else the active tab's silo. ⌘T, ⌘1–9 and tab cycling act on it.
   */
  const currentGroup = computed<GroupItem | null>(() => {
    const railId = useUiStore().railSiloId
    return (railId && findGroup(railId)) || activeGroup.value || sortedGroups.value[0] || null
  })

  function sortedTabsOf(group: GroupItem): TabItem[] {
    return [...group.tabs].sort((a, b) => a.order - b.order)
  }

  /**
   * ⌘1–8 open the Nth tab of the current silo and ⌘9 its last tab (like Chrome).
   * Returns the digit for a tab, or null when it has no position shortcut.
   */
  /** The position shortcut a tab has while its own silo is the current one. */
  function positionDigitOf(tab: TabItem): number | null {
    const group = findGroup(tab.groupId)
    if (!group) return null
    const tabs = sortedTabsOf(group)
    const i = tabs.findIndex((t) => t.id === tab.id)
    if (i === -1) return null
    if (i < 8) return i + 1
    return i === tabs.length - 1 ? 9 : null
  }

  const positionDigits = computed<Map<string, number>>(() => {
    const map = new Map<string, number>()
    const group = currentGroup.value
    if (!group) return map
    const tabs = sortedTabsOf(group)
    tabs.slice(0, 8).forEach((t, i) => map.set(t.id, i + 1))
    const last = tabs[tabs.length - 1]
    if (last && !map.has(last.id)) map.set(last.id, 9)
    return map
  })

  // --- Helpers ---

  function findTab(tabId: string): TabItem | null {
    for (const group of groups.value) {
      const tab = group.tabs.find((t) => t.id === tabId)
      if (tab) return tab
    }
    return null
  }

  function findGroup(groupId: string): GroupItem | null {
    return groups.value.find((g) => g.id === groupId) ?? null
  }

  // --- Actions ---

  function addGroup(name: string, color: string, icon?: SiloIcon): GroupItem {
    const group: GroupItem = {
      id: crypto.randomUUID(),
      name,
      color,
      icon,
      order: groups.value.length,
      isCollapsed: false,
      tabs: []
    }
    groups.value.push(group)
    debouncedSave()
    return group
  }

  function removeGroup(groupId: string): void {
    const idx = groups.value.findIndex((g) => g.id === groupId)
    if (idx !== -1) {
      const topbarStore = useTopbarTabsStore()
      for (const tab of groups.value[idx].tabs) {
        topbarStore.removeAllChildTabs(tab.id)
      }
      groups.value.splice(idx, 1)
      if (activeTab.value && activeTab.value.groupId === groupId) {
        activeTabId.value = null
      }
      window.api.clearGroupSession(groupId)
      debouncedSave()
    }
  }

  function updateGroup(
    groupId: string,
    updates: Partial<Pick<GroupItem, 'name' | 'color' | 'icon' | 'userAgent' | 'localOnly'>>
  ): void {
    const group = findGroup(groupId)
    if (group) {
      Object.assign(group, updates)
      debouncedSave()
    }
  }

  function addTab(groupId: string, name: string, url: string, iconUrl?: string): TabItem {
    const group = findGroup(groupId)
    if (!group) throw new Error(`Group ${groupId} not found`)
    const tab: TabItem = {
      id: crypto.randomUUID(),
      groupId,
      name,
      url,
      iconUrl,
      order: group.tabs.length,
      isLoaded: false,
      notificationsEnabled: true,
      notificationCount: 0,
      sleepAfterMinutes: useUiStore().defaultSleepAfterMinutes,
      isMuted: false,
      zoomLevel: 0
    }
    group.tabs.push(tab)
    debouncedSave()
    return tab
  }

  function removeTab(tabId: string): void {
    for (const group of groups.value) {
      const idx = group.tabs.findIndex((t) => t.id === tabId)
      if (idx !== -1) {
        const topbarStore = useTopbarTabsStore()
        // Remember it (with its pop-up tabs) so ⌘⇧T can bring it back
        const tab = group.tabs[idx]
        const children = topbarStore.childTabs
          .filter((ct) => ct.parentTabId === tabId)
          .map((ct) => ({
            url: ct.currentUrl || ct.url,
            title: ct.currentTitle,
            iconUrl: ct.iconUrl
          }))
        const position = sortedTabsOf(group).findIndex((t) => t.id === tabId)
        useRecentlyClosedStore().recordTab(tab, position, children)
        topbarStore.removeAllChildTabs(tabId)
        group.tabs.splice(idx, 1)
        if (activeTabId.value === tabId) {
          activeTabId.value = null
        }
        debouncedSave()
        return
      }
    }
  }

  /** Puts a removed tab back into its silo at `index` (⌘⇧T). Returns null if the silo is gone. */
  function restoreTab(snapshot: ClosedTabSnapshot, index: number): TabItem | null {
    const group = findGroup(snapshot.groupId)
    if (!group || findTab(snapshot.id)) return null
    const tab: TabItem = {
      ...snapshot,
      order: 0,
      isLoaded: false,
      notificationCount: 0,
      isAudioPlaying: false,
      isAsleep: false
    }
    group.tabs.push(tab)
    // The reactive copy, so later updates are tracked
    const restored = group.tabs[group.tabs.length - 1]
    const others = sortedTabsOf(group).filter((t) => t.id !== restored.id)
    others.splice(Math.max(0, Math.min(index, others.length)), 0, restored)
    others.forEach((t, i) => (t.order = i))
    debouncedSave()
    return restored
  }

  function updateTab(
    tabId: string,
    updates: Partial<
      Pick<
        TabItem,
        | 'name'
        | 'url'
        | 'iconUrl'
        | 'iconEmoji'
        | 'notificationsEnabled'
        | 'isMuted'
        | 'sleepAfterMinutes'
        | 'userAgent'
        | 'shortcut'
      >
    >
  ): void {
    const tab = findTab(tabId)
    if (tab) {
      Object.assign(tab, updates)
      debouncedSave()
    }
  }

  function activateTab(tabId: string): void {
    // Mark the previously active tab with a deactivation timestamp for sleep tracking
    if (activeTabId.value && activeTabId.value !== tabId) {
      const prev = findTab(activeTabId.value)
      if (prev) prev.lastActiveAt = Date.now()
    }
    const tab = findTab(tabId)
    if (tab) {
      tab.isLoaded = true
      tab.isAsleep = false
      tab.notificationCount = 0
      tab.lastActiveAt = undefined // active tab never sleeps
      activeTabId.value = tabId
      lastTabBySilo.value[tab.groupId] = tabId
      const ui = useUiStore()
      // The current silo follows the active tab again (in every layout, not just the rail)
      ui.setRailSilo(null)
      ui.closeSettingsPage()
      debouncedSave()
    }
  }

  /**
   * Opens a silo: selects it in the rail and returns to the tab you last used there
   * (else its first tab). Used by the rail and by ⌃1–9 / Alt+1–9.
   */
  function openSilo(groupId: string): void {
    const group = findGroup(groupId)
    if (!group) return
    const lastId = lastTabBySilo.value[group.id]
    const target = (lastId && group.tabs.find((t) => t.id === lastId)) || sortedTabsOf(group)[0]
    if (target && target.id !== activeTabId.value) {
      activateTab(target.id)
    } else if (useUiStore().sidebarLayout === 'rail') {
      // An empty silo: the rail shows it selected until a tab is activated (activateTab clears
      // it). The one-sidebar layout has no such selection, so it isn't set there — it would
      // silently retarget ⌘T / ⌘1–9 to a silo you can't see is "current".
      useUiStore().setRailSilo(group.id)
    }
  }

  function toggleGroupCollapse(groupId: string): void {
    const group = findGroup(groupId)
    if (group) {
      group.isCollapsed = !group.isCollapsed
      debouncedSave()
    }
  }

  // --- Reordering ---

  function moveGroup(groupId: string, newIndex: number): void {
    const sorted = [...groups.value].sort((a, b) => a.order - b.order)
    const oldIndex = sorted.findIndex((g) => g.id === groupId)
    if (oldIndex === -1 || oldIndex === newIndex) return
    const [moved] = sorted.splice(oldIndex, 1)
    const adjusted = newIndex > oldIndex ? newIndex - 1 : newIndex
    sorted.splice(adjusted, 0, moved)
    sorted.forEach((g, i) => (g.order = i))
    debouncedSave()
  }

  function moveTab(tabId: string, targetGroupId: string, newIndex: number): void {
    let sourceGroup: GroupItem | null = null
    let tabIdx = -1
    for (const group of groups.value) {
      const idx = group.tabs.findIndex((t) => t.id === tabId)
      if (idx !== -1) {
        sourceGroup = group
        tabIdx = idx
        break
      }
    }
    if (!sourceGroup || tabIdx === -1) return

    const targetGroup = findGroup(targetGroupId)
    if (!targetGroup) return

    const [tab] = sourceGroup.tabs.splice(tabIdx, 1)
    const crossGroup = sourceGroup.id !== targetGroup.id
    tab.groupId = targetGroupId
    const adjustedIndex = !crossGroup && tabIdx < newIndex ? newIndex - 1 : newIndex
    targetGroup.tabs.splice(adjustedIndex, 0, tab)
    sourceGroup.tabs.forEach((t, i) => (t.order = i))
    targetGroup.tabs.forEach((t, i) => (t.order = i))

    if (crossGroup) {
      const topbarStore = useTopbarTabsStore()
      topbarStore.removeAllChildTabs(tabId)
      tab.currentUrl = undefined
      tab.currentTitle = undefined
      tab.notificationCount = 0
      tab.isAudioPlaying = false
      tab.capture = undefined
    }

    debouncedSave()
  }

  // --- Webview runtime updates ---

  function setTabCurrentUrl(tabId: string, url: string): void {
    const tab = findTab(tabId)
    if (tab) tab.currentUrl = url
  }

  function setTabCurrentTitle(tabId: string, title: string): void {
    const tab = findTab(tabId)
    if (tab) tab.currentTitle = title
  }

  function incrementNotification(tabId: string): void {
    const tab = findTab(tabId)
    if (tab && tab.notificationsEnabled && activeTabId.value !== tabId) {
      tab.notificationCount++
    }
  }

  function setTabAudioPlaying(tabId: string, playing: boolean): void {
    const tab = findTab(tabId)
    if (tab) tab.isAudioPlaying = playing
  }

  function setTabCapture(tabId: string, capture: MediaCapture | undefined): void {
    const tab = findTab(tabId)
    if (tab) tab.capture = capture
  }

  function setTabLoading(tabId: string, loading: boolean): void {
    const tab = findTab(tabId)
    if (tab) tab.isLoading = loading
  }

  /**
   * True while the tab or one of its pop-up tabs is on a call (camera / mic / screen) or
   * playing audible sound. Such tabs never go to sleep — sleeping would end the call.
   */
  function isTabBusy(tab: TabItem): boolean {
    const live = (c?: MediaCapture): boolean => !!c && (c.camera || c.mic || c.screen)
    if (live(tab.capture)) return true
    if (tab.isAudioPlaying && !tab.isMuted) return true
    return useTopbarTabsStore().childTabs.some(
      (ct) => ct.parentTabId === tab.id && (live(ct.capture) || (ct.isAudioPlaying && !tab.isMuted))
    )
  }

  function setTabZoomLevel(tabId: string, level: number): void {
    const tab = findTab(tabId)
    if (tab) {
      tab.zoomLevel = level
      debouncedSave()
    }
  }

  // --- Persistence ---

  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      const raw = groups.value.map((g) => {
        const rawGroup = toRaw(g)
        return {
          id: rawGroup.id,
          name: rawGroup.name,
          color: rawGroup.color,
          icon: rawGroup.icon ? { ...toRaw(rawGroup.icon) } : undefined,
          userAgent: rawGroup.userAgent,
          order: rawGroup.order,
          isCollapsed: rawGroup.isCollapsed,
          localOnly: rawGroup.localOnly || undefined,
          tabs: rawGroup.tabs.map((t) => ({
            id: t.id,
            groupId: t.groupId,
            name: t.name,
            url: t.url,
            iconUrl: t.iconUrl,
            iconEmoji: t.iconEmoji,
            order: t.order,
            notificationsEnabled: t.notificationsEnabled,
            isMuted: t.isMuted,
            sleepAfterMinutes: t.sleepAfterMinutes,
            zoomLevel: t.zoomLevel ?? 0,
            userAgent: t.userAgent,
            shortcut: t.shortcut
          }))
        }
      })
      window.api.saveGroupsAndActiveTab(raw, activeTabId.value)
    }, 500)
  }

  async function loadFromDisk(preloaded?: unknown): Promise<void> {
    const state = (preloaded ?? (await window.api.getState())) as Record<string, unknown>
    groups.value = (state.groups ?? []) as GroupItem[]
    activeTabId.value = (state.activeTabId as string | null) ?? null
    lastTabBySilo.value = {}
    for (const group of groups.value) {
      // Pre-rework silos stored an emoji in `iconEmoji`
      if (!group.icon && group.iconEmoji) group.icon = { kind: 'emoji', value: group.iconEmoji }
      delete group.iconEmoji
      if (group.localOnly !== true) delete group.localOnly
      for (const tab of group.tabs) {
        tab.isAsleep = false
        tab.isLoaded = false
        tab.isAudioPlaying = false
        tab.isLoading = false
        tab.capture = undefined
        if (typeof tab.shortcut !== 'string' || !tab.shortcut) delete tab.shortcut
        tab.notificationCount = tab.notificationCount ?? 0
        tab.notificationsEnabled = tab.notificationsEnabled ?? true
        tab.isMuted = tab.isMuted ?? false
        tab.sleepAfterMinutes = tab.sleepAfterMinutes ?? 0
        tab.zoomLevel = tab.zoomLevel ?? 0
        tab.lastActiveAt = Date.now()
      }
    }
    // Mark the active tab as loaded so its webview renders on startup
    if (activeTabId.value) {
      const activeTab = findTab(activeTabId.value)
      if (activeTab) {
        activeTab.isLoaded = true
      } else {
        activeTabId.value = null
      }
    }
    // Auto-load tabs set to never sleep so their webviews are always active
    for (const group of groups.value) {
      for (const tab of group.tabs) {
        if (tab.sleepAfterMinutes === 0 && !tab.isLoaded) {
          tab.isLoaded = true
        }
      }
    }
    loaded.value = true
    // Start sleep timer — checks every 60s for tabs that should be put to sleep
    startSleepTimer()
  }

  // --- Folder sync ---

  /** Forgets a tab's runtime state when sync removes it or moves it to another silo. */
  function detachTab(tabId: string): void {
    useTopbarTabsStore().removeAllChildTabs(tabId)
    if (activeTabId.value === tabId) activeTabId.value = null
  }

  /**
   * Applies changes made on another computer (sent by the main process, which has already saved
   * them). Open tabs are not reloaded: a changed home URL is used the next time the tab loads.
   * Silos removed here keep their logins for 30 days (see src/main/sync).
   */
  function applySyncPatch(patch: SyncPatch): void {
    const ui = useUiStore()
    applyPatchToGroups<TabItem, GroupItem>(groups.value, patch, {
      newGroup: (id, f) => ({
        id,
        name: f.name,
        color: f.color,
        icon: f.icon ?? undefined,
        userAgent: f.userAgent ?? undefined,
        order: f.order,
        isCollapsed: false,
        tabs: []
      }),
      newTab: (id, f) => ({
        id,
        groupId: f.groupId,
        name: f.name,
        url: f.url,
        iconEmoji: f.iconEmoji ?? undefined,
        order: f.order,
        isLoaded: false,
        notificationsEnabled: f.notificationsEnabled,
        notificationCount: 0,
        sleepAfterMinutes: f.sleepAfterMinutes,
        isMuted: f.isMuted,
        zoomLevel: 0,
        userAgent: f.userAgent ?? undefined,
        shortcut: f.shortcut ?? undefined,
        lastActiveAt: Date.now()
      }),
      removingTab: (tab) => detachTab(tab.id),
      removingGroup: (group) => {
        for (const tab of group.tabs) detachTab(tab.id)
        delete lastTabBySilo.value[group.id]
        if (ui.railSiloId === group.id) ui.setRailSilo(null)
      },
      movedTab: (tab) => {
        // Same as moving it yourself: pop-ups and page state belong to the old silo's session
        detachTab(tab.id)
        tab.currentUrl = undefined
        tab.currentTitle = undefined
        tab.notificationCount = 0
        tab.isAudioPlaying = false
        tab.capture = undefined
      }
    })
    debouncedSave()
  }

  let sleepTimerInterval: ReturnType<typeof setInterval> | null = null

  function startSleepTimer(): void {
    if (sleepTimerInterval) return
    sleepTimerInterval = setInterval(() => {
      const now = Date.now()
      for (const group of groups.value) {
        for (const tab of group.tabs) {
          if (
            tab.isLoaded &&
            tab.sleepAfterMinutes > 0 &&
            tab.id !== activeTabId.value &&
            tab.lastActiveAt &&
            now - tab.lastActiveAt >= tab.sleepAfterMinutes * 60_000 &&
            !isTabBusy(tab)
          ) {
            tab.isLoaded = false
            tab.isAsleep = true
            useTopbarTabsStore().unloadChildTabs(tab.id)
          }
        }
      }
    }, 60_000)
  }

  /** Puts a tab to sleep now (unloads its webview) — same as the idle timer would. */
  function sleepTab(tabId: string): void {
    const tab = findTab(tabId)
    if (!tab || tab.id === activeTabId.value || !tab.isLoaded || isTabBusy(tab)) return
    tab.isLoaded = false
    tab.isAsleep = true
    useTopbarTabsStore().unloadChildTabs(tab.id)
  }

  return {
    groups,
    activeTabId,
    lastTabBySilo,
    loaded,
    sleepTab,
    sortedGroups,
    activeTab,
    activeGroup,
    allLoadedTabs,
    totalNotifications,
    allTabsFlat,
    currentGroup,
    positionDigits,
    positionDigitOf,
    sortedTabsOf,
    findTab,
    findGroup,
    addGroup,
    removeGroup,
    updateGroup,
    addTab,
    removeTab,
    restoreTab,
    updateTab,
    activateTab,
    openSilo,
    toggleGroupCollapse,
    moveGroup,
    moveTab,
    setTabCurrentUrl,
    setTabCurrentTitle,
    incrementNotification,
    setTabAudioPlaying,
    setTabCapture,
    setTabLoading,
    isTabBusy,
    setTabZoomLevel,
    applySyncPatch,
    loadFromDisk
  }
})
