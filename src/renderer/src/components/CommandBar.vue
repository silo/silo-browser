<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useRecentlyClosedStore } from '@renderer/stores/recently-closed'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import { altShortcut, isMac, shortcut } from '@renderer/utils/platform'
import type { GroupItem, TabItem } from '@renderer/types'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import TabIcon from '@renderer/components/common/TabIcon.vue'
import type { AppIconName } from '@renderer/utils/icons'

// ⌘L command bar (design board "C · Command bar"): search open tabs in every silo,
// reopen recently closed tabs, open an address in the current tab, or add it as a new tab
// to the current silo.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const recentlyClosed = useRecentlyClosedStore()
const webviewRegistry = useWebviewRegistry()

const query = ref('')
const selected = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

const currentSilo = computed<GroupItem | null>(() => groupsStore.currentGroup)

type Item =
  | { kind: 'tab'; id: string; tab: TabItem; silo: GroupItem; title: string; sub: string }
  | {
      kind: 'closed'
      id: string
      entryId: string
      silo: GroupItem
      title: string
      sub: string
      url: string
      iconUrl?: string
      iconEmoji?: string
    }
  | {
      kind: 'go' | 'add' | 'search'
      id: string
      icon: AppIconName
      title: string
      sub: string
      url: string
    }

interface Section {
  title: string
  items: Item[]
}

onMounted(() => {
  // Start from the current address so it can be edited, like a browser's ⌘L
  const tab = groupsStore.activeTab
  const child = topbarStore.isChildActive
    ? topbarStore.findChild(topbarStore.activeTopbarTabId!)
    : null
  query.value = child?.currentUrl || child?.url || tab?.currentUrl || tab?.url || ''
  nextTick(() => {
    inputRef.value?.focus()
    inputRef.value?.select()
  })
})

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** Returns a normalized http(s) URL if the text looks like an address, else null. */
function asUrl(text: string): string | null {
  const t = text.trim()
  if (!t || /\s/.test(t)) return null
  if (/^https?:\/\//i.test(t)) {
    try {
      return new URL(t).toString()
    } catch {
      return null
    }
  }
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(t)) return `http://${t}`
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t)) return `https://${t}`
  return null
}

// When the query is the unchanged current address, show tabs instead of filtering by it
const currentAddress = computed(() => {
  const tab = groupsStore.activeTab
  const child = topbarStore.isChildActive
    ? topbarStore.findChild(topbarStore.activeTopbarTabId!)
    : null
  return child?.currentUrl || child?.url || tab?.currentUrl || tab?.url || ''
})
const searchText = computed(() =>
  query.value.trim() === currentAddress.value ? '' : query.value.trim().toLowerCase()
)

const tabMatches = computed<Item[]>(() => {
  const q = searchText.value
  const results: { item: Item; score: number }[] = []
  for (const silo of groupsStore.sortedGroups) {
    for (const tab of [...silo.tabs].sort((a, b) => a.order - b.order)) {
      const name = tab.name.toLowerCase()
      const title = (tab.currentTitle ?? '').toLowerCase()
      const url = (tab.currentUrl || tab.url).toLowerCase()
      let score: number
      if (!q) score = silo.id === currentSilo.value?.id ? 1 : 0
      else if (name.startsWith(q)) score = 5
      else if (name.includes(q)) score = 4
      else if (hostOf(url).startsWith(q)) score = 3
      else if (title.includes(q)) score = 2
      else if (url.includes(q) || silo.name.toLowerCase().includes(q)) score = 1
      else continue
      results.push({
        score,
        item: {
          kind: 'tab',
          id: `tab:${tab.id}`,
          tab,
          silo,
          title: tab.name,
          sub: hostOf(tab.currentUrl || tab.url)
        }
      })
    }
  }
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((r) => r.item)
})

// Closed pop-up tabs and removed sidebar tabs that can still come back (⌘⇧T reopens the newest)
const closedItems = computed<Item[]>(() => {
  const q = searchText.value
  const out: Item[] = []
  for (const entry of recentlyClosed.restorable()) {
    const isChild = entry.kind === 'child'
    const url = isChild ? entry.url : entry.tab.url
    const title = isChild ? entry.title || hostOf(url) : entry.tab.name
    const silo = groupsStore.findGroup(isChild ? entry.groupId : entry.tab.groupId)
    if (!silo) continue
    if (q && !title.toLowerCase().includes(q) && !url.toLowerCase().includes(q)) continue
    out.push({
      kind: 'closed',
      id: `closed:${entry.id}`,
      entryId: entry.id,
      silo,
      title,
      sub: `${isChild ? 'Pop-up tab' : 'Removed tab'} · ${hostOf(url)}`,
      url,
      iconUrl: isChild ? entry.iconUrl : entry.tab.iconUrl,
      iconEmoji: isChild ? undefined : entry.tab.iconEmoji
    })
    if (out.length >= 8) break
  }
  return out
})

