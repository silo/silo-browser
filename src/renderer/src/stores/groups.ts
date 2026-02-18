import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import type { GroupItem, TabItem } from '@renderer/types'
import { useTopbarTabsStore } from './topbar-tabs'

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref<GroupItem[]>([])
  const activeTabId = ref<string | null>(null)

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
    sortedGroups.value.flatMap((g) =>
      [...g.tabs].sort((a, b) => a.order - b.order)
    )
  )

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

  function addGroup(name: string, color: string): GroupItem {
    const group: GroupItem = {
      id: crypto.randomUUID(),
      name,
      color,
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
    updates: Partial<Pick<GroupItem, 'name' | 'color' | 'userAgent'>>
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
      isMuted: false
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

  function updateTab(
    tabId: string,
    updates: Partial<
      Pick<TabItem, 'name' | 'url' | 'iconUrl' | 'iconEmoji' | 'notificationsEnabled' | 'isMuted'>
    >
  ): void {
    const tab = findTab(tabId)
    if (tab) {
      Object.assign(tab, updates)
      debouncedSave()
    }
  }

  function activateTab(tabId: string): void {
    const tab = findTab(tabId)
    if (tab) {
      tab.isLoaded = true
      tab.notificationCount = 0
      activeTabId.value = tabId
      debouncedSave()
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
          order: rawGroup.order,
          isCollapsed: rawGroup.isCollapsed,
          userAgent: rawGroup.userAgent,
          tabs: rawGroup.tabs.map((t) => ({
            id: t.id,
            groupId: t.groupId,
            name: t.name,
            url: t.url,
            iconUrl: t.iconUrl,
            iconEmoji: t.iconEmoji,
            order: t.order,
            notificationsEnabled: t.notificationsEnabled,
            isMuted: t.isMuted
          }))
        }
      })
      window.api.saveGroupsAndActiveTab(raw, activeTabId.value)
    }, 500)
  }

  async function loadFromDisk(preloaded?: unknown): Promise<void> {
    const state = (preloaded ?? await window.api.getState()) as Record<string, unknown>
    groups.value = (state.groups ?? []) as GroupItem[]
    activeTabId.value = (state.activeTabId as string | null) ?? null
    for (const group of groups.value) {
      for (const tab of group.tabs) {
        tab.isLoaded = false
        tab.isAudioPlaying = false
        tab.notificationCount = tab.notificationCount ?? 0
        tab.notificationsEnabled = tab.notificationsEnabled ?? true
        tab.isMuted = tab.isMuted ?? false
      }
    }
    // Mark the active tab as loaded so its webview renders on startup
    if (activeTabId.value) {
      const activeTab = findTab(activeTabId.value)
      if (activeTab) activeTab.isLoaded = true
    }
  }

  return {
    groups,
    activeTabId,
    sortedGroups,
    activeTab,
    activeGroup,
    allLoadedTabs,
    totalNotifications,
    allTabsFlat,
    findTab,
    findGroup,
    addGroup,
    removeGroup,
    updateGroup,
    addTab,
    removeTab,
    updateTab,
    activateTab,
    toggleGroupCollapse,
    moveGroup,
    moveTab,
    setTabCurrentUrl,
    setTabCurrentTitle,
    incrementNotification,
    setTabAudioPlaying,
    loadFromDisk
  }
})
