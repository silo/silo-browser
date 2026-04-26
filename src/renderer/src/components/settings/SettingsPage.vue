<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import type { AccentColor, SurfaceColor } from '@renderer/types'
import UserAgentSelector from '@renderer/components/inputs/UserAgentSelector.vue'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const isMac = window.api.platform === 'darwin'
const appVersion = ref('')
const checkingForUpdates = ref(false)

const accentPresets: { name: AccentColor; hex: string }[] = [
  { name: 'gray', hex: '#6b7280' },
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'green', hex: '#10b981' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' }
]

const surfacePresets: { name: SurfaceColor; swatch: string }[] = [
  { name: 'charcoal', swatch: '#141414' },
  { name: 'neutral', swatch: '#1f2937' },
  { name: 'wine', swatch: '#e11d48' },
  { name: 'earth', swatch: '#f59e0b' },
  { name: 'forest', swatch: '#22c55e' },
  { name: 'teal', swatch: '#14b8a6' },
  { name: 'slate', swatch: '#64748b' },
  { name: 'navy', swatch: '#6366f1' },
  { name: 'plum', swatch: '#a855f7' }
]

onMounted(async () => {
  appVersion.value = await window.api.getAppVersion()
})

function handleCheckForUpdates(): void {
  checkingForUpdates.value = true
  uiStore.updaterUpToDate = false
  window.api.checkForUpdates()
  setTimeout(() => {
    checkingForUpdates.value = false
  }, 5000)
}

async function handleImport(): Promise<void> {
  const result = await window.api.importConfig()
  if (result) {
    await groupsStore.loadFromDisk()
    await topbarStore.loadFromDisk()
    await uiStore.loadFromDisk()
    uiStore.closeSettingsPage()
  }
}

async function handleExport(): Promise<void> {
  await window.api.exportConfig()
}

const mod = isMac ? '\u2318' : 'Ctrl'

const shortcuts: { keys: string; description: string }[] = [
  { keys: `${mod}+T`, description: 'New tab' },
  { keys: `${mod}+N`, description: 'New group' },
  { keys: `${mod}+W`, description: 'Close active child tab' },
  { keys: `${mod}+R`, description: 'Reload active tab' },
  { keys: `${mod}+F`, description: 'Find in page' },
  { keys: `${mod}+L`, description: 'Focus URL bar' },
  { keys: `${mod}+,`, description: 'Toggle settings' },
  { keys: `${mod}+[ / ]`, description: 'Toggle sidebar' },
  { keys: `${mod}+=`, description: 'Zoom in' },
  { keys: `${mod}+-`, description: 'Zoom out' },
  { keys: `${mod}+0`, description: 'Reset zoom' },
  { keys: `${mod}+1-9`, description: 'Switch to Nth tab' },
  { keys: 'Esc', description: 'Close dialogs / settings' }
]

const isCustomSurfaceColor = computed(() => uiStore.surfaceColor.startsWith('#'))

function openWebsite(): void {
  window.api.openExternal('https://silo.dev')
}

