<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
const webviewRegistry = useWebviewRegistry()
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

function getActiveWebview(): Electron.WebviewTag | null {
  return webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
}

function goBack(): void {
  getActiveWebview()?.goBack()
}

function goForward(): void {
  getActiveWebview()?.goForward()
}

function reload(): void {
  getActiveWebview()?.reload()
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
  const wv = getActiveWebview()
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
    const wv = webviewRegistry.getMain(tab.id)
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
      'flex items-center gap-1.5 pr-2 py-2 bg-surface-chrome border-b border-chrome-border',
      isMac ? 'app-drag' : '',
      isMac && !uiStore.sidebarExpanded ? 'pl-8' : 'pl-2'
    ]"
  >
    <button
      @click="goBack"
      class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Back"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" />
      </svg>
    </button>

    <button
      @click="goForward"
      class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      title="Forward"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M8.22 5.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L11.94 10 8.22 6.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" />
      </svg>
    </button>

    <button
      @click="reload"
      class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
      title="Reload"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z" clip-rule="evenodd" />
      </svg>
    </button>

    <!-- Home — navigate primary tab back to its original URL -->
    <button
      @click="goHome"
      :class="[
        'app-no-drag p-1 rounded transition-colors',
        topbarStore.currentChildTabs.length > 0 && !topbarStore.isChildActive
          ? 'bg-chrome-active text-chrome-fg-primary'
          : 'text-chrome-fg-secondary hover:bg-chrome-hover/50'
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
          'flex items-center gap-1 px-2 py-1.5 text-xs leading-none rounded shrink-0 transition-colors',
          topbarStore.activeTopbarTabId === child.id
            ? 'bg-chrome-active text-chrome-fg-primary'
            : 'text-chrome-fg-secondary hover:bg-chrome-hover/50'
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
          class="w-3 h-3 shrink-0 text-accent-soft"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19.114 5.636a9 9 0 0 1 0 12.728M16.463 8.288a5.25 5.25 0 0 1 0 7.424M6.75 8.25l4.72-4.72a.75.75 0 0 1 1.28.53v15.88a.75.75 0 0 1-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.009 9.009 0 0 1 2.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75Z" />
        </svg>
        <button
          @click.stop="topbarStore.removeChildTab(child.id)"
          class="text-chrome-fg-muted hover:text-chrome-fg-primary shrink-0 leading-none"
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
      class="app-no-drag flex items-center gap-1.5 px-2 py-1 bg-chrome-hover/50 border border-chrome-border rounded text-sm leading-none text-chrome-fg-muted hover:text-chrome-fg-secondary hover:bg-chrome-hover transition-colors max-w-[240px]"
      title="Navigate to URL (Cmd+L)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clip-rule="evenodd" />
      </svg>
      <span class="truncate">{{ currentDomain || 'Enter URL' }}</span>
    </button>

    <button
      @click="openExternal"
      class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
      title="Open in default browser"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
        <path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z" clip-rule="evenodd" />
        <path fill-rule="evenodd" d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z" clip-rule="evenodd" />
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
      <div class="bg-surface-chrome rounded-lg shadow-2xl border border-chrome-border w-[560px] p-3">
        <input
          ref="urlInputRef"
          v-model="urlInput"
          type="text"
          class="nav-url-input w-full px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary focus:outline-none focus:border-accent-soft focus:text-chrome-fg-primary"
          placeholder="Enter URL and press Enter"
          @keydown.enter="navigateToUrl"
          @keydown.escape="closeUrlBar"
        />
      </div>
    </div>
  </Teleport>
</template>
