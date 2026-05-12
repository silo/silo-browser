import { app, BrowserWindow, dialog } from 'electron'
import { existsSync } from 'fs'
import { mkdir, rename, rm } from 'fs/promises'
import { join } from 'path'
import { downloadExtension } from 'electron-chrome-web-store'

import { type InstalledExtensionEntry } from '../store'
import { extensionsManager } from './manager'
import {
  deleteEntry,
  entryFromLoaded,
  findEntry,
  listEntries,
  saveEntry
} from './registry'
import { downloadAndUnpackCrx } from './crx'
import { deleteExtensionDataOnDisk } from './storage'
import { analyzeManifest, describeReport, type ChromeManifest } from './compatibility'
import { prependCompatStubsToServiceWorker } from './sw-stub-injection'

/**
 * High-level install / uninstall / enable / clear-data workflows.
 *
 * These functions are the surface that the renderer (via IPC) interacts with.
 * They coordinate the `ExtensionsManager` (per-session wiring), the persisted
 * registry, the CRX downloader, and the on-disk storage cleaner.
 */

const EXTENSION_ID_RE = /^[a-z]{32}$/i
const WEBSTORE_URL_RE = /chromewebstore\.google\.com\/detail\/[^/]+\/([a-z]{32})/i
const POST_CLEAR_SETTLE_MS = 150

// ── Install serialization ────────────────────────────────────────────────
//
// All three install paths share the same install directory (`<userData>/
// Extensions/<id>/<version>/`) and briefly load into the main session to
// learn the manifest. Two concurrent installs of the same extension race
// on `wipeInstallDir` / `downloadExtension` / `loadIntoMainSessionWithRetry`
// and surface as ENOTEMPTY or "extension already loaded" errors.
//
// Serializing the whole install pipeline is simpler than per-id locking
// and the user-visible cost is trivial: a second click queues behind the
// first instead of failing halfway.
let installChain: Promise<unknown> = Promise.resolve()

function runExclusiveInstall<T>(task: () => Promise<T>): Promise<T> {
  const next = installChain.then(task, task)
  installChain = next.catch(() => {})
  return next
}

// ── Public read-only ─────────────────────────────────────────────────────

export async function listExtensions(): Promise<InstalledExtensionEntry[]> {
  return listEntries()
}

// ── Install paths ────────────────────────────────────────────────────────

/**
 * Install from the Chrome Web Store given either a raw extension id or a
 * `chromewebstore.google.com/detail/<name>/<id>` URL.
 */
export function installFromWebStore(input: string): Promise<InstalledExtensionEntry> {
  return runExclusiveInstall(async () => {
    const id = parseWebStoreInput(input)
    if (!id) throw new Error('Invalid extension ID or Chrome Web Store URL')

    // Unload existing copy so loadExtension doesn't throw on re-install.
    extensionsManager.unloadEverywhere(id)

    // Clean stale install dirs left by a previous crashed install. If the
    // registry has no entry for this id, anything on disk is garbage that will
    // make the downloader's rename fail with ENOTEMPTY.
    if (!findEntry(id)) {
      await wipeInstallDir(id)
    }

    const extensionPath = await downloadExtensionWithRetry(id)
    try {
      return await registerInstall(extensionPath, 'webstore')
    } catch (err) {
      if (isCancellation(err)) await wipeInstallDir(id)
      throw err
    }
  })
}

/**
 * Install from an arbitrary `https://…/foo.crx` URL. The CRX is unpacked into
 * `<userData>/Extensions/<id>/<version>/`, the same layout the Web Store
 * installer uses.
 */