const goItems = computed<Item[]>(() => {
  const text = query.value.trim()
  if (!searchText.value) return []
  const url = asUrl(text)
  const silo = currentSilo.value
  const items: Item[] = []
  if (url) {
    if (groupsStore.activeTab) {
      items.push({ kind: 'go', id: 'go', icon: 'globe', title: hostOf(url), sub: 'Open in this tab', url })
    }
    if (silo) {
      items.push({
        kind: 'add',
        id: 'add',
        icon: 'plus',
        title: `Add ${hostOf(url)} to ${silo.name}`,
        sub: `New tab with ${silo.name}’s logins`,
        url
      })
    }
  } else if (groupsStore.activeTab) {
    items.push({
      kind: 'search',
      id: 'search',
      icon: 'search',
      title: `Search for “${text}”`,
      sub: 'Google, in this tab',
      url: `https://www.google.com/search?q=${encodeURIComponent(text)}`
    })
  }
  return items
})

const sections = computed<Section[]>(() => {
  const out: Section[] = []
  if (tabMatches.value.length) out.push({ title: 'Switch to tab', items: tabMatches.value })
  if (closedItems.value.length) out.push({ title: 'Recently closed', items: closedItems.value })
  if (goItems.value.length) out.push({ title: 'Go to', items: goItems.value })
  return out
})

const flat = computed(() => sections.value.flatMap((s) => s.items))

watch(flat, () => {
  // Prefer the address action when the query looks like a URL nobody has open yet
  const firstGo = flat.value.findIndex(
    (i) => i.kind === 'go' || i.kind === 'add' || i.kind === 'search'
  )
  const onlyWeakTabMatches = tabMatches.value.length === 0
  selected.value = onlyWeakTabMatches && firstGo >= 0 ? firstGo : 0
})

function keyHint(item: Item, index: number): string {
  if (item.kind === 'go' || item.kind === 'search') return '⇧↵'
  if (item.kind === 'add') return shortcut('↵')
  return index === selected.value ? '↵' : ''
}

function close(): void {
  uiStore.closeCommandBar()
}

function openInThisTab(url: string): void {
  const wv = webviewRegistry.getActive(groupsStore.activeTabId, topbarStore.activeTopbarTabId)
  if (wv) wv.loadURL(url)
  close()
}

function addAsTab(url: string): void {
  const silo = currentSilo.value
  if (!silo) return
  const host = hostOf(url)
  const label = host.split('.')[0]
  const tab = groupsStore.addTab(silo.id, label.charAt(0).toUpperCase() + label.slice(1), url)
  groupsStore.activateTab(tab.id)
  close()
}

function run(item: Item | undefined): void {
  if (!item) return
  if (item.kind === 'tab') {
    groupsStore.activateTab(item.tab.id)
    topbarStore.activateMainTab()
    close()
  } else if (item.kind === 'closed') {
    recentlyClosed.reopen(item.entryId)
    close()
  } else if (item.kind === 'add') {
    addAsTab(item.url)
  } else {
    openInThisTab(item.url)
  }
}

function typedOrSearchUrl(): string | null {
  const text = query.value.trim()
  if (!text) return null
  return asUrl(text) ?? `https://www.google.com/search?q=${encodeURIComponent(text)}`
}

function onEnter(e: KeyboardEvent): void {
  e.preventDefault()
  const mod = isMac ? e.metaKey : e.ctrlKey
  if (e.altKey) {
    // ⌥↵ — open the selected tab's page (or the typed address) in the default browser
    const item = flat.value[selected.value]
    const url =
      item?.kind === 'tab' ? item.tab.currentUrl || item.tab.url : item ? item.url : typedOrSearchUrl()
    if (url) window.api.openExternal(url)
    close()
    return
  }
  if (mod) {
    const url = asUrl(query.value)
    if (url) addAsTab(url)
    return
  }
  if (e.shiftKey) {
    const url = typedOrSearchUrl()
    if (url && groupsStore.activeTab) openInThisTab(url)
    return
  }
  run(flat.value[selected.value])
}

