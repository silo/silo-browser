import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  FolderSummary,
  JoinMode,
  RestorePointInfo,
  SyncStatus
} from '../../../shared/sync-types'
import { useGroupsStore } from './groups'
import { useTopbarTabsStore } from './topbar-tabs'
import { useUiStore } from './ui'

/**
 * Folder sync UI state. The work happens in the main process (src/main/sync); this store shows
 * its status and drives the setup, "removed elsewhere" and restore dialogs.
 */
export const useSyncStore = defineStore('sync', () => {
  const status = ref<SyncStatus | null>(null)
  const enabled = computed(() => !!status.value?.enabled)

  // Setup dialog: open once a folder was picked
  const setup = ref<FolderSummary | null>(null)
  const error = ref('')
  const busy = ref(false)

  // "Another computer removed several silos": the dialog can be put off ("Decide later")
  const removalDismissed = ref(false)
  const showRemovalDialog = computed(
    () => !!status.value?.pendingRemoval && !removalDismissed.value
  )

  const restoreOpen = ref(false)
  const restorePoints = ref<RestorePointInfo[]>([])

  let listening = false
  async function init(): Promise<void> {
    if (!listening) {
      listening = true
      window.api.onSyncStatus((s) => setStatus(s))
      window.api.onSyncPatch((patch) => {
        useGroupsStore().applySyncPatch(patch)
        useUiStore().applySyncSettings(patch.settings)
      })
    }
    setStatus(await window.api.syncGetStatus())
  }

  function setStatus(s: SyncStatus | null): void {
    // A new question after the last one was answered or resolved itself
    if (!s?.pendingRemoval || !status.value?.pendingRemoval) removalDismissed.value = false
    status.value = s
  }

  /** Opens the folder picker, then the setup dialog. */
  async function chooseFolder(): Promise<void> {
    error.value = ''
    const res = await window.api.syncChooseFolder()
    if (!res) return
    if (!res.ok) {
      error.value = res.error
      return
    }
    setup.value = res.summary
  }

  async function start(mode: JoinMode, localOnly: string[]): Promise<boolean> {
    busy.value = true
    error.value = ''
    try {
      // Mark the silos that stay here first, so the store and the main process agree
      const groups = useGroupsStore()
      for (const g of groups.groups) {
        const keep = localOnly.includes(g.id)
        if (!!g.localOnly !== keep) groups.updateGroup(g.id, { localOnly: keep || undefined })
      }
      const res = await window.api.syncStart(mode, localOnly)
      if (!res.ok) {
        error.value = res.error
        return false
      }
      setStatus(res.status)
      setup.value = null
      return true
    } finally {
      busy.value = false
    }
  }

  function cancelSetup(): void {
    setup.value = null
    error.value = ''
  }

  async function stop(): Promise<void> {
    setStatus(await window.api.syncStop())
  }

  async function resolveRemoval(apply: boolean): Promise<void> {
    setStatus(await window.api.syncResolveRemoval(apply))
  }

  async function syncNow(): Promise<void> {
    setStatus(await window.api.syncNow())
  }

  async function openRestore(): Promise<void> {
    restorePoints.value = await window.api.syncListRestorePoints()
    restoreOpen.value = true
  }

  async function restore(id: string): Promise<boolean> {
    const ok = await window.api.syncRestore(id)
    if (!ok) return false
    // Same as importing a configuration: reload everything from the saved state
    await useGroupsStore().loadFromDisk()
    await useTopbarTabsStore().loadFromDisk()
    await useUiStore().loadFromDisk()
    restoreOpen.value = false
    return true
  }

  return {
    status,
    enabled,
    setup,
    error,
    busy,
    removalDismissed,
    showRemovalDialog,
    restoreOpen,
    restorePoints,
    init,
    chooseFolder,
    start,
    cancelSetup,
    stop,
    resolveRemoval,
    syncNow,
    openRestore,
    restore
  }
})