export function installFromUrl(url: string): Promise<InstalledExtensionEntry> {
  return runExclusiveInstall(async () => {
    if (!/^https?:\/\//i.test(url)) {
      throw new Error('URL must start with http:// or https://')
    }

    const stagingDir = await downloadAndUnpackCrx(url)

    // Briefly load the staged copy to learn the id and version, then unload.
    let loaded: Electron.Extension
    try {
      loaded = await loadIntoMainSessionWithRetry(stagingDir)
    } catch (err) {
      await rm(stagingDir, { recursive: true, force: true }).catch((rmErr) =>
        console.warn(`[extensions] failed to clean up staging dir ${stagingDir}:`, rmErr)
      )
      throw err
    }

    const finalDir = join(extensionsDir(), loaded.id, loaded.version)
    await mkdir(join(extensionsDir(), loaded.id), { recursive: true })
    if (existsSync(finalDir)) {
      await rm(finalDir, { recursive: true, force: true })
    }
    // Unload the staged copy from the main session before renaming — Electron
    // keeps the directory busy while the extension is loaded.
    extensionsManager.mainSession().extensions.removeExtension(loaded.id)
    try {
      await rename(stagingDir, finalDir)
    } catch (err) {
      // Rename across filesystems can fail — leave files where they are; the
      // path is recorded in the registry either way.
      console.warn(`[extensions] rename of staging dir failed (using staging path):`, err)
    }

    const settledPath = existsSync(finalDir) ? finalDir : stagingDir
    try {
      return await registerInstall(settledPath, 'url')
    } catch (err) {
      if (isCancellation(err)) await wipeInstallDir(loaded.id)
      throw err
    }
  })
}

/**
 * Prompt the user to pick a folder containing `manifest.json` and load it
 * in-place. We don't copy — developers usually want to keep editing.
 */
export function installUnpacked(): Promise<InstalledExtensionEntry | null> {
  return runExclusiveInstall(async () => {
    const filePaths = await pickExtensionFolder()
    if (!filePaths) return null
    const sourcePath = filePaths[0]

    if (!existsSync(join(sourcePath, 'manifest.json'))) {
      throw new Error('Selected folder does not contain manifest.json')
    }

    return await registerInstall(sourcePath, 'unpacked')
  })
}

/** Sentinel — `registerInstall` throws this when the user cancels the
 * compatibility warning dialog. IPC layer treats it as "no error, no entry". */
export const INSTALL_CANCELLED = 'silo:install-cancelled'

export function isCancellation(err: unknown): boolean {
  return err instanceof Error && err.message === INSTALL_CANCELLED
}

/**
 * Shared back end for all install paths: extract metadata, run a manifest
 * compatibility check (prompting the user if anything is unsupported), then
 * persist the registry entry and load it into the active per-group sessions.
 */
async function registerInstall(
  path: string,
  source: InstalledExtensionEntry['source']
): Promise<InstalledExtensionEntry> {
  // Load briefly into the main session to learn id / name / version / manifest,
  // then immediately unload — we don't want extensions to actually run there.
  const loaded = await loadIntoMainSessionWithRetry(path)
  const manifest = loaded.manifest as ChromeManifest
  const entry: InstalledExtensionEntry = {
    ...entryFromLoaded(loaded, source),
    path,
    activeGroupIds: extensionsManager.allGroupIds()
  }
  extensionsManager.mainSession().extensions.removeExtension(loaded.id)

  // Compatibility gate — if the manifest declares APIs we can't fully support,
  // explain the consequences and let the user back out.
  const proceed = await confirmIfIncompatible(manifest)
  if (!proceed) {
    throw new Error(INSTALL_CANCELLED)
  }

  // Prepend chrome.* stub definitions to the SW script. This is the only
  // place we can reliably define the stubs in the same main world the SW
  // actually runs in — Electron 42's SW preloads run in a sibling world the
  // background.js script never sees.
  if (manifest?.background?.service_worker) {
    const modified = await prependCompatStubsToServiceWorker(path, manifest)
    if (modified) {
      console.log(
        `[extensions] prepended compat stubs to SW of ${entry.id} (${manifest.background.service_worker})`
      )
    }
  }

  await saveEntry(entry)
  await extensionsManager.reconcileEntry(entry)
  return entry
}

/**
 * Returns true if the user wants to proceed with installing. When the
 * manifest is fully compatible we never prompt and return true immediately.
 */
