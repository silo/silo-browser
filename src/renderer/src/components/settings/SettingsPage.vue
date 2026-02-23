<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import type { AccentColor, SurfaceColor } from '@renderer/types'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const isMac = window.api.platform === 'darwin'
const appVersion = ref('')
const checkingForUpdates = ref(false)

const accentPresets: { name: AccentColor; hex: string }[] = [
  { name: 'blue', hex: '#3b82f6' },
  { name: 'green', hex: '#10b981' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'red', hex: '#ef4444' },
  { name: 'violet', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'orange', hex: '#f97316' }
]

const surfacePresets: { name: SurfaceColor; swatch: string | null }[] = [
  { name: 'default', swatch: null },
  { name: 'slate', swatch: '#64748b' },
  { name: 'navy', swatch: '#6366f1' },
  { name: 'forest', swatch: '#22c55e' },
  { name: 'wine', swatch: '#e11d48' },
  { name: 'plum', swatch: '#a855f7' },
  { name: 'teal', swatch: '#14b8a6' },
  { name: 'earth', swatch: '#f59e0b' }
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
  { keys: `${mod}+L`, description: 'Focus URL bar' },
  { keys: `${mod}+,`, description: 'Toggle settings' },
  { keys: `${mod}+[ / ]`, description: 'Toggle sidebar' },
  { keys: `${mod}+1-9`, description: 'Switch to Nth tab' },
  { keys: 'Esc', description: 'Close dialogs / settings' }
]

const isCustomSurfaceColor = computed(() => uiStore.surfaceColor.startsWith('#'))

function onCustomSurfaceColor(event: Event): void {
  const hex = (event.target as HTMLInputElement).value
  uiStore.setSurfaceColor(hex)
}
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0 bg-surface-base">
    <!-- Header bar -->
    <div
      :class="[
        'flex items-center gap-2 pr-2 py-1.5 bg-surface-chrome border-b border-chrome-border',
        isMac ? 'app-drag' : '',
        isMac && !uiStore.sidebarExpanded ? 'pl-4' : 'pl-2'
      ]"
    >
      <button
        @click="uiStore.closeSettingsPage()"
        class="app-no-drag p-1 text-chrome-fg-muted hover:text-chrome-fg-primary rounded hover:bg-chrome-hover transition-colors"
        title="Back to browser"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path fill-rule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clip-rule="evenodd" />
        </svg>
      </button>
      <h1 class="app-no-drag text-sm font-medium text-chrome-fg-primary">Settings</h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto">
      <div class="max-w-xl mx-auto py-8 px-6 space-y-8">
        <!-- Appearance section -->
        <div>
          <h3
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            Appearance
          </h3>
          <div class="space-y-4">
            <!-- Theme mode selector -->
            <div>
              <label class="block text-sm text-fg-muted mb-2">Theme</label>
              <div
                class="flex bg-surface-input border border-border-default rounded overflow-hidden"
              >
                <button
                  v-for="mode in (['dark', 'light', 'system'] as const)"
                  :key="mode"
                  @click="uiStore.setThemeMode(mode)"
                  :class="[
                    'flex-1 py-2 text-sm capitalize transition-colors',
                    uiStore.themeMode === mode
                      ? 'bg-accent text-white'
                      : 'text-fg-muted hover:text-fg-primary hover:bg-surface-hover'
                  ]"
                >
                  {{ mode }}
                </button>
              </div>
            </div>

            <!-- Accent color picker -->
            <div>
              <label class="block text-sm text-fg-muted mb-2">Accent Color</label>
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
              <label class="block text-sm text-fg-muted mb-1">Surface Color</label>
              <p class="text-xs text-fg-faint mb-2">Tint for sidebar and navigation bar</p>
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
                  :style="preset.swatch ? { backgroundColor: preset.swatch } : {}"
                  :title="preset.name"
                  @click="uiStore.setSurfaceColor(preset.name)"
                >
                  <span
                    v-if="!preset.swatch"
                    class="flex items-center justify-center w-full h-full rounded-full bg-surface-raised border border-border-default text-fg-faint text-xs"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3">
                      <path fill-rule="evenodd" d="M1 2.75A.75.75 0 011.75 2h16.5a.75.75 0 010 1.5H18v8.75A2.75 2.75 0 0115.25 15h-1.072l.798 3.06a.75.75 0 01-1.452.38L13.41 18H6.59l-.114.44a.75.75 0 01-1.452-.38L5.822 15H4.75A2.75 2.75 0 012 12.25V3.5h-.25A.75.75 0 011 2.75z" clip-rule="evenodd" />
                    </svg>
                  </span>
                </button>

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
                    class="flex items-center justify-center w-full h-full rounded-full bg-surface-hover text-fg-faint"
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
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            General
          </h3>
          <div class="space-y-3">
            <label
              class="flex items-center justify-between px-3 py-2 bg-surface-input border border-border-default rounded cursor-pointer hover:border-border-light transition-colors"
            >
              <div>
                <span class="text-sm text-fg-secondary">Open links in new tab</span>
                <p class="text-xs text-fg-faint mt-0.5">
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
          </div>
        </div>

        <!-- Keyboard Shortcuts section -->
        <div>
          <h3
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            Keyboard Shortcuts
          </h3>
          <div class="bg-surface-input border border-border-default rounded divide-y divide-border-default">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.keys"
              class="flex items-center justify-between px-3 py-2"
            >
              <span class="text-sm text-fg-secondary">{{ shortcut.description }}</span>
              <kbd class="text-xs text-fg-muted bg-surface-raised border border-border-default rounded px-1.5 py-0.5 font-mono">{{ shortcut.keys }}</kbd>
            </div>
          </div>
        </div>

        <!-- Data section -->
        <div>
          <h3
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            Data
          </h3>
          <div class="space-y-2">
            <button
              @click="handleExport"
              class="w-full flex items-center gap-3 px-3 py-2 bg-surface-input border border-border-default rounded hover:border-border-light transition-colors text-sm text-fg-secondary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-fg-muted"
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
              class="w-full flex items-center gap-3 px-3 py-2 bg-surface-input border border-border-default rounded hover:border-border-light transition-colors text-sm text-fg-secondary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-fg-muted"
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
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            Updates
          </h3>
          <div class="space-y-2">
            <button
              @click="handleCheckForUpdates"
              :disabled="checkingForUpdates"
              class="w-full flex items-center gap-3 px-3 py-2 bg-surface-input border border-border-default rounded hover:border-border-light transition-colors text-sm text-fg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-fg-muted"
              >
                <path
                  fill-rule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.397a.75.75 0 00-.75.75v3.834a.75.75 0 001.5 0v-2.09l.312.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-10.624-2.85a5.5 5.5 0 019.201-2.466l.312.311H11.77a.75.75 0 000 1.5h3.834a.75.75 0 00.75-.75V3.334a.75.75 0 00-1.5 0v2.09l-.311-.31A7 7 0 002.83 8.252a.75.75 0 001.449.39z"
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
            class="text-sm font-semibold text-fg-secondary uppercase tracking-wider mb-3"
          >
            About
          </h3>
          <p class="text-sm text-fg-faint">Silo v{{ appVersion }}</p>
        </div>
      </div>
    </div>
  </div>
</template>
