import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
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
  }

  function removeAllChildTabs(parentTabId: string): void {
    childTabs.value = childTabs.value.filter((ct) => ct.parentTabId !== parentTabId)
    if (activeChildTabId.value) {
      const stillExists = childTabs.value.find((ct) => ct.id === activeChildTabId.value)
      if (!stillExists) activeChildTabId.value = null
    }
  }

  function activateMainTab(): void {
    activeChildTabId.value = null
  }

  function activateChildTab(childId: string): void {
    activeChildTabId.value = childId
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