async function confirmIfIncompatible(manifest: ChromeManifest): Promise<boolean> {
  const report = analyzeManifest(manifest)
  if (report.fullyCompatible) return true

  const detail = describeReport(report)
  const win = BrowserWindow.getFocusedWindow() ?? undefined
  const options: Electron.MessageBoxOptions = {
    type: report.hasUnsupported ? 'warning' : 'info',
    title: `Install "${report.name}"?`,
    message: report.hasUnsupported
      ? `${report.name} uses Chrome APIs that Silo does not support. Some features won't work and the extension may crash.`
      : `${report.name} uses some Chrome APIs that Silo supports only partially. Most features should work; some won't.`,
    detail,
    buttons: ['Cancel', 'Install anyway'],
    defaultId: report.hasUnsupported ? 0 : 1,
    cancelId: 0,
    noLink: true
  }
  const { response } = win
    ? await dialog.showMessageBox(win, options)
    : await dialog.showMessageBox(options)
  return response === 1
}

// ── Lifecycle ────────────────────────────────────────────────────────────

export async function setExtensionEnabled(
  extensionId: string,
  enabled: boolean
): Promise<InstalledExtensionEntry | null> {
  const entry = findEntry(extensionId)
  if (!entry) return null

  const updated = { ...entry, enabled }
  await saveEntry(updated)
  await extensionsManager.reconcileEntry(updated)
  return updated
}

/**
 * Change which groups an extension is active in. The extension's session
 * data persists in groups it was already active in (so it doesn't lose
 * vault state, etc); when it's later re-activated in those groups its
 * stored state is right where it left it.
 */
export async function setActiveGroups(
  extensionId: string,
  groupIds: string[]
): Promise<InstalledExtensionEntry | null> {
  const entry = findEntry(extensionId)
  if (!entry) return null

  // Filter to known groups only — guards against stale ids from the renderer.
  const validGroupIds = extensionsManager.allGroupIds()
  const filtered = groupIds.filter((id) => validGroupIds.includes(id))

  const updated = { ...entry, activeGroupIds: filtered }
  await saveEntry(updated)
  await extensionsManager.reconcileEntry(updated)
  return updated
}

/**
 * Group-deletion hook: invoked by the groups IPC handler when a group is
 * being removed. Strips the deleted group from every extension's
 * `activeGroupIds` and unloads any extensions still running in that
 * group's session.
 */
export async function handleGroupDeleted(groupId: string): Promise<void> {
  extensionsManager.unloadAllFromGroup(groupId)

  const entries = listEntries()
  let changed = false
  const updated = entries.map((entry) => {
    if (entry.activeGroupIds && entry.activeGroupIds.includes(groupId)) {
      changed = true
      return { ...entry, activeGroupIds: entry.activeGroupIds.filter((g) => g !== groupId) }
    }
    return entry
  })
  if (!changed) return

  for (const entry of updated) {
    await saveEntry(entry)
  }
}

/**
 * Wipe stored data without uninstalling. We unload everywhere so Chromium
 * releases file handles before wiping, then reload into the entry's active
 * sessions if it was enabled. The renderer bumps its `refreshTick` after the
 * IPC returns, which remounts `<browser-action-list>` to pick up the new
 * (signed-out) icon state.
 */
export async function clearExtensionData(
  extensionId: string
): Promise<InstalledExtensionEntry | null> {
  const entry = findEntry(extensionId)
  if (!entry) return null

  extensionsManager.unloadEverywhere(extensionId)
  await wipeExtensionData(extensionId)
  if (entry.enabled) await extensionsManager.reconcileEntry(entry)

  return entry
}

