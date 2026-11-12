<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import AppIcon from '@renderer/components/common/AppIcon.vue'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
const webviewRegistry = useWebviewRegistry()

// Reopens with the previous search, like Chrome
const searchText = ref(uiStore.lastFindText)
const activeMatchOrdinal = ref(0)
const totalMatches = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
  attachWebviewListener()
  // Opened by ⌘G / ⌘⇧G: search in that direction; opened by ⌘F: start from the top
  const cmd = takeFindCommand()
  if (searchText.value) find(cmd?.dir ?? 1)
})

function getWebview(): Electron.WebviewTag | null {
  return webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
}

function find(dir: 1 | -1 = 1): void {
  const wv = getWebview()
  if (!wv || !searchText.value) return
  wv.findInPage(searchText.value, { forward: dir > 0 })
}

/** The pending ⌘G / ⌘⇧G from the menu, if any (each is handled once). */
function takeFindCommand(): { dir: 1 | -1 } | null {
  const cmd = uiStore.findCommand
  if (cmd) uiStore.findCommand = null
  return cmd
}

function findNext(): void {
  const wv = getWebview()
  if (!wv || !searchText.value) return
  wv.findInPage(searchText.value, { findNext: true })
}

function findPrevious(): void {
  const wv = getWebview()
  if (!wv || !searchText.value) return
  wv.findInPage(searchText.value, { findNext: true, forward: false })
}

function close(): void {
  const wv = getWebview()
  wv?.stopFindInPage('clearSelection')
  searchText.value = ''
  activeMatchOrdinal.value = 0
  totalMatches.value = 0
  uiStore.closeFindBar()
}

// ⌘G / ⌘⇧G from the menu while the bar is open (when it was closed, onMounted handles it)
watch(
  () => uiStore.findCommand,
  () => {
    const cmd = takeFindCommand()
    if (!cmd || !searchText.value) return
    if (cmd.dir > 0) findNext()
    else findPrevious()
  }
)

watch(searchText, (val) => {
  if (val) {
    uiStore.lastFindText = val
    find()
  } else {
    const wv = getWebview()
    wv?.stopFindInPage('clearSelection')
    activeMatchOrdinal.value = 0
    totalMatches.value = 0
  }
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function handleFoundInPage(event: any): void {
  if (event.result) {
    activeMatchOrdinal.value = event.result.activeMatchOrdinal
    totalMatches.value = event.result.matches
  }
}

let currentWebview: Electron.WebviewTag | null = null

function attachWebviewListener(): void {
  const wv = getWebview()
  if (wv === currentWebview) return
  if (currentWebview) {
    currentWebview.removeEventListener('found-in-page', handleFoundInPage)
  }
  currentWebview = wv
  if (wv) {
    wv.addEventListener('found-in-page', handleFoundInPage)
  }
}

watch(
  [() => groupsStore.activeTabId, () => topbarStore.activeTopbarTabId],
  attachWebviewListener
)

onUnmounted(() => {
  if (currentWebview) {
    currentWebview.removeEventListener('found-in-page', handleFoundInPage)
  }
  const wv = getWebview()
  wv?.stopFindInPage('clearSelection')
})

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.stopPropagation()
    close()
  }
  if (e.key === 'Enter') {
    e.preventDefault()
    if (e.shiftKey) findPrevious()
    else findNext()
  }
}
</script>

<template>
  <div
    role="search"
    class="absolute top-3 right-3 z-30 flex items-center gap-1 rounded-xl bg-panel py-1 pr-1 pl-2.5 shadow-menu"
    @keydown="handleKeydown"
  >
    <AppIcon name="search" :size="14" :stroke="2.1" class="text-fg3" />
    <input
      ref="inputRef"
      v-model="searchText"
      type="text"
      aria-label="Find in page"
      placeholder="Find in page"
      class="h-7 w-52 border-0 bg-transparent px-1 text-[13px] text-fg1 outline-none placeholder:text-fg3"
    />
    <span v-if="searchText" class="font-mono text-[11px] whitespace-nowrap text-fg3">
      {{ totalMatches > 0 ? `${activeMatchOrdinal}/${totalMatches}` : 'No matches' }}
    </span>
    <span class="mx-1 h-4 w-px bg-line" aria-hidden="true" />
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
      aria-label="Previous match"
      title="Previous (Shift+Enter)"
      @click="findPrevious"
    >
      <AppIcon name="chevron" :size="14" :stroke="2.2" class="rotate-180" />
    </button>
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
      aria-label="Next match"
      title="Next (Enter)"
      @click="findNext"
    >
      <AppIcon name="chevron" :size="14" :stroke="2.2" />
    </button>
    <button
      type="button"
      class="flex h-7 w-7 items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1"
      aria-label="Close find bar"
      title="Close (Esc)"
      @click="close"
    >
      <AppIcon name="close" :size="12" :stroke="2.4" />
    </button>
  </div>
</template>
