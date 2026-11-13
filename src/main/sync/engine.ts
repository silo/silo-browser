/**
 * Folder sync engine (main process, no Electron imports so it can be tested with plain Node).
 *
 * - Local changes: every save of the local state is compared with the last one (see diffLocal);
 *   what the user changed is stamped into the records and our machine file is rewritten.
 * - Remote changes: the folder is watched (plus a 60 s poll and a check on window focus). New or
 *   changed machine files are merged into the records, and the difference between the local
 *   setup and the merged one is applied as a patch (to the persisted state here, and sent to the
 *   renderer, which applies it to its stores without reloading open tabs).
 * - Safety: a restore point is saved before sync changes anything; if another computer removed
 *   several silos at once, nothing is removed until the user says so; silos removed by sync keep
 *   their logins for 30 days (so restoring one brings it back signed in); unreadable files are
 *   skipped, never "fixed".
 *
 * Persistent engine state lives in `<userData>/silo-sync.json`, never in the sync folder.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  watch,
  writeFileSync
} from 'fs'
import type { FSWatcher } from 'fs'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'fs/promises'
import { basename, dirname, join } from 'path'
import { randomUUID } from 'crypto'
import * as M from '../../shared/sync-model'
import type {
  FolderSummary,
  JoinMode,
  RestorePointInfo,
  SyncMachine,
  SyncStatus
} from '../../shared/sync-types'

export type { FolderSummary, JoinMode, RestorePointInfo, SyncMachine, SyncStatus }

export const SYNC_DIR_NAME = 'Silo Browser'
const MACHINES_DIR = 'machines'
const STATE_FILE = 'silo-sync.json'
const RESTORE_DIR = 'sync-restore-points'
const RESTORE_KEEP = 20
const RESTORE_MIN_GAP_MS = 60 * 60 * 1000
const WIPE_DELAY_MS = 30 * 24 * 60 * 60 * 1000
const POLL_MS = 60 * 1000
const FOCUS_PULL_GAP_MS = 15 * 1000
const HEARTBEAT_MS = 6 * 60 * 60 * 1000
const WRITE_DELAY_MS = 1500
const MAX_FILE_BYTES = 30 * 1024 * 1024

const README = `This folder keeps your Silo Browser setup in sync between your computers.

Each computer that syncs writes its own file in "machines". Silo reads them all and combines
them, so it doesn't matter which computer changed what, or when.

Your silos, tabs and settings are stored here. Logins, cookies and site data are not: they
stay on each computer.

Please don't edit or move these files. To stop syncing a computer, open Silo's Settings.
`

export interface SyncHost {
  userDataDir: string
  /** For showing paths as "~/…" */
  homeDir: string
  platform: string
  appVersion: string
  machineName: string
  now(): number
  /** The current local state (silo-config.json contents). */
  getState(): Record<string, unknown>
  /** Writes keys into the local state and persists them, WITHOUT calling onLocalSave(). */
  writeState(partial: Record<string, unknown>): void
  validSetting(key: string, value: unknown): boolean
  /** Sends a patch to the renderer (only called while it's ready). */
  sendPatch(patch: M.SyncPatch): void
  clearSession(groupId: string): Promise<void>
  onStatus(status: SyncStatus): void
  log(message: string, err?: unknown): void
}

interface PersistedSync {
  version: 1
  machineId: string
  /** The resolved sync folder (".../Silo Browser"), or null when sync is off */
  folder: string | null
  records: M.Records
  clock: M.ClockState
  /** The synced view of the local state at its last save */
  base: M.SyncView | null
  /** What sync last made the local state look like */
  applied: M.SyncView | null
  /** Silos removed by sync → when their logins/site data get wiped */
  pendingWipes: Record<string, number>
  lastWriteId: string | null
  lastWriteAt: number
  lastSyncAt: number | null
}

interface MachineFile {
  version: number
  machine: { id: string; name: string; platform: string }
  writtenAt: number
  writeId: string | null
  records: M.Records
}

function isView(v: unknown): v is M.SyncView {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return [o.settings, o.silos, o.tabs].every(
    (x) => !!x && typeof x === 'object' && !Array.isArray(x)
  )
}

/** Reads a machine file's JSON. Returns null for anything that isn't one. */
export function parseMachineFile(raw: unknown): MachineFile | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.format !== M.SYNC_FORMAT || typeof o.version !== 'number') return null
  const m = o.machine as Record<string, unknown> | undefined
  if (!m || typeof m.id !== 'string' || !M.ID_RE.test(m.id)) return null
  return {
    version: o.version,
    machine: {
      id: m.id,
      name: typeof m.name === 'string' ? m.name.slice(0, 100) : 'Computer',
      platform: typeof m.platform === 'string' ? m.platform.slice(0, 20) : ''
    },
    writtenAt: typeof o.writtenAt === 'number' && Number.isFinite(o.writtenAt) ? o.writtenAt : 0,
    writeId: typeof o.writeId === 'string' ? o.writeId : null,
    records: o.version > M.SYNC_FORMAT_VERSION ? {} : M.sanitizeRecords(o.records)
  }
}

