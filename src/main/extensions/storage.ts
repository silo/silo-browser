import { app } from 'electron'
import { existsSync } from 'fs'
import { readdir, rm } from 'fs/promises'
import { join } from 'path'

const EXTENSION_ID_RE = /^[a-z]{32}$/

// chrome.storage.{local,sync,managed} each live in a dir keyed by extension id.
// session.clearData() doesn't touch these — they're a separate leveldb store.
const EXTENSION_KEYED_DIRS = [
  'Local Extension Settings',
  'Sync Extension Settings',
  'Managed Extension Settings'
] as const

// Directories whose *entries* contain the extension id in their name.
const EXTENSION_PREFIXED_DIRS = [
  // IndexedDB files look like `chrome-extension_<id>_0.indexeddb.leveldb`.
  { dir: 'IndexedDB', prefix: (id: string) => `chrome-extension_${id}_` },
  // The rest just embed the id somewhere in the entry name.
  { dir: 'Service Worker/Database', prefix: (id: string) => id },
  { dir: 'Service Worker/ScriptCache', prefix: (id: string) => id },
  { dir: 'File System', prefix: (id: string) => id },
  { dir: 'Storage', prefix: (id: string) => id },
  { dir: 'blob_storage', prefix: (id: string) => id }
] as const

/**
 * Resolve the on-disk root for a session partition string.
 * `'persist:foo'` → `<userData>/Partitions/foo`
 * `''` (default session) → `<userData>`
 */
export function partitionDataRoot(partition: string): string {
  const userData = app.getPath('userData')
  if (!partition) return userData
  const name = partition.startsWith('persist:') ? partition.slice('persist:'.length) : partition
  return join(userData, 'Partitions', name)
}

/**
 * Delete every on-disk artefact for an extension across the given session
 * partitions plus the default session. This is the workaround for Electron's
 * `session.clearData()` not covering `chrome.storage.local` and friends.
 *
 * Best-effort: silently swallows IO errors because Chromium may briefly hold
 * file handles after the extension is unloaded.
 *
 * @param extensionId 32-char extension id. Validated to prevent path traversal.
 * @param partitions  Partition strings (e.g. `'persist:silo-group-abc'`).
 *                    The default session is always included automatically.
 */
export async function deleteExtensionDataOnDisk(
  extensionId: string,
  partitions: string[]
): Promise<void> {
  if (!EXTENSION_ID_RE.test(extensionId)) return

  const allPartitions = ['', ...partitions]
  for (const partition of allPartitions) {
    const root = partitionDataRoot(partition)
    if (!existsSync(root)) continue

    for (const subdir of EXTENSION_KEYED_DIRS) {
      await removeIfExists(join(root, subdir, extensionId))
    }

    for (const { dir, prefix } of EXTENSION_PREFIXED_DIRS) {
      const dirPath = join(root, dir)
      if (!existsSync(dirPath)) continue
      const entries = await readdir(dirPath).catch(() => [] as string[])
      const pfx = prefix(extensionId)
      for (const entry of entries) {
        if (entry.startsWith(pfx) || entry.includes(extensionId)) {
          await removeIfExists(join(dirPath, entry))
        }
      }
    }
  }
}

async function removeIfExists(path: string): Promise<void> {
  if (!existsSync(path)) return
  await rm(path, { recursive: true, force: true }).catch(() => {})
}
