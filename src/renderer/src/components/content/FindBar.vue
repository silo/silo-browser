<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
const webviewRegistry = useWebviewRegistry()

const searchText = ref('')
const activeMatchOrdinal = ref(0)
const totalMatches = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
  attachWebviewListener()
})

function getWebview(): Electron.WebviewTag | null {
  return webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
}

function find(): void {
  const wv = getWebview()
  if (!wv || !searchText.value) return
  wv.findInPage(searchText.value)
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

watch(searchText, (val) => {
  if (val) {
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
    class="flex items-center gap-2 px-3 py-1.5 bg-surface-chrome border-b border-chrome-border"
    @keydown="handleKeydown"
  >
    <input
      ref="inputRef"
      v-model="searchText"
      type="text"
      placeholder="Find in page..."
      class="px-2 py-1 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary focus:outline-none focus:border-accent-soft w-60"
    />
    <span v-if="searchText" class="text-xs text-chrome-fg-muted whitespace-nowrap">
      {{ totalMatches > 0 ? `${activeMatchOrdinal} / ${totalMatches}` : 'No matches' }}
    </span>
    <button
      @click="findPrevious"
      class="p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
      title="Previous (Shift+Enter)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clip-rule="evenodd" />
      </svg>
    </button>
    <button
      @click="findNext"
      class="p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
      title="Next (Enter)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clip-rule="evenodd" />
      </svg>
    </button>
    <button
      @click="close"
      class="p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
      title="Close (Esc)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
      </svg>
    </button>
  </div>
</template>
