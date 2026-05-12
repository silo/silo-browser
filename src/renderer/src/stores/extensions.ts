import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ExtensionsResult, InstalledExtensionEntry } from '../../../preload/index.d'

/** Label shown next to an install action while it's in flight. */
type InstallLabel = 'Installing from Chrome Web Store…' | 'Downloading from URL…' | 'Loading unpacked extension…'

/** Label shown on a row while a per-extension operation is in flight. */
type PerExtensionLabel =
  | 'Enabling…'
  | 'Disabling…'
  | 'Clearing data…'
  | 'Removing…'
  | 'Updating active groups…'

export const useExtensionsStore = defineStore('extensions', () => {
  const entries = ref<InstalledExtensionEntry[]>([])
  const loading = ref(false)
  const lastError = ref<string | null>(null)

  // ── Progress tracking ────────────────────────────────────────────────────

  // Set when one of the install actions is running (we don't have an extension
  // id until install completes, hence a global rather than per-row state).
  const installLabel = ref<InstallLabel | null>(null)
  const installing = computed(() => installLabel.value !== null)

  // Per-extension operation label. Set while clearData / setEnabled / remove
  // is running for a given id; used to disable the row's controls and show a
  // spinner with the label next to them.
  const busyByExtension = ref<Record<string, PerExtensionLabel>>({})
  function isBusy(id: string): boolean {
    return id in busyByExtension.value
  }
  function busyLabel(id: string): PerExtensionLabel | undefined {
    return busyByExtension.value[id]
  }

  // ── Cross-cutting state ──────────────────────────────────────────────────

  // Bumped after any mutation that could change which extension actions are
  // active. Used by the navbar to force `<browser-action-list>` to remount and
  // re-query state — the library caches its action list and doesn't always
  // pick up an extension that was unloaded/reloaded mid-session.
  const refreshTick = ref(0)

  // Set after operations that wipe extension data — Electron caches
  // chrome.storage state in-memory per session and won't release it until the
  // app restarts, so the wiped data appears to come back until relaunch.
  const needsRestart = ref(false)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function bumpRefresh(): void {
    refreshTick.value++
  }

  function markRestartNeeded(): void {
    needsRestart.value = true
  }

  function clearError(): void {
    lastError.value = null
  }

  async function refresh(): Promise<void> {
    loading.value = true
    try {
      entries.value = await window.api.extensionsList()
    } finally {
      loading.value = false
    }
  }

  /**
   * Run a backend mutation while toggling the global install indicator. The
   * `installLabel` is what's shown in the UI (e.g. "Installing from Chrome Web
   * Store…"). Returns whether the operation succeeded.
   */
  async function runInstall(
    label: InstallLabel,
    invoke: () => Promise<ExtensionsResult>
  ): Promise<boolean> {
    installLabel.value = label
    lastError.value = null
    try {
      const result = await invoke()
      if (!result.ok) {
        lastError.value = result.error ?? 'Install failed'
        return false
      }
      // User dismissed the compatibility prompt OR closed the unpacked folder
      // picker. Either way it's a deliberate cancel — silently bail.
      if (result.cancelled || result.entry === null) {
        return false
      }
      await refresh()
      bumpRefresh()
      return true
    } finally {
      installLabel.value = null
    }
  }

  /**
   * Same as `runInstall` but for operations scoped to a specific extension —
   * tracks per-row busy state and the operation label.
   */
  async function runPerExtension(
    id: string,
    label: PerExtensionLabel,
    invoke: () => Promise<ExtensionsResult>,
    options: { onSuccess?: () => void } = {}
  ): Promise<void> {
    lastError.value = null
    busyByExtension.value[id] = label
    try {
      const result = await invoke()
      if (!result.ok) {
        lastError.value = result.error ?? 'Operation failed'
        return
      }
      options.onSuccess?.()
    } finally {
      delete busyByExtension.value[id]
      await refresh()
      bumpRefresh()
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────

  const installFromWebStore = (input: string): Promise<boolean> =>
    runInstall('Installing from Chrome Web Store…', () =>
      window.api.extensionsInstallFromWebstore(input)
    )

  const installFromUrl = (url: string): Promise<boolean> =>
    runInstall('Downloading from URL…', () => window.api.extensionsInstallFromUrl(url))

  const installUnpacked = (): Promise<boolean> =>
    runInstall('Loading unpacked extension…', () => window.api.extensionsInstallUnpacked())

  const setEnabled = (id: string, enabled: boolean): Promise<void> =>
    runPerExtension(id, enabled ? 'Enabling…' : 'Disabling…', () =>
      window.api.extensionsSetEnabled(id, enabled)
    )

  const clearData = (id: string): Promise<void> =>
    runPerExtension(id, 'Clearing data…', () => window.api.extensionsClearData(id), {
      onSuccess: markRestartNeeded
    })

  const remove = (id: string): Promise<void> =>
    runPerExtension(id, 'Removing…', () => window.api.extensionsRemove(id), {
      onSuccess: markRestartNeeded
    })

  const setActiveGroups = (id: string, groupIds: string[]): Promise<void> =>
    runPerExtension(id, 'Updating active groups…', () =>
      window.api.extensionsSetActiveGroups(id, groupIds)
    )

  return {
    entries,
    loading,
    installing,
    installLabel,
    lastError,
    refreshTick,
    needsRestart,
    isBusy,
    busyLabel,
    refresh,
    installFromWebStore,
    installFromUrl,
    installUnpacked,
    setEnabled,
    setActiveGroups,
    remove,
    clearData,
    clearError
  }
})
