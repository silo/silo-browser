import { defineStore } from 'pinia'
import { ref, computed, toRaw } from 'vue'
import { useGroupsStore } from './groups'
import type { ChildTab } from '@renderer/types'

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
        isAudioPlaying: false
      }))

    const restoredActiveId = (state.activeChildTabId as string | null) ?? null
    if (restoredActiveId && childTabs.value.find((ct) => ct.id === restoredActiveId)) {
      activeChildTabId.value = restoredActiveId
    } else {
      activeChildTabId.value = null
    }
  }

  function addChildTab(parentTabId: string, groupId: string, url: string): ChildTab {
    const child: ChildTab = {
      id: crypto.randomUUID(),
      parentTabId,
      groupId,
      url,
      currentUrl: url
    }
    childTabs.value.push(child)
    activeChildTabId.value = child.id
    debouncedSave()
    return child
  }

  function removeChildTab(childId: string): void {
    const idx = childTabs.value.findIndex((ct) => ct.id === childId)
    if (idx === -1) return
    const removed = childTabs.value[idx]
    childTabs.value.splice(idx, 1)

    if (activeChildTabId.value === childId) {
      const siblings = childTabs.value.filter((ct) => ct.parentTabId === removed.parentTabId)
      activeChildTabId.value = siblings.length > 0 ? siblings[siblings.length - 1].id : null
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

  function findChild(childId: string): ChildTab | undefined {
    return childTabs.value.find((ct) => ct.id === childId)
  }

  return {
    childTabs,
    activeChildTabId,
    currentChildTabs,
    activeTopbarTabId,
    isChildActive,
    loadFromDisk,
    addChildTab,
    removeChildTab,
    removeAllChildTabs,
    activateMainTab,
    activateChildTab,
    setChildCurrentUrl,
    setChildCurrentTitle,
    setChildIconUrl,
    setChildAudioPlaying,
    findChild
  }
})
