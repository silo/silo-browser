<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import { useWebviewRegistry, type WebviewTag } from '@renderer/composables/useWebviewRegistry'
import { isMac, shortcut, TRAFFIC_LIGHT_INSET } from '@renderer/utils/platform'
import type { ChildTab } from '@renderer/types'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import TabIcon from '@renderer/components/common/TabIcon.vue'

// The 44px title row: back / forward / reload / home, pop-up tabs, the address button
// (opens the command bar) and "open in default browser". Doubles as the window drag area.
const props = defineProps<{ fullWidth: boolean }>()

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
const webviewRegistry = useWebviewRegistry()

const tab = computed(() => groupsStore.activeTab)
const silo = computed(() => groupsStore.activeGroup)
const activeChild = computed(() =>
  topbarStore.isChildActive ? topbarStore.findChild(topbarStore.activeTopbarTabId!) : null
)

const displayUrl = computed(() => {
  if (activeChild.value) return activeChild.value.currentUrl || activeChild.value.url
  return tab.value ? tab.value.currentUrl || tab.value.url : ''
})

const domain = computed(() => hostOf(displayUrl.value))

const title = computed(() => {
  if (activeChild.value) return activeChild.value.currentTitle || domain.value
  return tab.value?.currentTitle || tab.value?.name || ''
})

const zoomPercent = computed(() => {
  const level = tab.value?.zoomLevel ?? 0
  return Math.round(Math.pow(1.2, level) * 100)
})

// Re-evaluated whenever the URL changes (did-navigate / did-navigate-in-page update it).
// canGoBack() throws until the webview has emitted dom-ready, hence the try/catch.
function historyFlag(fn: (wv: WebviewTag) => boolean): boolean {
  void displayUrl.value
  const wv = getActiveWebview()
  if (!wv) return false
  try {
    return fn(wv)
  } catch {
    return false
  }
}
const canGoBack = computed(() => historyFlag((wv) => wv.canGoBack()))
const canGoForward = computed(() => historyFlag((wv) => wv.canGoForward()))

const paddingLeft = computed(() => {
  if (!props.fullWidth) return '0px'
  return isMac ? `${TRAFFIC_LIGHT_INSET + 2}px` : '12px'
})