function move(e: KeyboardEvent, dir: 1 | -1): void {
  e.preventDefault()
  const n = flat.value.length
  if (!n) return
  selected.value = (selected.value + dir + n) % n
  nextTick(() => {
    listRef.value
      ?.querySelector<HTMLElement>(`[data-index="${selected.value}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  })
}

function indexOf(item: Item): number {
  return flat.value.indexOf(item)
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-start justify-center bg-scrim px-4 pt-[104px] pb-4 backdrop-blur-[2px]"
      @mousedown.self="close"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
        class="flex max-h-[calc(100vh-140px)] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl bg-panel shadow-dialog"
      >
        <div class="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-line pr-3 pl-4">
          <AppIcon name="search" :size="17" :stroke="2.1" class="text-fg3" />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-results"
            aria-label="Search tabs or enter an address"
            placeholder="Search tabs or enter an address"
            spellcheck="false"
            autocomplete="off"
            class="h-full min-w-0 flex-1 border-0 bg-transparent text-[16px] text-fg1 caret-[var(--accent)] outline-none placeholder:text-fg3"
            @keydown.enter="onEnter"
            @keydown.down="move($event, 1)"
            @keydown.up="move($event, -1)"
            @keydown.esc.stop.prevent="close"
          />
          <span
            v-if="currentSilo"
            class="flex h-[22px] shrink-0 items-center gap-[5px] rounded-md bg-accent pr-2 pl-[3px] font-display text-[11.5px] font-bold text-on-accent"
          >
            <SiloTile :silo="currentSilo" :size="16" :radius="4" />
            in {{ currentSilo.name }}
          </span>
          <kbd
            class="inline-flex h-5 shrink-0 items-center rounded-[5px] px-1.5 text-[10.5px] text-fg3 shadow-[inset_0_0_0_1px_var(--line)]"
          >
            Esc
          </kbd>
        </div>

        <div
          id="command-results"
          ref="listRef"
          role="listbox"
          aria-label="Results"
          class="thin-scroll flex min-h-0 flex-col overflow-y-auto p-1.5"
        >
          <div v-for="section in sections" :key="section.title" role="presentation" class="flex flex-col gap-px">
            <span
              role="presentation"
              class="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-[0.04em] text-fg3 uppercase"
            >
              {{ section.title }}
            </span>
            <button
              v-for="item in section.items"
              :key="item.id"
              type="button"
              role="option"
              :data-index="indexOf(item)"
              :aria-selected="indexOf(item) === selected"
              class="flex h-11 shrink-0 items-center gap-3 rounded-[10px] px-2.5 text-left"
              :class="indexOf(item) === selected ? 'bg-sel' : ''"
              @mousemove="selected = indexOf(item)"
              @click="run(item)"
            >
              <TabIcon
                v-if="item.kind === 'tab'"
                :name="item.tab.name"
                :url="item.tab.url"
                :icon-url="item.tab.iconUrl"
                :icon-emoji="item.tab.iconEmoji"
                :size="22"
              />
              <TabIcon
                v-else-if="item.kind === 'closed'"
                :name="item.title"
                :url="item.url"
                :icon-url="item.iconUrl"
                :icon-emoji="item.iconEmoji"
                :size="22"
              />
              <span
                v-else
                aria-hidden="true"
                class="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-fg2 shadow-[inset_0_0_0_1px_var(--line)]"
              >
                <AppIcon :name="item.icon" :size="13" :stroke="2" />
              </span>
              <span class="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden whitespace-nowrap">
                <span class="truncate text-[13.5px] font-semibold text-fg1">{{ item.title }}</span>
                <span class="truncate text-[12px] text-fg2">{{ item.sub }}</span>
              </span>
              <span
                v-if="item.kind === 'tab' || item.kind === 'closed'"
                class="flex h-[22px] shrink-0 items-center gap-[5px] rounded-md px-2 text-[11.5px] font-semibold text-fg1"
                :style="{ background: `color-mix(in srgb, ${item.silo.color} 16%, transparent)` }"
              >
                <span aria-hidden="true" class="h-1.5 w-1.5 rounded-full" :style="{ background: item.silo.color }" />
                {{ item.silo.name }}
              </span>
              <kbd
                class="inline-flex h-5 min-w-6 shrink-0 items-center justify-center rounded-[5px] px-[5px] text-[10.5px] text-fg2 shadow-[inset_0_0_0_1px_var(--line)]"
                :class="keyHint(item, indexOf(item)) ? '' : 'invisible'"
                :style="{ opacity: indexOf(item) === selected ? 1 : 0.6 }"
              >
                {{ keyHint(item, indexOf(item)) || '↵' }}
              </kbd>
            </button>
          </div>
          <p v-if="sections.length === 0" class="m-0 px-2.5 py-6 text-center text-[13px] text-fg3">
            No tabs match. Type an address to open it.
          </p>
        </div>

        <div
          class="flex shrink-0 flex-wrap items-center gap-3.5 border-t border-line px-4 py-2.5 text-[11.5px] text-fg2"
        >
          <span class="flex items-center gap-[5px]"><kbd class="text-[10.5px]">↑↓</kbd>Move</span>
          <span class="flex items-center gap-[5px]"><kbd class="text-[10.5px]">↵</kbd>Open</span>
          <span class="flex items-center gap-[5px]">
            <kbd class="text-[10.5px]">{{ altShortcut('↵') }}</kbd>Default browser
          </span>
          <span class="ml-auto">Searches tabs in every silo</span>
        </div>
      </div>
    </div>
  </Teleport>
</template>
