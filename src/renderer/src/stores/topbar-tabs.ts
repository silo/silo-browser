import { defineStore } from 'pinia'
import { ref, computed, toRaw, watch } from 'vue'
import { useGroupsStore } from './groups'
import { useRecentlyClosedStore } from './recently-closed'
import type { ChildTab, MediaCapture } from '@renderer/types'

export const useTopbarTabsStore = defineStore('topbarTabs', () => {
  const childTabs = ref<ChildTab[]>([])
  const activeChildTabId = ref<string | null>(null)

  const groupsStore = useGroupsStore()

  const currentChildTabs = computed(() => {
    const parentId = groupsStore.activeTabId
    if (!parentId) return []
    return childTabs.value.filter((ct) => ct.parentTabId === parentId)
  })

  const activeTopbarTabId = computed(() => {
    if (activeChildTabId.value) {
      const child = childTabs.value.find((ct) => ct.id === activeChildTabId.value)
      if (child && child.parentTabId === groupsStore.activeTabId) {
        return activeChildTabId.value
      }
    }
    return null
  })

  const isChildActive = computed(() => activeTopbarTabId.value !== null)

  // Each pop-up is a full renderer process (~100–400 MB). Ones restored from the last session
  // only get a webview once they're shown, like sidebar tabs; after that they stay loaded.
  const loadedChildTabs = computed(() =>
    childTabs.value.filter((ct) => ct.isLoaded || ct.id === activeTopbarTabId.value)
  )
  watch(activeTopbarTabId, (id) => {
    const child = id ? childTabs.value.find((ct) => ct.id === id) : undefined
    if (child && !child.isLoaded) child.isLoaded = true
  })

  let saveTimeout: ReturnType<typeof setTimeout> | null = null

  function debouncedSave(): void {
    if (saveTimeout) clearTimeout(saveTimeout)
    saveTimeout = setTimeout(() => {
      const raw = childTabs.value.map((ct) => {
        const rawChild = toRaw(ct)
        return {
          id: rawChild.id,
          parentTabId: rawChild.parentTabId,
          groupId: rawChild.groupId,
          url: rawChild.url
        }
      })
      window.api.saveChildTabs(raw, activeChildTabId.value)
    }, 500)
  }

  async function loadFromDisk(preloaded?: unknown): Promise<void> {
    const state = (preloaded ?? await window.api.getState()) as Record<string, unknown>
    const loadedChildTabs = (state.childTabs ?? []) as ChildTab[]

    const validTabIds = new Set<string>()
    const validGroupIds = new Set<string>()
    for (const group of (state.groups ?? []) as { id: string; tabs: { id: string }[] }[]) {
      validGroupIds.add(group.id)
      for (const tab of group.tabs ?? []) {
        validTabIds.add(tab.id)
      }
    }

    childTabs.value = loadedChildTabs
      .filter((ct) => validTabIds.has(ct.parentTabId) && validGroupIds.has(ct.groupId))
      .map((ct) => ({
        id: ct.id,
        parentTabId: ct.parentTabId,
        groupId: ct.groupId,
        url: ct.url,
        currentUrl: ct.url,
        currentTitle: undefined,
        iconUrl: undefined,
        isAudioPlaying: false,
        isLoading: false,
        capture: undefined,
        isLoaded: false
      }))

    const restoredActiveId = (state.activeChildTabId as string | null) ?? null
    if (restoredActiveId && childTabs.value.find((ct) => ct.id === restoredActiveId)) {
      activeChildTabId.value = restoredActiveId
    } else {
      activeChildTabId.value = null
    }
  }

  /**
   * Opens a pop-up tab under a sidebar tab. `openerId` is the pop-up it was opened from (null =
   * the sidebar tab's own page); closing it returns there. `activate: false` adds it without
   * switching to it (e.g. opened by a tab in the background). `load: false` creates it unloaded
   * (its webview is made when it's first shown).
   */
  function addChildTab(
    parentTabId: string,
    groupId: string,
    url: string,
    options: { openerId?: string | null; activate?: boolean; load?: boolean } = {}
  ): ChildTab {
    const child: ChildTab = {
      id: crypto.randomUUID(),
      parentTabId,
      groupId,
      url,
      currentUrl: url,
      openerId: options.openerId ?? null,
      isLoaded: options.load !== false
    }
    childTabs.value.push(child)
    if (options.activate !== false) activeChildTabId.value = child.id
    debouncedSave()
    return child
  }

  function removeChildTab(childId: string): void {
    const idx = childTabs.value.findIndex((ct) => ct.id === childId)
    if (idx === -1) return
    const removed = childTabs.value[idx]
    // Remember it so ⌘⇧T can reopen it
    useRecentlyClosedStore().recordChild(removed.parentTabId, removed.groupId, {
      url: removed.currentUrl || removed.url,
      title: removed.currentTitle,
      iconUrl: removed.iconUrl
    })
    childTabs.value.splice(idx, 1)

    // Pop-ups opened from the closed one now count as opened from its opener
    for (const ct of childTabs.value) {
      if (ct.openerId === childId) ct.openerId = removed.openerId ?? null
    }
    if (activeChildTabId.value === childId) {
      // Back to where it was opened from (like Chrome): its opener pop-up, else the sidebar
      // tab's own page — not whichever other pop-up happens to be last
      const opener = removed.openerId
        ? childTabs.value.find((ct) => ct.id === removed.openerId)
        : undefined
      activeChildTabId.value = opener ? opener.id : null
    }
    debouncedSave()
  }

  function removeAllChildTabs(parentTabId: string): void {
    childTabs.value = childTabs.value.filter((ct) => ct.parentTabId !== parentTabId)
    if (activeChildTabId.value) {
      const stillExists = childTabs.value.find((ct) => ct.id === activeChildTabId.value)
      if (!stillExists) activeChildTabId.value = null
    }
    debouncedSave()
  }

  /**
   * The sidebar tab went to sleep: its pop-ups stay (as pills, with their titles) but drop their
   * webviews, and load again when shown — they used to be deleted.
   */
  function unloadChildTabs(parentTabId: string): void {
    for (const ct of childTabs.value) {
      if (ct.parentTabId !== parentTabId) continue
      ct.isLoaded = false
      ct.isAudioPlaying = false
      ct.isLoading = false
      ct.capture = undefined
    }
  }

  function activateMainTab(): void {
    activeChildTabId.value = null
    debouncedSave()
  }

  function activateChildTab(childId: string): void {
    activeChildTabId.value = childId
    debouncedSave()
  }

  function setChildCurrentUrl(childId: string, url: string): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.currentUrl = url
  }

  function setChildCurrentTitle(childId: string, title: string): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.currentTitle = title
  }

  function setChildIconUrl(childId: string, iconUrl: string): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.iconUrl = iconUrl
  }

  function setChildAudioPlaying(childId: string, playing: boolean): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.isAudioPlaying = playing
  }

  function setChildCapture(childId: string, capture: MediaCapture | undefined): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.capture = capture
  }

  function setChildLoading(childId: string, loading: boolean): void {
    const child = childTabs.value.find((ct) => ct.id === childId)
    if (child) child.isLoading = loading
  }

  function findChild(childId: string): ChildTab | undefined {
    return childTabs.value.find((ct) => ct.id === childId)
  }

  return {
    childTabs,
    activeChildTabId,
    currentChildTabs,
    activeTopbarTabId,
    isChildActive,
    loadedChildTabs,
    loadFromDisk,
    addChildTab,
    removeChildTab,
    removeAllChildTabs,
    unloadChildTabs,
    activateMainTab,
    activateChildTab,
    setChildCurrentUrl,
    setChildCurrentTitle,
    setChildIconUrl,
    setChildAudioPlaying,
    setChildCapture,
    setChildLoading,
    findChild
  }
})