function hostOf(url: string): string {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function getActiveWebview(): WebviewTag | null {
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

function goHome(): void {
  if (!tab.value) return
  if (topbarStore.isChildActive) {
    // On a pop-up tab — switch back to the primary tab, don't reload it
    topbarStore.activateMainTab()
  } else {
    webviewRegistry.getMain(tab.value.id)?.loadURL(tab.value.url)
  }
}

function openExternal(): void {
  if (displayUrl.value) window.api.openExternal(displayUrl.value)
}

function closeChildTab(childId: string): void {
  if (uiStore.confirmCloseChildTabs) {
    uiStore.openConfirmRemoveTabDialog(childId, true)
  } else {
    topbarStore.removeChildTab(childId)
  }
}

function childLabel(child: ChildTab): string {
  return child.currentTitle || hostOf(child.currentUrl || child.url)
}

const navButton =
  'app-no-drag flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg text-fg2 transition-colors hover:bg-hover hover:text-fg1 active:bg-press disabled:pointer-events-none disabled:opacity-35'
</script>

<template>
  <header
    class="app-drag flex h-11 min-w-0 items-center gap-0.5 pr-2"
    :style="{ paddingLeft }"
  >
    <template v-if="tab">
      <button
        type="button"
        :class="navButton"
        aria-label="Back"
        title="Back"
        :disabled="!canGoBack"
        @click="goBack"
      >
        <AppIcon name="back" :size="17" />
      </button>
      <button
        type="button"
        :class="navButton"
        aria-label="Forward"
        title="Forward"
        :disabled="!canGoForward"
        @click="goForward"
      >
        <AppIcon name="forward" :size="17" />
      </button>
      <button
        type="button"
        :class="navButton"
        aria-label="Reload"
        :title="`Reload (${shortcut('R')})`"
        @click="reload"
      >
        <AppIcon name="reload" :size="15" :stroke="2" />
      </button>
      <button
        type="button"
        :class="navButton"
        aria-label="Go to home URL"
        title="Go to home URL"
        @click="goHome"
      >
        <AppIcon name="home" :size="15" :stroke="2" />
      </button>

      <!-- Pop-up tabs opened from this tab -->
      <div
        v-if="topbarStore.currentChildTabs.length > 0"
        role="tablist"
        :aria-label="`Opened from ${tab.name}`"
        class="app-no-drag thin-scroll ml-2 flex min-w-0 shrink items-center gap-0.5 overflow-x-auto"
      >
        <div
          class="flex h-7 shrink-0 items-center rounded-lg px-2.5 transition-colors"
          :class="!topbarStore.isChildActive ? 'bg-tab-on shadow-tab-on' : 'hover:bg-hover'"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="!topbarStore.isChildActive"
            class="flex items-center gap-[7px]"
            :class="!topbarStore.isChildActive ? 'text-fg1' : 'text-fg2'"
            @click="topbarStore.activateMainTab()"
          >
            <TabIcon
              :name="tab.name"
              :url="tab.url"
              :icon-url="tab.iconUrl"
              :icon-emoji="tab.iconEmoji"
              :size="14"
            />
            <span
              class="max-w-[150px] truncate text-[12.5px]"
              :class="!topbarStore.isChildActive ? 'font-semibold' : 'font-medium'"
            >
              {{ tab.name }}
            </span>
          </button>
        </div>
        <div
          v-for="child in topbarStore.currentChildTabs"
          :key="child.id"
          class="flex h-7 shrink-0 items-center gap-1 rounded-lg pr-1 pl-2.5 transition-colors"
          :class="
            topbarStore.activeTopbarTabId === child.id ? 'bg-tab-on shadow-tab-on' : 'hover:bg-hover'
          "
        >
          <button
            type="button"
            role="tab"
            :aria-selected="topbarStore.activeTopbarTabId === child.id"
            class="flex min-w-0 items-center gap-[7px]"
            :class="topbarStore.activeTopbarTabId === child.id ? 'text-fg1' : 'text-fg2'"
            :title="childLabel(child)"
            @click="topbarStore.activateChildTab(child.id)"
          >
            <TabIcon
              v-if="child.iconUrl"
              :name="childLabel(child)"
              :icon-url="child.iconUrl"
              :size="14"
            />
            <AppIcon v-else name="file" :size="14" />
            <span
              class="max-w-[150px] truncate text-[12.5px]"
              :class="topbarStore.activeTopbarTabId === child.id ? 'font-semibold' : 'font-medium'"
            >
              {{ childLabel(child) }}
            </span>
            <AppIcon
              v-if="child.isAudioPlaying"
              name="audio-small"
              :size="13"
              :stroke="2"
              class="text-accent-txt"
            />
          </button>
          <button
            type="button"
            class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-fg3 transition-colors hover:bg-hover hover:text-fg1"
            :aria-label="`Close ${childLabel(child)}`"
            :title="`Close (${shortcut('W')})`"
            @click.stop="closeChildTab(child.id)"
          >
            <AppIcon name="close" :size="11" :stroke="2.5" />
          </button>
        </div>
      </div>

      <div class="ml-auto flex min-w-0 items-center gap-1 pl-2">
        <!-- Address button: opens the command bar -->
        <button
          type="button"
          class="app-no-drag flex h-8 w-[400px] min-w-[180px] max-w-full shrink items-center gap-[9px] rounded-[10px] bg-omni pr-2.5 pl-1 text-left shadow-[inset_0_0_0_1px_var(--omni-line)] transition-[filter] hover:brightness-[0.98]"
          :aria-label="`${title}, ${domain}${silo ? `, in ${silo.name} silo` : ''}. Press ${shortcut('L')} to search or enter address`"
          :title="displayUrl"
          @click="uiStore.openCommandBar()"
        >
          <span
            v-if="silo"
            class="flex h-6 max-w-[45%] shrink-0 items-center gap-1.5 rounded-[7px] bg-accent pr-2 pl-1 font-display text-[12px] font-bold text-on-accent"
          >
            <SiloTile :silo="silo" :size="16" :radius="5" />
            <span class="truncate">{{ silo.name }}</span>
          </span>
          <span class="flex min-w-0 flex-1 items-baseline gap-[7px] overflow-hidden whitespace-nowrap">
            <span class="truncate text-[13px] font-semibold text-fg1">{{ title }}</span>
            <span class="truncate text-[12px] text-fg3">{{ domain }}</span>
          </span>
          <span
            v-if="zoomPercent !== 100"
            class="shrink-0 font-mono text-[10.5px] text-fg3"
            :title="`Zoom ${zoomPercent}% — ${shortcut('0')} resets`"
          >
            {{ zoomPercent }}%
          </span>
          <kbd class="shrink-0 text-[10.5px] text-fg3">{{ shortcut('L') }}</kbd>
        </button>
        <button
          type="button"
          :class="navButton"
          aria-label="Open in default browser"
          title="Open in default browser"
          @click="openExternal"
        >
          <AppIcon name="external" :size="15" />
        </button>
      </div>
    </template>
    <span class="wco-spacer" aria-hidden="true" />
  </header>
</template>