/** "iCloud Drive", "Dropbox", … from a path, else the name of the folder the user picked. */
export function folderLabel(folder: string): string {
  const p = folder.replace(/\\/g, '/')
  if (/Mobile Documents\/com~apple~CloudDocs|\/iCloud ?Drive(\/|$)/i.test(p)) return 'iCloud Drive'
  if (/\/(Dropbox|CloudStorage\/Dropbox)[^/]*(\/|$)/.test(p)) return 'Dropbox'
  if (/GoogleDrive-|\/Google Drive(\/|$)|\/My Drive(\/|$)/.test(p)) return 'Google Drive'
  if (/\/OneDrive[^/]*(\/|$)/.test(p)) return 'OneDrive'
  if (/CloudStorage\/Box|\/Box(\/|$)/.test(p)) return 'Box'
  const picked = basename(folder) === SYNC_DIR_NAME ? dirname(folder) : folder
  return basename(picked) || picked
}

/** The folder Silo syncs in: "<picked>/Silo Browser", or the picked folder if it is that folder. */
export function resolveSyncFolder(picked: string): string {
  return basename(picked) === SYNC_DIR_NAME ? picked : join(picked, SYNC_DIR_NAME)
}

function writeFileAtomicSync(path: string, data: string): void {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, data)
  try {
    renameSync(tmp, path)
  } catch {
    writeFileSync(path, data)
  }
}

export class SyncEngine {
  private host: SyncHost
  private s: PersistedSync
  private ready = false
  private needReconcile = false
  private busy = false
  private watcher: FSWatcher | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null
  private wipeTimer: ReturnType<typeof setInterval> | null = null
  private watchDebounce: ReturnType<typeof setTimeout> | null = null
  private writeTimer: ReturnType<typeof setTimeout> | null = null
  private persistTimer: ReturnType<typeof setTimeout> | null = null
  private pulling: Promise<void> | null = null
  private pullAgain = false
  private writing: Promise<void> = Promise.resolve()
  private lastWrittenRecords: string | null = null
  private lastFocusPull = 0
  private lastRestorePointAt = 0
  private machines = new Map<string, SyncMachine>()
  private error: string | null = null
  private newerVersion = false
  private held: { silos: string[]; tabs: number } | null = null
  /**
   * The local state as last saved by the renderer (or another real writer such as Import).
   * Sync's own writes don't change it: comparing against those would make a save the renderer
   * sent before it received an update look like the user undoing that update.
   */
  private reported: { groups: unknown; settings: Record<string, unknown> } = {
    groups: [],
    settings: {}
  }

  constructor(host: SyncHost) {
    this.host = host
    this.s = this.freshState()
  }

  get enabled(): boolean {
    return !!this.s.folder
  }

  get machineId(): string {
    return this.s.machineId
  }

  // --- Lifecycle ---------------------------------------------------------------------------

  /** Before the window opens: load our state, catch up on local changes, apply merged records. */
  startup(): void {
    this.load()
    this.resetReported()
    this.wipeTimer = setInterval(() => void this.runDueWipes(), 6 * 60 * 60 * 1000)
    this.wipeTimer.unref?.()
    void this.runDueWipes()
    if (!this.enabled) return
    try {
      this.detectLocal()
      this.reconcile({ beforeWindow: true })
    } catch (err) {
      this.host.log('sync startup failed', err)
    }
  }

  /** The renderer has loaded its stores and listens for patches. */
  rendererReady(): void {
    this.ready = true
    this.emitStatus()
    if (!this.enabled) return
    this.startWatching()
    if (this.needReconcile) this.reconcile()
    void this.pull()
  }

  /** The renderer is (re)loading: hold patches until it's ready again. */
  rendererGone(): void {
    this.ready = false
  }

  /** Called after every save of the local state (not for sync's own writes) with what was saved. */
  onLocalSave(partial: Record<string, unknown>): void {
    if ('groups' in partial) this.reported.groups = partial.groups
    for (const k of M.SETTINGS_KEYS) if (k in partial) this.reported.settings[k] = partial[k]
    if (!this.enabled || this.busy) return
    try {
      this.detectLocal()
    } catch (err) {
      this.host.log('sync: detecting local changes failed', err)
    }
  }