/** Fully uninstall: unload, wipe data, delete files, remove from registry. */
export async function removeExtension(extensionId: string): Promise<void> {
  const entry = findEntry(extensionId)

  extensionsManager.unloadEverywhere(extensionId)
  await wipeExtensionData(extensionId)
  await deleteEntry(extensionId)

  // Only delete files for Store / URL installs; unpacked extensions live in
  // user-managed locations and we shouldn't touch them.
  if (entry && entry.source !== 'unpacked') {
    const installRoot = join(extensionsDir(), extensionId)
    if (existsSync(installRoot)) {
      await rm(installRoot, { recursive: true, force: true }).catch((err) =>
        console.warn(`[extensions] failed to remove install dir ${installRoot}:`, err)
      )
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Accept either a raw 32-char id or a Chrome Web Store detail URL. */
export function parseWebStoreInput(input: string): string | null {
  const trimmed = input.trim()
  if (EXTENSION_ID_RE.test(trimmed)) return trimmed.toLowerCase()
  const match = trimmed.match(WEBSTORE_URL_RE)
  return match ? match[1].toLowerCase() : null
}

function extensionsDir(): string {
  return join(app.getPath('userData'), 'Extensions')
}

/** Recursively delete the on-disk install directory for an extension. */
async function wipeInstallDir(extensionId: string): Promise<void> {
  const root = join(extensionsDir(), extensionId)
  if (!existsSync(root)) return
  await rm(root, { recursive: true, force: true }).catch((err) =>
    console.warn(`[extensions] failed to wipe stale install dir for ${extensionId}:`, err)
  )
}

/**
 * Wrap `downloadExtension` to recover from `ENOTEMPTY` errors caused by a
 * stale install directory (a previous install that crashed before cleanup).
 */
async function downloadExtensionWithRetry(extensionId: string): Promise<string> {
  try {
    return await downloadExtension(extensionId, extensionsDir())
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (!/ENOTEMPTY|EEXIST/.test(message)) throw err
    await wipeInstallDir(extensionId)
    return await downloadExtension(extensionId, extensionsDir())
  }
}

/**
 * Briefly load an extension in the main session — just long enough to read
 * the normalised `Electron.Extension` (id/name/version/manifest). Callers
 * are responsible for unloading right after.
 *
 * If the id is already loaded somewhere (re-install), unloads everywhere
 * first and retries once.
 */
async function loadIntoMainSessionWithRetry(path: string): Promise<Electron.Extension> {
  const session = extensionsManager.mainSession()
  try {
    return await session.extensions.loadExtension(path, { allowFileAccess: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const idMatch = message.match(/extension with id ['"]?([a-z]{32})['"]?/i)
    if (!idMatch) throw err
    extensionsManager.unloadEverywhere(idMatch[1])
    return await session.extensions.loadExtension(path, { allowFileAccess: true })
  }
}

async function pickExtensionFolder(): Promise<string[] | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Load Unpacked Extension',
    message: 'Select the extension folder containing manifest.json',
    properties: ['openDirectory']
  }
  const result = await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths
}

/**
 * The data wipe used by both `clearExtensionData` and `removeExtension`:
 *
 *   1. flushStorageData so in-memory writes hit disk first
 *   2. session.clearData() across all sessions (covers cookies / IndexedDB /
 *      localStorage / serviceWorkers / cache / fileSystems / backgroundFetch)
 *   3. brief settle to let Chromium release file handles
 *   4. delete what clearData can't touch: chrome.storage.local leveldb dirs
 *      (the part that survives between sessions until app restart)
 *
 * Note: Electron caches some of this state in-memory until the next process
 * launch, which is why the UI prompts a restart after these operations.
 */
async function wipeExtensionData(extensionId: string): Promise<void> {
  const origin = `chrome-extension://${extensionId}`
  const sessions = extensionsManager.allSessions()

  for (const session of sessions) {
    try {
      // flushStorageData is fire-and-forget; not a Promise.
      session.flushStorageData()
    } catch (err) {
      console.warn(`[extensions] flushStorageData failed for ${extensionId}:`, err)
    }
  }

  for (const session of sessions) {
    try {
      await session.clearData({
        origins: [origin],
        dataTypes: [
          'cookies',
          'localStorage',
          'indexedDB',
          'serviceWorkers',
          'cache',
          'fileSystems',
          'backgroundFetch'
        ]
      })
    } catch (err) {
      console.warn(`[extensions] clearData failed for ${extensionId}:`, err)
    }
  }

  await new Promise((resolve) => setTimeout(resolve, POST_CLEAR_SETTLE_MS))

  await deleteExtensionDataOnDisk(extensionId, extensionsManager.allPartitionStrings())
}
