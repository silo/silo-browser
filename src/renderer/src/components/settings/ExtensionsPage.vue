<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useExtensionsStore } from '@renderer/stores/extensions'
import { useGroupsStore } from '@renderer/stores/groups'
import Spinner from '@renderer/components/Spinner.vue'
import type { InstalledExtensionEntry } from '../../../../preload/index.d'

const uiStore = useUiStore()
const extensionsStore = useExtensionsStore()
const groupsStore = useGroupsStore()
const isMac = window.api.platform === 'darwin'

/**
 * activeGroupIds === undefined is the legacy "all groups" marker. Treat it
 * as every current group id for the purpose of the checkboxes.
 */
function effectiveActiveGroupIds(entry: InstalledExtensionEntry): string[] {
  return entry.activeGroupIds ?? groupsStore.sortedGroups.map((g) => g.id)
}

function isActiveInGroup(entry: InstalledExtensionEntry, groupId: string): boolean {
  return effectiveActiveGroupIds(entry).includes(groupId)
}

function toggleGroup(
  entry: InstalledExtensionEntry,
  groupId: string,
  checked: boolean
): Promise<void> {
  const current = effectiveActiveGroupIds(entry)
  const next = checked
    ? Array.from(new Set([...current, groupId]))
    : current.filter((id) => id !== groupId)
  return extensionsStore.setActiveGroups(entry.id, next)
}

const webstoreInput = ref('')
const urlInput = ref('')

onMounted(() => {
  extensionsStore.refresh()
})

async function handleInstallWebstore(): Promise<void> {
  if (!webstoreInput.value.trim()) return
  const ok = await extensionsStore.installFromWebStore(webstoreInput.value)
  if (ok) webstoreInput.value = ''
}

async function handleInstallUrl(): Promise<void> {
  if (!urlInput.value.trim()) return
  const ok = await extensionsStore.installFromUrl(urlInput.value)
  if (ok) urlInput.value = ''
}

async function handleInstallUnpacked(): Promise<void> {
  await extensionsStore.installUnpacked()
}

async function handleToggle(id: string, enabled: boolean): Promise<void> {
  await extensionsStore.setEnabled(id, enabled)
}

async function handleRemove(id: string, name: string): Promise<void> {
  if (!window.confirm(`Remove "${name}"? This will uninstall the extension and clear its stored data.`)) return
  await extensionsStore.remove(id)
}

async function handleClearData(id: string, name: string): Promise<void> {
  if (
    !window.confirm(
      `Clear all stored data for "${name}"? This signs you out and removes its local cache across every group. The extension itself stays installed.`
    )
  )
    return
  await extensionsStore.clearData(id)
}

function relaunch(): void {
  window.api.relaunchApp()
}

