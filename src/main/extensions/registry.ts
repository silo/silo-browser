import type { Extension } from 'electron'
import { getCachedState, saveState, type InstalledExtensionEntry } from '../store'

/**
 * Read/write helpers for the persisted list of installed extensions.
 * The list lives in `PersistedState.installedExtensions` (see ../store.ts).
 */

export function listEntries(): InstalledExtensionEntry[] {
  return getCachedState().installedExtensions ?? []
}

export function findEntry(extensionId: string): InstalledExtensionEntry | null {
  return listEntries().find((entry) => entry.id === extensionId) ?? null
}

export async function saveEntry(entry: InstalledExtensionEntry): Promise<void> {
  const without = listEntries().filter((existing) => existing.id !== entry.id)
  await saveState({ installedExtensions: [...without, entry] })
}

export async function deleteEntry(extensionId: string): Promise<void> {
  await saveState({
    installedExtensions: listEntries().filter((entry) => entry.id !== extensionId)
  })
}

/** Build a registry entry from a freshly-loaded Electron.Extension. */
export function entryFromLoaded(
  loaded: Extension,
  source: InstalledExtensionEntry['source'],
  enabled = true
): InstalledExtensionEntry {
  const manifest = loaded.manifest as { description?: string }
  return {
    id: loaded.id,
    name: loaded.name,
    version: loaded.version,
    description: manifest.description,
    enabled,
    path: loaded.path,
    source
  }
}