  onWindowFocus(): void {
    const now = this.host.now()
    if (!this.enabled || now - this.lastFocusPull < FOCUS_PULL_GAP_MS) return
    this.lastFocusPull = now
    void this.pull()
  }

  /** On quit: write what's pending, synchronously. */
  flushSync(): void {
    try {
      if (this.writeTimer && this.enabled) {
        clearTimeout(this.writeTimer)
        this.writeTimer = null
        this.writeOwnFileSync()
      }
      // Only if something is waiting to be saved: with sync off nothing is ever written
      if (this.persistTimer) {
        clearTimeout(this.persistTimer)
        this.persistTimer = null
        this.persistNow()
      }
    } catch (err) {
      this.host.log('sync: flush on quit failed', err)
    }
  }

  dispose(): void {
    this.stopWatching()
    for (const t of [this.writeTimer, this.persistTimer, this.watchDebounce]) if (t) clearTimeout(t)
    if (this.wipeTimer) clearInterval(this.wipeTimer)
    this.writeTimer = this.persistTimer = this.watchDebounce = this.wipeTimer = null
  }

  // --- Status --------------------------------------------------------------------------------

  status(): SyncStatus {
    const machines = [...this.machines.values()].sort((a, b) => b.lastSeen - a.lastSeen)
    if (this.enabled) {
      machines.unshift({
        id: this.s.machineId,
        name: this.host.machineName,
        platform: this.host.platform,
        lastSeen: this.s.lastWriteAt,
        isThis: true
      })
    }
    return {
      enabled: this.enabled,
      folder: this.s.folder,
      folderDisplay: this.s.folder ? this.displayPath(this.s.folder) : null,
      label: this.s.folder ? folderLabel(this.s.folder) : null,
      lastSyncAt: this.s.lastSyncAt,
      machines,
      thisMachine: this.host.machineName,
      error: this.error,
      newerVersion: this.newerVersion,
      pendingRemoval: this.held
    }
  }

  private displayPath(p: string): string {
    const home = this.host.homeDir
    return home && this.host.platform !== 'win32' && (p === home || p.startsWith(`${home}/`))
      ? `~${p.slice(home.length)}`
      : p
  }

  private emitStatus(): void {
    try {
      this.host.onStatus(this.status())
    } catch {
      // Window gone
    }
  }

  // --- Local changes -------------------------------------------------------------------------

  private localView(state = this.host.getState()): M.SyncView {
    return M.viewFromLocal(state.groups, state)
  }

  private resetReported(): void {
    const state = this.host.getState()
    this.reported = { groups: state.groups, settings: {} }
    for (const k of M.SETTINGS_KEYS) this.reported.settings[k] = state[k]
  }

  private detectLocal(): void {
    const next = M.viewFromLocal(this.reported.groups, this.reported.settings)
    if (!this.s.base || !this.s.applied) {
      this.s.base = next
      this.s.applied = this.s.applied ?? next
      this.schedulePersist()
      return
    }
    const changes = M.diffLocal(next, this.s.base, this.s.applied)
    const baseChanged = !M.valuesEqual(next, this.s.base)
    this.s.base = next
    if (M.hasChanges(changes)) {
      const stamp = M.nextStamp(this.s.clock, this.s.machineId, this.host.now())
      M.applyLocalChanges(this.s.records, changes, next, stamp, this.host.platform)
      this.s.applied = M.applyChangesToView(this.s.applied, changes, next)
      this.scheduleWrite()
    }
    if (baseChanged || M.hasChanges(changes)) this.schedulePersist()
  }

  // --- Applying merged records to the local state ----------------------------------------------

  private target(state = this.host.getState()): M.SyncView {
    const excludeSilos = new Set<string>()
    const excludeTabs = new Set<string>()
    for (const g of Array.isArray(state.groups) ? state.groups : []) {
      if (!g || g.localOnly !== true || typeof g.id !== 'string') continue
      excludeSilos.add(g.id)
      for (const t of Array.isArray(g.tabs) ? g.tabs : [])
        if (t && typeof t.id === 'string') excludeTabs.add(t.id)
    }
    return M.materialize(this.s.records, {
      platform: this.host.platform,
      excludeSilos,
      excludeTabs,
      validSetting: (k, v) => this.host.validSetting(k, v)
    })
  }

  private tooManyRemovals(r: { silos: string[]; tabs: string[] }, local: M.SyncView): boolean {
    const silos = r.silos.length
    const syncedSilos = Object.keys(local.silos).length
    const looseTabs = r.tabs.filter((id) => !r.silos.includes(local.tabs[id]?.groupId)).length
    const totalTabs = Object.keys(local.tabs).length
    return (
      silos >= 2 ||
      (silos >= 1 && silos === syncedSilos) ||
      (looseTabs >= 8 && looseTabs * 2 >= totalTabs)
    )
  }