function onCustomSurfaceColor(event: Event): void {
  const hex = (event.target as HTMLInputElement).value
  uiStore.setSurfaceColor(hex)
}
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0 bg-surface-chrome">
    <!-- Header bar -->
    <div
      :class="[
        'flex items-center gap-2 pr-2 py-1.5 bg-surface-chrome border-b border-chrome-border',
        isMac ? 'app-drag' : '',
        isMac && !uiStore.sidebarExpanded ? 'pl-8' : 'pl-2'
      ]"
    >
      <button
        @click="uiStore.closeSettingsPage()"
        class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
        title="Back to browser"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" />
        </svg>
      </button>
      <h1 class="app-no-drag text-sm font-medium text-chrome-fg-primary">Settings</h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto text-chrome-fg-secondary">
      <div class="max-w-xl mx-auto py-8 px-6 space-y-8">
        <!-- Appearance section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            Appearance
          </h3>
          <div class="space-y-4">
            <!-- Theme mode selector -->
            <div>
              <label class="block text-sm text-chrome-fg-muted mb-2">Theme</label>
              <div
                class="flex bg-chrome-hover/50 border border-chrome-border rounded overflow-hidden"
              >
                <button
                  v-for="mode in (['dark', 'light', 'system'] as const)"
                  :key="mode"
                  @click="uiStore.setThemeMode(mode)"
                  :class="[
                    'flex-1 py-2 text-sm capitalize transition-colors',
                    uiStore.themeMode === mode
                      ? 'bg-accent text-white'
                      : 'text-chrome-fg-muted hover:text-chrome-fg-primary hover:bg-chrome-hover'
                  ]"
                >
                  {{ mode }}
                </button>
              </div>
            </div>

            <!-- Accent color picker -->
            <div>
              <label class="block text-sm text-chrome-fg-muted mb-2">Accent Color</label>
              <div class="flex gap-2">
                <button
                  v-for="preset in accentPresets"
                  :key="preset.name"
                  class="w-7 h-7 rounded-full border-2 transition-all cursor-pointer"
                  :class="
                    uiStore.accentColor === preset.name
                      ? 'border-fg-primary scale-110'
                      : 'border-transparent'
                  "
                  :style="{ backgroundColor: preset.hex }"
                  :title="preset.name"
                  @click="uiStore.setAccentColor(preset.name)"
                />
              </div>
            </div>

            <!-- Surface color picker -->
            <div>
              <label class="block text-sm text-chrome-fg-muted mb-1">Surface Color</label>
              <p class="text-xs text-chrome-fg-faint mb-2">Tint for sidebar and navigation bar</p>
              <div class="flex gap-2">
                <button
                  v-for="preset in surfacePresets"
                  :key="preset.name"
                  class="w-7 h-7 rounded-full border-2 transition-all cursor-pointer"
                  :class="
                    uiStore.surfaceColor === preset.name
                      ? 'border-fg-primary scale-110'
                      : 'border-transparent'
                  "
                  :style="{ backgroundColor: preset.swatch }"
                  :title="preset.name"
                  @click="uiStore.setSurfaceColor(preset.name)"
                />

                <!-- Custom color picker -->
                <label
                  class="w-7 h-7 rounded-full border-2 transition-all cursor-pointer relative overflow-hidden"
                  :class="
                    isCustomSurfaceColor
                      ? 'border-fg-primary scale-110'
                      : 'border-transparent'
                  "
                  :style="isCustomSurfaceColor ? { backgroundColor: uiStore.surfaceColor } : {}"
                  title="Custom color"
                >
                  <input
                    type="color"
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    :value="isCustomSurfaceColor ? uiStore.surfaceColor : '#1f2937'"
                    @input="onCustomSurfaceColor"
                  />
                  <span
                    v-if="!isCustomSurfaceColor"
                    class="flex items-center justify-center w-full h-full rounded-full bg-chrome-hover text-chrome-fg-faint"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- General section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            General
          </h3>
          <div class="space-y-3">
            <label
              class="flex items-center justify-between px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded cursor-pointer hover:border-accent transition-colors"
            >
              <div>
                <span class="text-sm text-chrome-fg-secondary">Open links in new tab</span>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Links that open new windows will open as topbar tabs instead
                </p>
              </div>
              <input
                type="checkbox"
                :checked="uiStore.openLinksInNewTab"
                @change="uiStore.setOpenLinksInNewTab(($event.target as HTMLInputElement).checked)"
                class="w-4 h-4 cursor-pointer"
              />
            </label>

            <label
              class="flex items-center justify-between px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded hover:border-accent transition-colors"
            >
              <div>
                <span class="text-sm text-chrome-fg-secondary">Auto-sleep for new tabs</span>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Automatically suspend inactive tabs to save memory
                </p>
              </div>
              <select
                :value="uiStore.defaultSleepAfterMinutes"
                @change="uiStore.setDefaultSleepAfterMinutes(Number(($event.target as HTMLSelectElement).value))"
                class="px-2 py-1 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary cursor-pointer focus:outline-none focus:border-accent"
              >
                <option :value="0">Never</option>
                <option :value="30">30 min</option>
                <option :value="60">1 hour</option>
                <option :value="120">2 hours</option>
                <option :value="240">4 hours</option>
              </select>
            </label>

            <label
              class="flex items-center justify-between px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded cursor-pointer hover:border-accent transition-colors"
            >
              <div>
                <span class="text-sm text-chrome-fg-secondary">Confirm before closing child tabs</span>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Show a confirmation dialog when closing topbar tabs
                </p>
              </div>
              <input
                type="checkbox"
                :checked="uiStore.confirmCloseChildTabs"
                @change="uiStore.setConfirmCloseChildTabs(($event.target as HTMLInputElement).checked)"
                class="w-4 h-4 cursor-pointer"
              />
            </label>

            <div
              class="flex flex-col gap-2 px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded hover:border-accent transition-colors"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <span class="text-sm text-chrome-fg-secondary">Default user agent</span>
                  <p class="text-xs text-chrome-fg-faint mt-0.5">
                    Used by all groups unless overridden. Takes effect on next reload.
                  </p>
                </div>
                <UserAgentSelector
                  :model-value="uiStore.defaultUserAgent"
                  @update:model-value="uiStore.setDefaultUserAgent"
                  variant="chrome"
                  default-label="Default (auto)"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Keyboard Shortcuts section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            Keyboard Shortcuts
          </h3>
          <div class="bg-chrome-hover/50 border border-chrome-border rounded divide-y divide-chrome-border">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.keys"
              class="flex items-center justify-between px-3 py-2"
            >
              <span class="text-sm text-chrome-fg-secondary">{{ shortcut.description }}</span>
              <kbd class="text-xs text-chrome-fg-muted bg-chrome-hover/50 border border-chrome-border rounded px-1.5 py-0.5 font-mono">{{ shortcut.keys }}</kbd>
            </div>
          </div>
        </div>

        <!-- Data section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            Data
          </h3>
          <div class="space-y-2">
            <button
              @click="handleExport"
              class="w-full flex items-center gap-3 px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded hover:border-chrome-border transition-colors text-sm text-chrome-fg-secondary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-chrome-fg-muted"
              >
                <path
                  d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"
                />
                <path
                  d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"
                />
              </svg>
              <span>Export Configuration</span>
            </button>
            <button
              @click="handleImport"
              class="w-full flex items-center gap-3 px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded hover:border-chrome-border transition-colors text-sm text-chrome-fg-secondary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-chrome-fg-muted"
              >
                <path
                  d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z"
                />
                <path
                  d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"
                />
              </svg>
              <span>Import Configuration</span>
            </button>
          </div>
        </div>

        <!-- Updates section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            Updates
          </h3>
          <div class="space-y-2">
            <button
              @click="handleCheckForUpdates"
              :disabled="checkingForUpdates"
              class="w-full flex items-center gap-3 px-3 py-2 bg-chrome-hover/50 border border-chrome-border rounded hover:border-chrome-border transition-colors text-sm text-chrome-fg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-chrome-fg-muted"
              >
                <path
                  fill-rule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 0 1-9.201 2.466l-.312-.311h2.433a.75.75 0 0 0 0-1.5H3.989a.75.75 0 0 0-.75.75v4.242a.75.75 0 0 0 1.5 0v-2.43l.31.31a7 7 0 0 0 11.712-3.138.75.75 0 0 0-1.449-.39Zm1.23-3.723a.75.75 0 0 0 .219-.53V2.929a.75.75 0 0 0-1.5 0V5.36l-.31-.31A7 7 0 0 0 3.239 8.188a.75.75 0 1 0 1.448.389A5.5 5.5 0 0 1 13.89 6.11l.311.31h-2.432a.75.75 0 0 0 0 1.5h4.243a.75.75 0 0 0 .53-.219Z"
                  clip-rule="evenodd"
                />
              </svg>
              <span v-if="checkingForUpdates">Checking...</span>
              <span v-else>Check for Updates</span>
            </button>
            <p
              v-if="uiStore.updaterUpToDate && !checkingForUpdates"
              class="text-xs text-semantic-success px-3"
            >
              You're on the latest version.
            </p>
          </div>
        </div>

        <!-- About section -->
        <div>
          <h3
            class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3"
          >
            About
          </h3>
          <p class="text-sm text-chrome-fg-faint">Silo v{{ appVersion }}</p>
          <a
            href="#"
            @click.prevent="openWebsite"
            class="text-sm text-accent hover:text-accent-hover transition-colors"
          >silo.dev</a>
        </div>
      </div>
    </div>
  </div>
</template>
