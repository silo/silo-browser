<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
const isMac = window.api.platform === 'darwin'

const urlInput = ref('')
const urlInputRef = ref<HTMLInputElement | null>(null)

const displayUrl = computed(() => {
  if (topbarStore.isChildActive) {
    const child = topbarStore.findChild(topbarStore.activeTopbarTabId!)
    return child?.currentUrl || child?.url || ''
  }
  const tab = groupsStore.activeTab
  if (!tab) return ''
  return tab.currentUrl || tab.url
})

const currentDomain = computed(() => {
  const url = displayUrl.value
  if (!url) return ''
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
})

const activeWebview = computed<Electron.WebviewTag | null>(() => {
  if (topbarStore.isChildActive) {
    return document.querySelector(
      `webview[data-child-tab-id="${topbarStore.activeTopbarTabId}"]`
    ) as Electron.WebviewTag | null
  }
  if (!groupsStore.activeTabId) return null
  return document.querySelector(
    `webview[data-tab-id="${groupsStore.activeTabId}"]`
  ) as Electron.WebviewTag | null
})

function goBack(): void {
  activeWebview.value?.goBack()
}

function goForward(): void {
  activeWebview.value?.goForward()
}

function reload(): void {
  activeWebview.value?.reload()
}

function openUrlBar(): void {
  urlInput.value = displayUrl.value
  uiStore.openUrlBar()
  nextTick(() => {
    urlInputRef.value?.focus()
    urlInputRef.value?.select()
  })
}

function closeUrlBar(): void {
  uiStore.closeUrlBar()
}

// Re-focus input when urlBarOpen becomes true externally (e.g. Cmd+L)
watch(
  () => uiStore.urlBarOpen,
  (open) => {
    if (open) {
      urlInput.value = displayUrl.value
      nextTick(() => {
        urlInputRef.value?.focus()
        urlInputRef.value?.select()
      })
    }
  }
)

function navigateToUrl(): void {
  const wv = activeWebview.value
  if (!wv) return
  let url = urlInput.value.trim()
  if (!url) return
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`
  }
  wv.loadURL(url)
  closeUrlBar()
}

function goHome(): void {
  const tab = groupsStore.activeTab
  if (!tab) return
  if (topbarStore.isChildActive) {
    // On a child tab — just switch back to the primary tab, don't reload
    topbarStore.activateMainTab()
  } else {
    // Already on the primary tab — navigate back to its original URL
    const wv = document.querySelector(
      `webview[data-tab-id="${tab.id}"]`
    ) as Electron.WebviewTag | null
    if (wv) wv.loadURL(tab.url)
  }
}

function openExternal(): void {
  window.api.openExternal(displayUrl.value)
}

function childTabLabel(child: { currentTitle?: string; url: string }): string {
  if (child.currentTitle) return child.currentTitle
  try {
    return new URL(child.url).hostname
  } catch {
    return child.url
  }
}
</script>

<template>
  <div
    v-if="groupsStore.activeTab"
    :class="[
      'flex items-center gap-1.5 pr-2 py-1.5 bg-gray-800 border-b border-gray-700',
      isMac ? 'app-drag' : '',
      isMac && !uiStore.sidebarExpanded ? 'pl-4' : 'pl-2'
    ]"
  >
    <button
      @click="goBack"
      class="app-no-drag p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Back"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
      </svg>
    </button>

    <button
      @click="goForward"
      class="app-no-drag p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Forward"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clip-rule="evenodd" />
      </svg>
    </button>

    <button
      @click="reload"
      class="app-no-drag p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
      title="Reload"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-1.873-7.263a.75.75 0 00-1.5 0v2.033l-.312-.31A7 7 0 00.085 9.021a.75.75 0 001.449.39 5.5 5.5 0 019.201-2.466l.312.311H8.614a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V4.161z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Home — navigate primary tab back to its original URL -->
    <button
      @click="goHome"
      :class="[
        'app-no-drag p-1 rounded transition-colors',
        topbarStore.currentChildTabs.length > 0 && !topbarStore.isChildActive
          ? 'bg-gray-600 text-white'
          : 'text-gray-400 hover:text-white hover:bg-gray-700'
      ]"
      title="Go to home URL"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M9.293 2.293a1 1 0 011.414 0l7 7A1 1 0 0117 11h-1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-3a1 1 0 00-1-1H9a1 1 0 00-1 1v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-6H3a1 1 0 01-.707-1.707l7-7z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Topbar tabs (only when child tabs exist) -->
    <div
      v-if="topbarStore.currentChildTabs.length > 0"
      class="app-no-drag flex items-center gap-0.5 mx-1 overflow-x-auto shrink-0 max-w-[50%]"
    >
      <!-- Child tabs -->
      <div
        v-for="child in topbarStore.currentChildTabs"
        :key="child.id"
        :class="[
          'flex items-center gap-1 px-2 py-0.5 text-xs rounded shrink-0 transition-colors',
          topbarStore.activeTopbarTabId === child.id
            ? 'bg-gray-600 text-white'
            : 'text-gray-400 hover:bg-gray-700 hover:text-white'
        ]"
      >
        <button
          @click="topbarStore.activateChildTab(child.id)"
          class="truncate max-w-[100px]"
          :title="childTabLabel(child)"
        >
          {{ childTabLabel(child) }}
        </button>
        <svg
          v-if="child.isAudioPlaying"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="w-3 h-3 shrink-0 text-blue-400"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
        <button
          @click.stop="topbarStore.removeChildTab(child.id)"
          class="text-gray-500 hover:text-white shrink-0 leading-none"
          title="Close tab"
        >
          &times;
        </button>
      </div>
    </div>

    <!-- Spacer to push URL button and external link to the right -->
    <div class="flex-1" />

    <!-- URL bar button (compact) -->
    <button
      @click="openUrlBar"
      class="app-no-drag flex items-center gap-1.5 px-2 py-1 bg-gray-900 border border-gray-600 rounded text-sm text-gray-400 hover:text-gray-200 hover:border-gray-500 transition-colors max-w-[240px]"
      title="Navigate to URL (Cmd+L)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clip-rule="evenodd" />
      </svg>
      <span class="truncate">{{ currentDomain || 'Enter URL' }}</span>
    </button>

    <button
      @click="openExternal"
      class="app-no-drag p-1 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
      title="Open in default browser"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 11-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clip-rule="evenodd" />
      </svg>
    </button>
  </div>

  <!-- URL bar modal -->
  <Teleport to="body">
    <div
      v-if="uiStore.urlBarOpen"
      class="fixed inset-0 z-50 flex items-start justify-center pt-24"
      @click.self="closeUrlBar"
      @keydown.escape="closeUrlBar"
    >
      <div class="bg-gray-800 rounded-lg shadow-2xl border border-gray-600 w-[560px] p-3">
        <input
          ref="urlInputRef"
          v-model="urlInput"
          type="text"
          class="nav-url-input w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-sm text-gray-300 focus:outline-none focus:border-blue-500 focus:text-white"
          placeholder="Enter URL and press Enter"
          @keydown.enter="navigateToUrl"
          @keydown.escape="closeUrlBar"
        />
      </div>
    </div>
  </Teleport>
</template>