  /**
   * Brings the local state to the merged setup. `force` skips the "several silos removed"
   * check (the user already chose), `beforeWindow` applies it before the renderer exists.
   */
  private reconcile(opts: { beforeWindow?: boolean; force?: boolean } = {}): void {
    if (!this.enabled) return
    if (!opts.beforeWindow && !this.ready) {
      this.needReconcile = true
      return
    }
    this.needReconcile = false
    // Local edits were already recorded when they were saved (onLocalSave)
    const state = this.host.getState()
    const local = this.localView(state)
    const target = this.target(state)
    const patch = M.diffViews(local, target)
    if (M.isEmptyPatch(patch)) {
      this.s.applied = target
      if (this.held) {
        this.held = null
        this.emitStatus()
      }
      this.schedulePersist()
      return
    }
    const removals = M.removalsIn(patch, local)
    if (!opts.force && this.tooManyRemovals(removals, local)) {
      const held = {
        silos: removals.silos.map((id) => local.silos[id].name),
        tabs: removals.tabs.length
      }
      if (!M.valuesEqual(held, this.held)) {
        this.held = held
        this.emitStatus()
      }
      return
    }
    this.held = null
    const removing = removals.silos.length > 0 || removals.tabs.length > 0
    this.saveRestorePoint(
      removing ? 'Before changes from another computer' : 'Before sync',
      removing
    )
    const removed = this.applyToLocal(patch, !!opts.beforeWindow)
    const due = this.host.now() + WIPE_DELAY_MS
    for (const id of removed) this.s.pendingWipes[id] = due
    this.s.applied = target
    this.schedulePersist()
    this.emitStatus()
  }

  private applyToLocal(patch: M.SyncPatch, beforeWindow: boolean): string[] {
    const state = this.host.getState()
    type Tab = { id: string; groupId: string; order: number }
    type Group = { id: string; order: number; localOnly?: boolean; tabs: Tab[] }
    const groups = JSON.parse(
      JSON.stringify(Array.isArray(state.groups) ? state.groups : [])
    ) as Group[]
    for (const g of groups) if (!Array.isArray(g.tabs)) g.tabs = []
    const removed = M.applyPatchToGroups<Tab, Group>(groups, patch, {
      newGroup: (id, f) => M.storedSilo(id, f) as unknown as Group,
      newTab: (id, f) => M.storedTab(id, f) as unknown as Tab
    })
    this.host.writeState({ groups, ...patch.settings })
    if (!beforeWindow && this.ready) this.host.sendPatch(patch)
    return removed
  }

  // --- Reading the folder --------------------------------------------------------------------

  /** Reads and merges new or changed machine files. Safe to call any time. */
  pull(): Promise<void> {
    if (!this.enabled) return Promise.resolve()
    if (this.pulling) {
      this.pullAgain = true
      return this.pulling
    }
    this.pulling = (async () => {
      do {
        this.pullAgain = false
        try {
          await this.pullOnce()
        } catch (err) {
          this.host.log('sync: reading the folder failed', err)
        }
      } while (this.pullAgain && this.enabled)
    })().finally(() => {
      this.pulling = null
    })
    return this.pulling
  }