function sourceLabel(source: 'webstore' | 'url' | 'unpacked'): string {
  return source === 'webstore' ? 'Chrome Web Store' : source === 'url' ? 'Direct URL' : 'Unpacked'
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
        @click="uiStore.closeExtensionsPage()"
        class="app-no-drag p-1 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
        title="Back to browser"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4">
          <path fill-rule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clip-rule="evenodd" />
        </svg>
      </button>
      <h1 class="app-no-drag text-sm font-medium text-chrome-fg-primary">Extensions</h1>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto text-chrome-fg-secondary">
      <div class="max-w-2xl mx-auto py-8 px-6 space-y-8">
        <!-- Error banner -->
        <div
          v-if="extensionsStore.lastError"
          class="flex items-start justify-between gap-3 px-3 py-2 bg-semantic-danger/10 border border-semantic-danger/40 rounded text-sm text-semantic-danger"
        >
          <span class="break-words">{{ extensionsStore.lastError }}</span>
          <button
            @click="extensionsStore.clearError()"
            class="shrink-0 text-semantic-danger/70 hover:text-semantic-danger"
          >
            ✕
          </button>
        </div>

        <!-- Restart-required banner -->
        <div
          v-if="extensionsStore.needsRestart"
          class="flex items-center justify-between gap-3 px-3 py-2 bg-accent/10 border border-accent/40 rounded text-sm text-chrome-fg-primary"
        >
          <div>
            <span class="font-medium">Restart required.</span>
            <span class="text-chrome-fg-muted">
              Electron caches extension storage in memory; relaunch Silo to finish clearing.
            </span>
          </div>
          <button
            @click="relaunch"
            class="shrink-0 px-3 py-1 bg-accent text-white text-xs font-medium rounded hover:opacity-90"
          >
            Restart now
          </button>
        </div>

        <!-- Install section -->
        <div>
          <h3 class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider mb-3">
            Install
          </h3>
          <div class="space-y-3">
            <!-- Chrome Web Store -->
            <div
              class="flex flex-col gap-2 px-3 py-3 bg-chrome-hover/50 border border-chrome-border rounded"
            >
              <div>
                <span class="text-sm text-chrome-fg-secondary">Chrome Web Store</span>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Paste an extension ID (32 chars) or its Chrome Web Store URL
                </p>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="webstoreInput"
                  type="text"
                  placeholder="e.g. nngceckbapebfimnlniiiahkandclblb"
                  class="flex-1 px-2 py-1.5 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary focus:outline-none focus:border-accent-soft"
                  @keydown.enter="handleInstallWebstore"
                />
                <button
                  @click="handleInstallWebstore"
                  :disabled="extensionsStore.installing || !webstoreInput.trim()"
                  class="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Spinner v-if="extensionsStore.installing" size="w-3.5 h-3.5" />
                  <span>Install</span>
                </button>
              </div>
            </div>

            <!-- Direct URL -->
            <div
              class="flex flex-col gap-2 px-3 py-3 bg-chrome-hover/50 border border-chrome-border rounded"
            >
              <div>
                <span class="text-sm text-chrome-fg-secondary">From URL</span>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Install a .crx file from a direct download URL
                </p>
              </div>
              <div class="flex gap-2">
                <input
                  v-model="urlInput"
                  type="text"
                  placeholder="https://example.com/extension.crx"
                  class="flex-1 px-2 py-1.5 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary focus:outline-none focus:border-accent-soft"
                  @keydown.enter="handleInstallUrl"
                />
                <button
                  @click="handleInstallUrl"
                  :disabled="extensionsStore.installing || !urlInput.trim()"
                  class="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-white text-sm rounded hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Spinner v-if="extensionsStore.installing" size="w-3.5 h-3.5" />
                  <span>Install</span>
                </button>
              </div>
            </div>

            <!-- Unpacked -->
            <button
              @click="handleInstallUnpacked"
              :disabled="extensionsStore.installing"
              class="w-full flex items-center gap-3 px-3 py-3 bg-chrome-hover/50 border border-chrome-border rounded hover:border-accent transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                class="w-4 h-4 text-chrome-fg-muted shrink-0"
              >
                <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v3.26a3.235 3.235 0 0 1 1.75-.51h12.5c.644 0 1.245.188 1.75.51V6.75A1.75 1.75 0 0 0 16.25 5h-4.836a.25.25 0 0 1-.177-.073L9.823 3.513A1.75 1.75 0 0 0 8.586 3H3.75ZM3.75 9A1.75 1.75 0 0 0 2 10.75v4.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-4.5A1.75 1.75 0 0 0 16.25 9H3.75Z" />
              </svg>
              <div>
                <div class="text-sm text-chrome-fg-secondary">Load Unpacked Extension</div>
                <p class="text-xs text-chrome-fg-faint mt-0.5">
                  Pick a folder containing manifest.json (developer mode)
                </p>
              </div>
            </button>

            <!-- Active install progress -->
            <div
              v-if="extensionsStore.installing"
              class="flex items-center gap-2 px-3 py-2 text-xs text-chrome-fg-muted"
            >
              <Spinner size="w-3.5 h-3.5" color="text-chrome-fg-muted" />
              <span>{{ extensionsStore.installLabel }}</span>
            </div>
          </div>
        </div>

        <!-- Installed list -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-chrome-fg-secondary uppercase tracking-wider">
              Installed
            </h3>
            <span class="text-xs text-chrome-fg-faint"
              >{{ extensionsStore.entries.length }} extension{{
                extensionsStore.entries.length === 1 ? '' : 's'
              }}</span
            >
          </div>

          <div
            v-if="extensionsStore.loading && extensionsStore.entries.length === 0"
            class="px-3 py-6 text-center text-sm text-chrome-fg-faint"
          >
            Loading…
          </div>

          <div
            v-else-if="extensionsStore.entries.length === 0"
            class="px-3 py-6 text-center text-sm text-chrome-fg-faint bg-chrome-hover/30 border border-dashed border-chrome-border rounded"
          >
            No extensions installed yet
          </div>

          <div v-else class="space-y-2">
            <div
              v-for="entry in extensionsStore.entries"
              :key="entry.id"
              class="flex items-start gap-3 px-3 py-3 bg-chrome-hover/50 border border-chrome-border rounded"
            >
              <img
                :src="`crx://extension-icon/${entry.id}/32/${entry.enabled ? 1 : 0}`"
                :alt="entry.name"
                class="w-8 h-8 shrink-0 rounded"
                @error="($event.target as HTMLImageElement).style.visibility = 'hidden'"
              />
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-chrome-fg-primary truncate">
                    {{ entry.name }}
                  </span>
                  <span class="text-xs text-chrome-fg-faint">v{{ entry.version }}</span>
                </div>
                <p
                  v-if="entry.description"
                  class="text-xs text-chrome-fg-muted mt-0.5 line-clamp-2"
                >
                  {{ entry.description }}
                </p>
                <p class="text-xs text-chrome-fg-faint mt-1">
                  {{ sourceLabel(entry.source) }} · {{ entry.id }}
                </p>
                <div v-if="groupsStore.sortedGroups.length > 0" class="mt-2">
                  <p class="text-xs text-chrome-fg-muted mb-1">Active in groups:</p>
                  <div class="flex flex-wrap gap-x-3 gap-y-1">
                    <label
                      v-for="group in groupsStore.sortedGroups"
                      :key="group.id"
                      class="flex items-center gap-1.5 text-xs text-chrome-fg-secondary cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        :checked="isActiveInGroup(entry, group.id)"
                        :disabled="extensionsStore.isBusy(entry.id)"
                        @change="toggleGroup(entry, group.id, ($event.target as HTMLInputElement).checked)"
                        class="w-3.5 h-3.5 cursor-pointer disabled:opacity-50"
                      />
                      <span class="truncate">{{ group.name }}</span>
                    </label>
                  </div>
                </div>
                <p
                  v-if="extensionsStore.isBusy(entry.id)"
                  class="flex items-center gap-1.5 text-xs text-chrome-fg-muted mt-1.5"
                >
                  <Spinner size="w-3 h-3" color="text-chrome-fg-muted" />
                  <span>{{ extensionsStore.busyLabel(entry.id) }}</span>
                </p>
              </div>
              <fieldset
                :disabled="extensionsStore.isBusy(entry.id)"
                class="flex flex-col items-end gap-2 shrink-0 disabled:opacity-50 disabled:pointer-events-none"
              >
                <label class="flex items-center gap-1.5 cursor-pointer">
                  <span class="text-xs text-chrome-fg-muted">{{ entry.enabled ? 'On' : 'Off' }}</span>
                  <input
                    type="checkbox"
                    :checked="entry.enabled"
                    @change="handleToggle(entry.id, ($event.target as HTMLInputElement).checked)"
                    class="w-4 h-4 cursor-pointer"
                  />
                </label>
                <button
                  @click="handleClearData(entry.id, entry.name)"
                  class="text-xs text-chrome-fg-muted hover:text-chrome-fg-primary hover:underline"
                  title="Sign out and wipe the extension's stored data across all groups"
                >
                  Clear data
                </button>
                <button
                  @click="handleRemove(entry.id, entry.name)"
                  class="text-xs text-semantic-danger hover:underline"
                >
                  Remove
                </button>
              </fieldset>
            </div>
          </div>
        </div>

        <!-- Notes -->
        <div class="text-xs text-chrome-fg-faint space-y-1.5 pt-2">
          <p>
            Extensions are loaded into every group's isolated session, so each group keeps its own
            extension storage (e.g. separate Bitwarden vault state per group).
          </p>
          <p>
            Bitwarden biometric unlock via the desktop app is not supported in Electron-based
            browsers; use the master password instead.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