  /**
   * Reads every machine file. All of them, every time: they're small, merging is idempotent,
   * and modified times can't be trusted (exFAT and network drives store them coarsely, so a
   * quick rewrite of the same size could look unchanged).
   */
  private async readMachineFiles(
    folder: string
  ): Promise<{ files: { name: string; file: MachineFile }[]; names: string[] } | null> {
    const dir = join(folder, MACHINES_DIR)
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      return null
    }
    const files: { name: string; file: MachineFile }[] = []
    for (const name of names) {
      if (!name.endsWith('.json') || name.startsWith('.')) continue
      const path = join(dir, name)
      try {
        const st = await stat(path)
        if (!st.isFile() || st.size > MAX_FILE_BYTES) continue
        // A cloud client may still be downloading it: skip until it parses
        const file = parseMachineFile(JSON.parse(await readFile(path, 'utf8')))
        if (file) files.push({ name, file })
      } catch {
        continue
      }
    }
    return { files, names }
  }

  private async pullOnce(): Promise<void> {
    const folder = this.s.folder
    if (!folder) return
    if (!existsSync(dirname(folder))) {
      this.setError("Can't find the sync folder. Is the drive connected?")
      return
    }
    const read = await this.readMachineFiles(folder)
    if (this.s.folder !== folder) return
    if (!read) {
      // The "Silo Browser" folder was removed or isn't there yet: write ours again
      this.setError(null)
      this.scheduleWrite(true)
      return
    }
    this.setError(null)
    let changed = false
    let ownFileForeign = false
    for (const { name, file } of read.files) {
      if (file.version > M.SYNC_FORMAT_VERSION) {
        this.newerVersion = true
        continue
      }
      const isOwn = file.machine.id === this.s.machineId
      if (isOwn && name === `${this.s.machineId}.json` && file.writeId !== this.s.lastWriteId) {
        if (file.writtenAt > this.s.lastWriteAt) {
          // Another installation writes as this computer (a copied profile). Take its changes,
          // then continue under a new id so the two don't overwrite each other's file.
          this.host.log('sync: another installation uses this machine id; switching to a new id')
          this.s.machineId = randomUUID()
          this.s.lastWriteId = null
          changed = true
        } else {
          ownFileForeign = true // an older copy came back (e.g. restored by the cloud): rewrite it
        }
      }
      if (!isOwn) {
        this.machines.set(file.machine.id, {
          id: file.machine.id,
          name: file.machine.name,
          platform: file.machine.platform,
          lastSeen: file.writtenAt,
          isThis: false
        })
      }
      if (M.mergeRecords(this.s.records, file.records)) changed = true
    }
    const seen = new Set(read.names)
    const max = M.maxStamp(this.s.records)
    if (max) M.observeStamp(this.s.clock, max)
    this.s.lastSyncAt = this.host.now()
    if (changed) {
      this.schedulePersist()
      this.reconcile()
      this.scheduleWrite()
    } else if (ownFileForeign || !seen.has(`${this.s.machineId}.json`)) {
      this.scheduleWrite(true)
    } else if (this.host.now() - this.s.lastWriteAt > HEARTBEAT_MS) {
      this.scheduleWrite(true)
    }
    this.emitStatus()
  }

  private setError(error: string | null): void {
    if (this.error === error) return
    this.error = error
    this.emitStatus()
  }

  // --- Writing our file ----------------------------------------------------------------------

  private scheduleWrite(force = false): void {
    if (!this.enabled) return
    if (force) this.lastWrittenRecords = null
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      void this.writeOwnFile()
    }, WRITE_DELAY_MS)
  }

  private machineDoc(writeId: string): string {
    return JSON.stringify({
      format: M.SYNC_FORMAT,
      version: M.SYNC_FORMAT_VERSION,
      machine: { id: this.s.machineId, name: this.host.machineName, platform: this.host.platform },
      appVersion: this.host.appVersion,
      writtenAt: this.host.now(),
      writeId,
      records: this.s.records
    })
  }

  /** Writes `<folder>/machines/<our id>.json` (temp file + rename, so it's never half-written). */
  writeOwnFile(): Promise<void> {
    this.writing = this.writing.then(async () => {
      const folder = this.s.folder
      if (!folder) return
      const records = JSON.stringify(this.s.records)
      if (records === this.lastWrittenRecords) return
      // Only ever create "Silo Browser" inside a folder that exists (not on an unplugged drive)
      if (!existsSync(dirname(folder))) {
        this.setError("Can't find the sync folder. Is the drive connected?")
        return
      }
      const dir = join(folder, MACHINES_DIR)
      const writeId = randomUUID()
      const final = join(dir, `${this.s.machineId}.json`)
      const tmp = join(dir, `.${this.s.machineId}.${writeId.slice(0, 8)}.tmp`)
      try {
        await mkdir(dir, { recursive: true })
        // Remember the write before making it, so a crash in between can't look like a copied profile
        this.s.lastWriteId = writeId
        this.s.lastWriteAt = this.host.now()
        this.persistNow()
        await writeFile(tmp, this.machineDoc(writeId))
        await rename(tmp, final)
        this.lastWrittenRecords = records
        this.setError(null)
      } catch (err) {
        this.host.log('sync: writing our file failed', err)
        await unlink(tmp).catch(() => {})
        this.setError("Can't write to the sync folder")
      }
      this.emitStatus()
    })
    return this.writing
  }

  private writeOwnFileSync(): void {
    const folder = this.s.folder
    if (!folder || !existsSync(dirname(folder))) return
    const dir = join(folder, MACHINES_DIR)
    const writeId = randomUUID()
    mkdirSync(dir, { recursive: true })
    this.s.lastWriteId = writeId
    this.s.lastWriteAt = this.host.now()
    this.persistNow()
    const tmp = join(dir, `.${this.s.machineId}.${writeId.slice(0, 8)}.tmp`)
    writeFileSync(tmp, this.machineDoc(writeId))
    renameSync(tmp, join(dir, `${this.s.machineId}.json`))
  }

  // --- Watching ------------------------------------------------------------------------------

  private startWatching(): void {
    this.stopWatching()
    if (!this.s.folder) return
    try {
      this.watcher = watch(join(this.s.folder, MACHINES_DIR), { persistent: false }, () => {
        if (this.watchDebounce) clearTimeout(this.watchDebounce)
        this.watchDebounce = setTimeout(() => void this.pull(), 1000)
      })
      this.watcher.on('error', () => {
        this.watcher?.close()
        this.watcher = null
      })
    } catch {
      // Some cloud and network drives can't be watched: the poll below covers them
      this.watcher = null
    }
    this.pollTimer = setInterval(() => void this.pull(), POLL_MS)
    this.pollTimer.unref?.()
  }

  private stopWatching(): void {
    this.watcher?.close()
    this.watcher = null
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.pollTimer = null
  }

  // --- Joining and leaving -------------------------------------------------------------------

  /** What's already in a folder the user picked (before they decide how to join). */
  async inspectFolder(picked: string): Promise<FolderSummary> {
    const folder = resolveSyncFolder(picked)
    const read = await this.readMachineFiles(folder)
    const records: M.Records = {}
    const machines: { name: string; lastSeen: number }[] = []
    let newerVersion = false
    for (const { file } of read?.files ?? []) {
      if (file.version > M.SYNC_FORMAT_VERSION) {
        newerVersion = true
        continue
      }
      M.mergeRecords(records, file.records)
      if (file.machine.id !== this.s.machineId) {
        machines.push({ name: file.machine.name, lastSeen: file.writtenAt })
      }
    }
    const view = M.materialize(records, { platform: this.host.platform })
    const sorted = Object.entries(view.silos).sort((a, b) => a[1].order - b[1].order)
    return {
      folder,
      folderDisplay: this.displayPath(folder),
      label: folderLabel(folder),
      machines: machines.sort((a, b) => b.lastSeen - a.lastSeen),
      silos: sorted.map(([, s]) => s.name),
      siloIds: sorted.map(([id]) => id),
      tabs: Object.keys(view.tabs).length,
      newerVersion
    }
  }

  /**
   * Starts syncing with a folder.
   * - combine: this computer's silos are added to the ones already there (theirs win where the
   *   same silo was changed on both)
   * - replace: this computer takes the setup in the folder; its other synced silos are removed
   * `localOnly`: ids of silos to keep on this computer only (decided in the setup dialog).
   */
  async start(picked: string, mode: JoinMode, localOnly: string[]): Promise<void> {
    if (this.busy) throw new Error('Sync is busy')
    const folder = resolveSyncFolder(picked)
    if (!existsSync(dirname(folder))) throw new Error("That folder doesn't exist")
    this.busy = true
    try {
      if (this.enabled) await this.stopNow()
      // 1. The folder must be writable
      await mkdir(join(folder, MACHINES_DIR), { recursive: true })
      const readme = join(folder, 'README.txt')
      if (!existsSync(readme)) await writeFile(readme, README)
      // 2. Merge what's there with this computer's setup
      const read = await this.readMachineFiles(folder)
      const remote: M.Records = {}
      for (const { file } of read?.files ?? []) {
        if (file.version <= M.SYNC_FORMAT_VERSION) M.mergeRecords(remote, file.records)
      }
      // 3. Mark "this computer only" silos. Right before reading the local setup, with nothing
      // awaited in between, so no save arriving meanwhile can drop the flags.
      const state = this.host.getState()
      const keepLocal = new Set(localOnly)
      const groups = (Array.isArray(state.groups) ? state.groups : []).map(
        (g: Record<string, unknown>) => {
          const copy = { ...g }
          if (keepLocal.has(copy.id as string)) copy.localOnly = true
          else delete copy.localOnly
          return copy
        }
      )
      this.host.writeState({ groups })
      this.resetReported()
      const local = this.localView()
      this.saveRestorePoint('Before turning on sync', true)
      let records: M.Records
      if (Object.keys(remote).length === 0) {
        // An empty folder: this computer's setup is the starting point
        records = M.recordsFromView(
          local,
          M.nextStamp(this.s.clock, this.s.machineId, this.host.now()),
          this.host.platform
        )
      } else if (mode === 'replace') {
        records = remote
      } else {
        // Our values carry the lowest stamp, so the folder's setup wins where both have a silo
        records = M.recordsFromView(local, M.zeroStamp(this.s.machineId), this.host.platform)
        M.mergeRecords(records, remote)
      }
      const max = M.maxStamp(records)
      if (max) M.observeStamp(this.s.clock, max)
      this.s.folder = folder
      this.s.records = records
      this.s.base = local
      this.s.applied = local
      this.s.lastSyncAt = this.host.now()
      this.s.lastWriteId = null
      this.held = null
      this.error = null
      this.newerVersion = false
      this.machines.clear()
      this.lastWrittenRecords = null
      this.persistNow()
      this.reconcile({ force: mode === 'replace' })
    } finally {
      this.busy = false
    }
    await this.writeOwnFile()
    this.startWatching()
    await this.pull()
    this.emitStatus()
  }

  /** Stops syncing. This computer keeps its setup; its file is removed from the folder. */
  async stop(): Promise<void> {
    if (this.busy) throw new Error('Sync is busy')
    this.busy = true
    try {
      await this.stopNow()
    } finally {
      this.busy = false
    }
    this.emitStatus()
  }

  private async stopNow(): Promise<void> {
    this.stopWatching()
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = null
    await this.writing
    const folder = this.s.folder
    if (folder) await unlink(join(folder, MACHINES_DIR, `${this.s.machineId}.json`)).catch(() => {})
    this.s.folder = null
    this.s.records = {}
    this.s.base = null
    this.s.applied = null
    this.s.lastWriteId = null
    this.s.lastSyncAt = null
    this.held = null
    this.error = null
    this.newerVersion = false
    this.machines.clear()
    this.lastWrittenRecords = null
    this.persistNow()
  }

  /** The user's answer to "another computer removed these silos". */
  resolveRemoval(apply: boolean): void {
    if (!this.held || !this.enabled) return
    if (apply) {
      this.reconcile({ force: true })
      return
    }
    // Keep them: re-create them from this computer's copy, with new stamps, everywhere
    const state = this.host.getState()
    const local = this.localView(state)
    const patch = M.diffViews(local, this.target(state))
    const r = M.removalsIn(patch, local)
    const changes: M.LocalChanges = {
      created: [...r.silos.map((id) => `silo:${id}`), ...r.tabs.map((id) => `tab:${id}`)],
      deleted: [],
      // Also this computer's order of everything, so the silos come back where they were here
      // (the other computer re-numbered the rest when it removed them)
      set: [
        ...Object.keys(local.silos).map((id) => ({ id: `silo:${id}`, field: 'order' })),
        ...Object.keys(local.tabs).map((id) => ({ id: `tab:${id}`, field: 'order' }))
      ]
    }
    const stamp = M.nextStamp(this.s.clock, this.s.machineId, this.host.now())
    M.applyLocalChanges(this.s.records, changes, local, stamp, this.host.platform)
    this.s.applied = M.applyChangesToView(this.s.applied ?? local, changes, local)
    this.held = null
    this.reconcile({ force: true })
    this.scheduleWrite()
  }

  // --- Restore points ------------------------------------------------------------------------

  private restoreDir(): string {
    return join(this.host.userDataDir, RESTORE_DIR)
  }

  /** Saves the current silos, tabs and settings so they can be restored from Settings. */
  saveRestorePoint(reason: string, force = false): void {
    const now = this.host.now()
    if (!force && now - this.lastRestorePointAt < RESTORE_MIN_GAP_MS) return
    try {
      const state = this.host.getState()
      const settings: Record<string, unknown> = {}
      for (const k of M.SETTINGS_KEYS) settings[k] = state[k]
      mkdirSync(this.restoreDir(), { recursive: true })
      let id = now
      while (existsSync(join(this.restoreDir(), `${id}.json`))) id++
      writeFileAtomicSync(
        join(this.restoreDir(), `${id}.json`),
        JSON.stringify({ createdAt: now, reason, groups: state.groups, settings })
      )
      this.lastRestorePointAt = now
      const files = readdirSync(this.restoreDir())
        .filter((f) => /^\d+\.json$/.test(f))
        .sort((a, b) => parseInt(b) - parseInt(a))
      for (const f of files.slice(RESTORE_KEEP)) unlinkSync(join(this.restoreDir(), f))
    } catch (err) {
      this.host.log('sync: saving a restore point failed', err)
    }
  }

  listRestorePoints(): RestorePointInfo[] {
    try {
      return readdirSync(this.restoreDir())
        .filter((f) => /^\d+\.json$/.test(f))
        .map((f) => {
          try {
            const p = JSON.parse(readFileSync(join(this.restoreDir(), f), 'utf8'))
            const groups = Array.isArray(p.groups) ? p.groups : []
            return {
              id: f,
              createdAt: typeof p.createdAt === 'number' ? p.createdAt : parseInt(f),
              reason: typeof p.reason === 'string' ? p.reason : '',
              silos: groups.length,
              tabs: groups.reduce(
                (n: number, g: { tabs?: unknown[] }) =>
                  n + (Array.isArray(g?.tabs) ? g.tabs.length : 0),
                0
              )
            }
          } catch {
            return null
          }
        })
        .filter((p): p is RestorePointInfo => !!p)
        .sort((a, b) => b.createdAt - a.createdAt)
    } catch {
      return []
    }
  }

  readRestorePoint(id: string): { groups: unknown[]; settings: Record<string, unknown> } | null {
    if (!/^\d+\.json$/.test(id)) return null
    try {
      const p = JSON.parse(readFileSync(join(this.restoreDir(), id), 'utf8'))
      if (!Array.isArray(p.groups)) return null
      return {
        groups: p.groups,
        settings: p.settings && typeof p.settings === 'object' ? p.settings : {}
      }
    } catch {
      return null
    }
  }

  // --- Logins of silos removed by sync -------------------------------------------------------

  async runDueWipes(): Promise<void> {
    const ids = Object.keys(this.s.pendingWipes)
    if (ids.length === 0) return
    const state = this.host.getState()
    const existing = new Set(
      (Array.isArray(state.groups) ? state.groups : []).map((g: { id?: unknown }) => g?.id)
    )
    const now = this.host.now()
    let changed = false
    for (const id of ids) {
      if (existing.has(id)) {
        delete this.s.pendingWipes[id] // it came back (restored or synced again)
        changed = true
      } else if (this.s.pendingWipes[id] <= now) {
        try {
          await this.host.clearSession(id)
          delete this.s.pendingWipes[id]
          changed = true
        } catch (err) {
          this.host.log('sync: clearing site data failed', err)
        }
      }
    }
    if (changed) this.schedulePersist()
  }

  // --- Persistence of the engine state -------------------------------------------------------

  private freshState(): PersistedSync {
    return {
      version: 1,
      machineId: randomUUID(),
      folder: null,
      records: {},
      clock: { t: 0, c: 0 },
      base: null,
      applied: null,
      pendingWipes: {},
      lastWriteId: null,
      lastWriteAt: 0,
      lastSyncAt: null
    }
  }

  private load(): void {
    const path = join(this.host.userDataDir, STATE_FILE)
    // Nothing is written until sync is turned on (start() saves the machine id)
    if (!existsSync(path)) return
    try {
      const p = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
      const fresh = this.freshState()
      const clock = p.clock as M.ClockState | undefined
      const wipes: Record<string, number> = {}
      if (p.pendingWipes && typeof p.pendingWipes === 'object') {
        for (const [id, due] of Object.entries(p.pendingWipes as Record<string, unknown>)) {
          if (M.ID_RE.test(id) && typeof due === 'number') wipes[id] = due
        }
      }
      const folder = typeof p.folder === 'string' && p.folder ? p.folder : null
      const base = isView(p.base) ? p.base : null
      const applied = isView(p.applied) ? p.applied : null
      this.s = {
        version: 1,
        machineId:
          typeof p.machineId === 'string' && M.ID_RE.test(p.machineId)
            ? p.machineId
            : fresh.machineId,
        // Without its views the engine can't tell local edits from sync's: join again instead
        folder: folder && base && applied ? folder : null,
        records: M.sanitizeRecords(p.records),
        clock:
          clock && Number.isFinite(clock.t) && Number.isFinite(clock.c)
            ? { t: clock.t, c: clock.c }
            : fresh.clock,
        base,
        applied,
        pendingWipes: wipes,
        lastWriteId: typeof p.lastWriteId === 'string' ? p.lastWriteId : null,
        lastWriteAt: typeof p.lastWriteAt === 'number' ? p.lastWriteAt : 0,
        lastSyncAt: typeof p.lastSyncAt === 'number' ? p.lastSyncAt : null
      }
    } catch (err) {
      // Unreadable: start over with sync off. The local setup itself is untouched.
      this.host.log('sync: state file unreadable, sync turned off', err)
      this.s = this.freshState()
      this.persistNow()
    }
  }

  private schedulePersist(): void {
    if (this.persistTimer) return
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null
      this.persistNow()
    }, 500)
  }

  private persistNow(): void {
    try {
      mkdirSync(this.host.userDataDir, { recursive: true })
      writeFileAtomicSync(join(this.host.userDataDir, STATE_FILE), JSON.stringify(this.s))
    } catch (err) {
      this.host.log('sync: saving sync state failed', err)
    }
  }
}
