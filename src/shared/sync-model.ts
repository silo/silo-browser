/**
 * Folder sync: the data model. Pure functions, no Node or DOM APIs, so the main process (sync
 * engine) and the renderer (applying patches to its stores) share one implementation.
 *
 * Every computer writes ONLY its own file (`<sync folder>/machines/<machine id>.json`) and reads
 * everyone else's, so a cloud drive never sees two writers on one file. Each file holds that
 * computer's full merged copy of the setup as "records": one per silo, tab and the settings, with a
 * value + timestamp ("stamp") per field. Merging keeps the newest stamp per field (last writer
 * wins per field), which is commutative, associative and idempotent: any order of merging any
 * set of files gives the same result on every computer.
 *
 * Deletions are a field too (`_deleted`), so a delete beats older edits and a restore (which
 * re-stamps every field) beats the delete.
 *
 * See docs/sync.md for the full design.
 */

export const SYNC_FORMAT = 'silo-sync'
export const SYNC_FORMAT_VERSION = 1

// ---------------------------------------------------------------------------------------------
// Stamps: a hybrid logical clock. "<ms since epoch, 15 digits>:<counter, 6 digits>:<machine id>"
// Fixed widths make plain string comparison order stamps by (time, counter, machine).
// A computer always stamps later than anything it has seen, so a slow clock can't lose a newer
// edit to an older one it already merged.
// ---------------------------------------------------------------------------------------------

export type Stamp = string
export interface ClockState {
  t: number
  c: number
}

const STAMP_RE = /^(\d{15}):(\d{6}):([A-Za-z0-9_-]{1,64})$/
const MAX_T = 999_999_999_999_999
const MAX_C = 999_999
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/

export function formatStamp(t: number, c: number, machineId: string): Stamp {
  return `${String(t).padStart(15, '0')}:${String(c).padStart(6, '0')}:${machineId}`
}

export function parseStamp(s: unknown): { t: number; c: number; m: string } | null {
  if (typeof s !== 'string') return null
  const match = STAMP_RE.exec(s)
  if (!match) return null
  return { t: Number(match[1]), c: Number(match[2]), m: match[3] }
}

export function nextStamp(clock: ClockState, machineId: string, now: number): Stamp {
  let t = Math.max(clock.t, Math.floor(now))
  let c = 0
  if (t === clock.t) {
    c = clock.c + 1
    if (c > MAX_C) {
      t += 1
      c = 0
    }
  }
  t = Math.min(t, MAX_T)
  clock.t = t
  clock.c = c
  return formatStamp(t, c, machineId)
}

/** Moves the clock past a stamp seen from another computer. */
export function observeStamp(clock: ClockState, stamp: Stamp): void {
  const p = parseStamp(stamp)
  if (!p) return
  if (p.t > clock.t || (p.t === clock.t && p.c > clock.c)) {
    clock.t = p.t
    clock.c = p.c
  }
}

/** The lowest possible stamp from a machine: used when joining, so an existing setup wins. */
export function zeroStamp(machineId: string): Stamp {
  return formatStamp(0, 0, machineId)
}

// ---------------------------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------------------------

export interface Field {
  v: unknown
  s: Stamp
}
export type SyncRecord = Record<string, Field>
export type Records = Record<string, SyncRecord>

export const DELETED = '_deleted'
export const SETTINGS_ID = 'settings'

// Unknown record kinds and fields (from newer versions) are kept and passed on, never dropped
const RECORD_ID_RE = /^(settings|[a-z]{1,16}:[A-Za-z0-9_-]{1,64})$/
const FIELD_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/
const MAX_RECORDS = 20_000
const MAX_FIELDS = 64
const MAX_VALUE_JSON = 600_000

/** Deterministic JSON (sorted keys) — for comparing values and breaking exact-stamp ties. */
export function stableJson(v: unknown): string {
  if (v === undefined) return 'null'
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableJson).join(',')}]`
  const obj = v as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`)
    .join(',')}}`
}

export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a == null && b == null) return true
  return stableJson(a) === stableJson(b)
}

function clone<T>(v: T): T {
  return v === undefined || v === null || typeof v !== 'object' ? v : JSON.parse(JSON.stringify(v))
}

/**
 * Validates records read from a file on disk (which anything could have written). Malformed
 * records and fields are dropped, never the whole file.
 */
export function sanitizeRecords(raw: unknown): Records {
  const out: Records = {}
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out
  let count = 0
  for (const [id, rec] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_RECORDS) break
    if (!RECORD_ID_RE.test(id) || !rec || typeof rec !== 'object' || Array.isArray(rec)) continue
    const clean: SyncRecord = {}
    let fields = 0
    for (const [name, field] of Object.entries(rec as Record<string, unknown>)) {
      if (fields >= MAX_FIELDS) break
      if (!FIELD_RE.test(name) || !field || typeof field !== 'object') continue
      const f = field as { v?: unknown; s?: unknown }
      if (!parseStamp(f.s) || f.v === undefined) continue
      if (name === DELETED && typeof f.v !== 'boolean') continue
      let json: string
      try {
        json = JSON.stringify(f.v)
      } catch {
        continue
      }
      if (json === undefined || json.length > MAX_VALUE_JSON) continue
      clean[name] = { v: JSON.parse(json), s: f.s as Stamp }
      fields++
    }
    if (Object.keys(clean).length > 0) {
      out[id] = clean
      count++
    }
  }
  return out
}

/** A deleted record keeps only its `_deleted` field: restoring it re-stamps every field anyway. */
function stripIfDeleted(rec: SyncRecord): boolean {
  if (rec[DELETED]?.v !== true) return false
  let stripped = false
  for (const k of Object.keys(rec)) {
    if (k !== DELETED) {
      delete rec[k]
      stripped = true
    }
  }
  return stripped
}

/** Merges `source` into `target` (newest stamp per field wins). Returns true if target changed. */
export function mergeRecords(target: Records, source: Records): boolean {
  let changed = false
  for (const [id, srcRec] of Object.entries(source)) {
    let rec = target[id]
    if (!rec) {
      rec = {}
      target[id] = rec
    }
    for (const [name, b] of Object.entries(srcRec)) {
      const a = rec[name]
      if (
        !a ||
        b.s > a.s ||
        (b.s === a.s && !valuesEqual(a.v, b.v) && stableJson(b.v) > stableJson(a.v))
      ) {
        rec[name] = { v: clone(b.v), s: b.s }
        changed = true
      }
    }
    if (stripIfDeleted(rec)) changed = true
    if (Object.keys(rec).length === 0) delete target[id]
  }
  return changed
}

export function maxStamp(records: Records): Stamp | null {
  let max: Stamp | null = null
  for (const rec of Object.values(records)) {
    for (const f of Object.values(rec)) if (!max || f.s > max) max = f.s
  }
  return max
}

// ---------------------------------------------------------------------------------------------
// Views: the synced part of a setup, in this computer's own form (e.g. its shortcut modifiers).
// Both the local state and the merged records are turned into a view, so they can be compared.
// ---------------------------------------------------------------------------------------------

export interface SiloIconView {
  kind: 'letter' | 'emoji' | 'icon' | 'image'
  value: string
}
export interface SiloView {
  name: string
  color: string
  icon: SiloIconView | null
  userAgent: string | null
  order: number
}
export interface TabView {
  groupId: string
  name: string
  url: string
  iconEmoji: string | null
  order: number
  notificationsEnabled: boolean
  isMuted: boolean
  sleepAfterMinutes: number
  userAgent: string | null
  shortcut: string | null
}
export interface SyncView {
  settings: Record<string, unknown>
  silos: Record<string, SiloView>
  tabs: Record<string, TabView>
}

/**
 * What syncs. Everything else stays on each computer: logins/cookies, window and sidebar state
 * (layout, collapsed silos), zoom, favicons, the open tab, pop-up tabs and site permissions.
 */
export const SETTINGS_KEYS = [
  'themeMode',
  'accentColor',
  'lightShade',
  'darkShade',
  'siloTint',
  'openLinksInNewTab',
  'defaultSleepAfterMinutes',
  'confirmCloseChildTabs',
  'defaultUserAgent'
] as const
export const SILO_KEYS = ['name', 'color', 'icon', 'userAgent', 'order'] as const
export const TAB_KEYS = [
  'groupId',
  'name',
  'url',
  'iconEmoji',
  'order',
  'notificationsEnabled',
  'isMuted',
  'sleepAfterMinutes',
  'userAgent',
  'shortcut'
] as const

const SETTING_TYPES: Record<string, 'string' | 'boolean' | 'number'> = {
  themeMode: 'string',
  accentColor: 'string',
  lightShade: 'string',
  darkShade: 'string',
  siloTint: 'string',
  openLinksInNewTab: 'boolean',
  defaultSleepAfterMinutes: 'number',
  confirmCloseChildTabs: 'boolean',
  defaultUserAgent: 'string'
}

function str(v: unknown, max: number, fallback: string): string {
  return typeof v === 'string' && v.length <= max ? v : fallback
}
function optStr(v: unknown, max: number): string | null {
  return typeof v === 'string' && v !== '' && v.length <= max ? v : null
}
function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function num(v: unknown, fallback: number, min = -1e9, max = 1e9): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback
}
function color(v: unknown): string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : '#6B7280'
}
const ICON_KINDS = ['letter', 'emoji', 'icon', 'image']
function icon(v: unknown): SiloIconView | null {
  if (!v || typeof v !== 'object') return null
  const { kind, value } = v as { kind?: unknown; value?: unknown }
  if (typeof kind !== 'string' || !ICON_KINDS.includes(kind)) return null
  if (typeof value !== 'string' || value === '') return null
  // Uploaded logos are data URLs; never a remote URL (it would load from the network)
  if (
    kind === 'image'
      ? !value.startsWith('data:image/') || value.length > 500_000
      : value.length > 64
  )
    return null
  return { kind: kind as SiloIconView['kind'], value }
}

function siloFields(src: Record<string, unknown>): SiloView {
  return {
    name: str(src.name, 200, 'Silo') || 'Silo',
    color: color(src.color),
    icon: icon(src.icon),
    userAgent: optStr(src.userAgent, 2000),
    order: num(src.order, 0)
  }
}

function tabFields(src: Record<string, unknown>, groupId: string): TabView {
  return {
    groupId,
    name: str(src.name, 500, ''),
    url: str(src.url, 8192, ''),
    iconEmoji: optStr(src.iconEmoji, 32),
    order: num(src.order, 0),
    notificationsEnabled: bool(src.notificationsEnabled, true),
    isMuted: bool(src.isMuted, false),
    sleepAfterMinutes: num(src.sleepAfterMinutes, 0, 0, 1_000_000),
    userAgent: optStr(src.userAgent, 2000),
    shortcut: optStr(src.shortcut, 100)
  }
}

/** Gives silos (or one silo's tabs) dense positions 0..n-1, ties broken the same everywhere. */
function rank<T extends { order: number }>(entries: [string, T][]): void {
  entries
    .sort((a, b) => a[1].order - b[1].order || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .forEach(([, v], i) => (v.order = i))
}

// Shortcuts are stored with "CmdOrCtrl" for the main modifier, so ⌘⌥G on a Mac is Ctrl+Alt+G on
// Windows and back. A Mac's real Control key stays "Control".
export function shortcutToNeutral(acc: string, platform: string): string {
  const main = platform === 'darwin' ? 'Command' : 'Control'
  return acc
    .split('+')
    .map((p) => (p === main ? 'CmdOrCtrl' : p))
    .join('+')
}
export function shortcutFromNeutral(acc: string, platform: string): string {
  const main = platform === 'darwin' ? 'Command' : 'Control'
  return acc
    .split('+')
    .map((p) => (p === 'CmdOrCtrl' ? main : p))
    .join('+')
}

export interface LocalGroupLike {
  id?: unknown
  localOnly?: unknown
  tabs?: unknown
  [key: string]: unknown
}

/**
 * The synced part of the local setup. Silos set to "only on this computer" and their tabs are
 * left out. `order` is the position among synced silos / within the silo.
 */
export function viewFromLocal(groups: unknown, settings: Record<string, unknown>): SyncView {
  const view: SyncView = { settings: {}, silos: {}, tabs: {} }
  for (const key of SETTINGS_KEYS) {
    const v = settings[key]
    if (typeof v === SETTING_TYPES[key]) view.settings[key] = v
  }
  if (!Array.isArray(groups)) return view
  const silos: [string, SiloView, number][] = []
  const seenTabs = new Set<string>()
  groups.forEach((g: LocalGroupLike, gi) => {
    if (!g || typeof g !== 'object' || typeof g.id !== 'string' || !ID_RE.test(g.id)) return
    if (g.localOnly === true || view.silos[g.id]) return
    const silo = siloFields(g)
    view.silos[g.id] = silo
    silos.push([g.id, silo, gi])
    const tabs: [string, TabView, number][] = []
    if (Array.isArray(g.tabs)) {
      g.tabs.forEach((t: Record<string, unknown>, ti: number) => {
        if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !ID_RE.test(t.id)) return
        if (seenTabs.has(t.id)) return
        seenTabs.add(t.id)
        const tab = tabFields(t, g.id as string)
        view.tabs[t.id] = tab
        tabs.push([t.id, tab, ti])
      })
    }
    // Local order, ties kept in array order (how the sidebar shows them)
    tabs.sort((a, b) => a[1].order - b[1].order || a[2] - b[2]).forEach(([, t], i) => (t.order = i))
  })
  silos.sort((a, b) => a[1].order - b[1].order || a[2] - b[2]).forEach(([, s], i) => (s.order = i))
  return view
}

export interface MaterializeOptions {
  platform: string
  /** Silo ids that are "only on this computer" here: never taken from sync. */
  excludeSilos?: Set<string>
  /** Tab ids that live in such silos here. */
  excludeTabs?: Set<string>
  /** Extra validation for setting values (e.g. known theme names). */
  validSetting?: (key: string, value: unknown) => boolean
}

/** The setup described by merged records, in this computer's form. */
export function materialize(records: Records, opts: MaterializeOptions): SyncView {
  const view: SyncView = { settings: {}, silos: {}, tabs: {} }
  const settings = records[SETTINGS_ID]
  if (settings) {
    for (const key of SETTINGS_KEYS) {
      const f = settings[key]
      if (!f || typeof f.v !== SETTING_TYPES[key]) continue
      if (key === 'defaultUserAgent' && (f.v as string).length > 2000) continue
      if (key === 'defaultSleepAfterMinutes' && num(f.v, -1, 0, 1_000_000) === -1) continue
      if (opts.validSetting && !opts.validSetting(key, f.v)) continue
      view.settings[key] = f.v
    }
  }
  const silos: [string, SiloView][] = []
  for (const [rid, rec] of Object.entries(records)) {
    if (!rid.startsWith('silo:') || rec[DELETED]?.v !== false) continue
    const id = rid.slice(5)
    if (opts.excludeSilos?.has(id)) continue
    const src: Record<string, unknown> = {}
    for (const k of SILO_KEYS) src[k] = rec[k]?.v
    const silo = siloFields(src)
    view.silos[id] = silo
    silos.push([id, silo])
  }
  rank(silos)
  const tabsBySilo = new Map<string, [string, TabView][]>()
  for (const [rid, rec] of Object.entries(records)) {
    if (!rid.startsWith('tab:') || rec[DELETED]?.v !== false) continue
    const id = rid.slice(4)
    if (opts.excludeTabs?.has(id)) continue
    const groupId = rec.groupId?.v
    if (typeof groupId !== 'string' || !view.silos[groupId]) continue
    const src: Record<string, unknown> = {}
    for (const k of TAB_KEYS) src[k] = rec[k]?.v
    const tab = tabFields(src, groupId)
    if (tab.shortcut) tab.shortcut = shortcutFromNeutral(tab.shortcut, opts.platform)
    view.tabs[id] = tab
    const list = tabsBySilo.get(groupId) ?? []
    list.push([id, tab])
    tabsBySilo.set(groupId, list)
  }
  for (const list of tabsBySilo.values()) rank(list)
  return view
}

// ---------------------------------------------------------------------------------------------
// Local changes → records
// ---------------------------------------------------------------------------------------------

type Flat = Map<string, Record<string, unknown>>

function flatten(view: SyncView | null): Flat {
  const flat: Flat = new Map()
  if (!view) return flat
  flat.set(SETTINGS_ID, view.settings)
  for (const [id, s] of Object.entries(view.silos))
    flat.set(`silo:${id}`, s as unknown as Record<string, unknown>)
  for (const [id, t] of Object.entries(view.tabs))
    flat.set(`tab:${id}`, t as unknown as Record<string, unknown>)
  return flat
}

export interface LocalChanges {
  /** Records to create (or bring back): every field is stamped. */
  created: string[]
  deleted: string[]
  set: { id: string; field: string }[]
}

export function hasChanges(c: LocalChanges): boolean {
  return c.created.length > 0 || c.deleted.length > 0 || c.set.length > 0
}

/**
 * What the user changed on this computer since its last save.
 *
 * - `next`:    the local setup now
 * - `base`:    the local setup at the previous save
 * - `applied`: what sync last made the local setup look like (incl. our own changes)
 *
 * A field counts as changed only if it differs from BOTH. That way a save carrying values from
 * before a sync update arrived (the renderer saves on a timer) is never mistaken for an edit
 * that undoes the update, and a value that sync itself put there isn't re-stamped.
 */
export function diffLocal(
  next: SyncView,
  base: SyncView | null,
  applied: SyncView | null
): LocalChanges {
  const changes: LocalChanges = { created: [], deleted: [], set: [] }
  const n = flatten(next)
  const b = flatten(base)
  const a = flatten(applied)
  for (const [id, rec] of n) {
    const inBase = b.has(id)
    const inApplied = a.has(id)
    if (id !== SETTINGS_ID && !inApplied) {
      // New on this computer (or turned back on for sync) → create it everywhere.
      // In base but not applied = sync removed it and this save predates that: not an edit.
      if (!inBase) changes.created.push(id)
      continue
    }
    const baseRec = b.get(id)
    const appliedRec = a.get(id)
    for (const [field, value] of Object.entries(rec)) {
      if (!valuesEqual(value, baseRec?.[field]) && !valuesEqual(value, appliedRec?.[field])) {
        changes.set.push({ id, field })
      }
    }
  }
  for (const id of b.keys()) {
    if (id !== SETTINGS_ID && !n.has(id) && a.has(id)) changes.deleted.push(id)
  }
  return changes
}

function recordValue(id: string, field: string, value: unknown, platform: string): unknown {
  if (field === 'shortcut' && id.startsWith('tab:') && typeof value === 'string') {
    return shortcutToNeutral(value, platform)
  }
  return clone(value)
}

/** Writes local changes into the records with one stamp (they're one event). */
export function applyLocalChanges(
  records: Records,
  changes: LocalChanges,
  next: SyncView,
  stamp: Stamp,
  platform: string
): void {
  const n = flatten(next)
  for (const id of changes.created) {
    const src = n.get(id)
    if (!src) continue
    const rec: SyncRecord = { [DELETED]: { v: false, s: stamp } }
    for (const [field, value] of Object.entries(src)) {
      rec[field] = { v: recordValue(id, field, value, platform), s: stamp }
    }
    records[id] = rec
  }
  for (const { id, field } of changes.set) {
    const src = n.get(id)
    if (!src) continue
    const rec = records[id] ?? (records[id] = {})
    rec[field] = { v: recordValue(id, field, src[field], platform), s: stamp }
    if (id !== SETTINGS_ID && !rec[DELETED]) rec[DELETED] = { v: false, s: stamp }
  }
  for (const id of changes.deleted) {
    records[id] = { [DELETED]: { v: true, s: stamp } }
  }
}

/** Stamps a whole view into records (joining a folder). */
export function recordsFromView(view: SyncView, stamp: Stamp, platform: string): Records {
  const records: Records = {}
  const all = flatten(view)
  applyLocalChanges(
    records,
    {
      created: [...all.keys()].filter((id) => id !== SETTINGS_ID),
      deleted: [],
      set: Object.keys(view.settings).map((field) => ({ id: SETTINGS_ID, field }))
    },
    view,
    stamp,
    platform
  )
  return records
}

/** Updates `applied` with local changes (so later saves are compared against them). */
export function applyChangesToView(
  applied: SyncView,
  changes: LocalChanges,
  next: SyncView
): SyncView {
  const out: SyncView = clone(applied)
  const put = (id: string, value: Record<string, unknown> | null): void => {
    if (id === SETTINGS_ID) return
    const [kind, key] = [id.slice(0, id.indexOf(':')), id.slice(id.indexOf(':') + 1)]
    const bucket = (kind === 'silo' ? out.silos : kind === 'tab' ? out.tabs : null) as Record<
      string,
      unknown
    > | null
    if (!bucket) return
    if (value) bucket[key] = clone(value)
    else delete bucket[key]
  }
  const n = flatten(next)
  for (const id of changes.created) put(id, n.get(id) ?? null)
  for (const id of changes.deleted) put(id, null)
  for (const { id, field } of changes.set) {
    const src = n.get(id)
    if (!src) continue
    if (id === SETTINGS_ID) {
      out.settings[field] = clone(src[field])
      continue
    }
    const target = flatten(out).get(id)
    if (target) target[field] = clone(src[field])
    else put(id, src)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Patches: turning one view into another, applied to the local state (main + renderer)
// ---------------------------------------------------------------------------------------------

export interface SyncPatch {
  settings: Record<string, unknown>
  /** null = remove. A new silo/tab carries every field. `order` is set via the order lists. */
  silos: Record<string, Partial<SiloView> | null>
  tabs: Record<string, Partial<TabView> | null>
  /** All synced silo ids in order, when it changed */
  siloOrder: string[] | null
  /** Tab ids per silo in order, for silos whose tabs changed position or membership */
  tabOrder: Record<string, string[]>
}

function orderedIds<T extends { order: number }>(
  map: Record<string, T>,
  filter?: (v: T) => boolean
): string[] {
  return Object.entries(map)
    .filter(([, v]) => !filter || filter(v))
    .sort((x, y) => x[1].order - y[1].order)
    .map(([id]) => id)
}

export function diffViews(from: SyncView, to: SyncView): SyncPatch {
  const patch: SyncPatch = { settings: {}, silos: {}, tabs: {}, siloOrder: null, tabOrder: {} }
  for (const [k, v] of Object.entries(to.settings)) {
    if (!valuesEqual(from.settings[k], v)) patch.settings[k] = clone(v)
  }
  for (const id of Object.keys(from.silos)) if (!to.silos[id]) patch.silos[id] = null
  for (const [id, s] of Object.entries(to.silos)) {
    const old = from.silos[id]
    if (!old) {
      patch.silos[id] = clone(s)
      continue
    }
    const changed: Partial<SiloView> = {}
    for (const k of SILO_KEYS) {
      if (k !== 'order' && !valuesEqual(old[k], s[k]))
        (changed as Record<string, unknown>)[k] = clone(s[k])
    }
    if (Object.keys(changed).length) patch.silos[id] = changed
  }
  const fromOrder = orderedIds(from.silos)
  const toOrder = orderedIds(to.silos)
  if (fromOrder.join('\n') !== toOrder.join('\n')) patch.siloOrder = toOrder

  for (const id of Object.keys(from.tabs)) if (!to.tabs[id]) patch.tabs[id] = null
  for (const [id, t] of Object.entries(to.tabs)) {
    const old = from.tabs[id]
    if (!old) {
      patch.tabs[id] = clone(t)
      continue
    }
    const changed: Partial<TabView> = {}
    for (const k of TAB_KEYS) {
      if (k !== 'order' && !valuesEqual(old[k], t[k]))
        (changed as Record<string, unknown>)[k] = clone(t[k])
    }
    if (Object.keys(changed).length) patch.tabs[id] = changed
  }
  for (const groupId of Object.keys(to.silos)) {
    const before = orderedIds(from.tabs, (t) => t.groupId === groupId)
    const after = orderedIds(to.tabs, (t) => t.groupId === groupId)
    if (before.join('\n') !== after.join('\n')) patch.tabOrder[groupId] = after
  }
  return patch
}

export function isEmptyPatch(p: SyncPatch): boolean {
  return (
    Object.keys(p.settings).length === 0 &&
    Object.keys(p.silos).length === 0 &&
    Object.keys(p.tabs).length === 0 &&
    !p.siloOrder &&
    Object.keys(p.tabOrder).length === 0
  )
}

/** What a patch would delete — for the "another computer removed several silos" check. */
export function removalsIn(patch: SyncPatch, from: SyncView): { silos: string[]; tabs: string[] } {
  const silos = Object.keys(patch.silos).filter((id) => patch.silos[id] === null && from.silos[id])
  const tabs = Object.keys(patch.tabs).filter((id) => patch.tabs[id] === null && from.tabs[id])
  return { silos, tabs }
}

export interface PatchableTab {
  id: string
  groupId: string
  order: number
}
export interface PatchableGroup<T extends PatchableTab> {
  id: string
  order: number
  localOnly?: boolean
  tabs: T[]
}
export interface PatchHooks<G, T> {
  newGroup(id: string, fields: SiloView): G
  newTab(id: string, fields: TabView): T
  removingTab?(tab: T, group: G): void
  removingGroup?(group: G): void
  movedTab?(tab: T, from: G, to: G): void
}

/** Copies patch fields onto a silo/tab object. null removes the property (stored as absent). */
function assignFields(target: object, fields: Record<string, unknown>, skip: string[]): void {
  const obj = target as Record<string, unknown>
  for (const [k, v] of Object.entries(fields)) {
    if (skip.includes(k)) continue
    if (v === null || v === undefined) delete obj[k]
    else obj[k] = clone(v)
  }
}

/**
 * Applies a patch to a list of silos (the persisted state in main, or the Pinia store in the
 * renderer). Silos set to "only on this computer", and their tabs, are never touched.
 * Returns the ids of silos it removed.
 */
export function applyPatchToGroups<T extends PatchableTab, G extends PatchableGroup<T>>(
  groups: G[],
  patch: SyncPatch,
  hooks: PatchHooks<G, T>
): string[] {
  const findGroup = (id: string): G | undefined => groups.find((g) => g.id === id)
  const findTab = (id: string): { tab: T; group: G } | undefined => {
    for (const group of groups) {
      const tab = group.tabs.find((t) => t.id === id)
      if (tab) return { tab, group }
    }
    return undefined
  }
  const removedGroups: string[] = []
  const touchedGroups = new Set<string>()

  // 1. Removed tabs, then removed silos
  for (const [id, fields] of Object.entries(patch.tabs)) {
    if (fields !== null) continue
    const found = findTab(id)
    if (!found || found.group.localOnly) continue
    hooks.removingTab?.(found.tab, found.group)
    const idx = found.group.tabs.findIndex((t) => t.id === id)
    if (idx !== -1) found.group.tabs.splice(idx, 1)
    touchedGroups.add(found.group.id)
  }
  for (const [id, fields] of Object.entries(patch.silos)) {
    if (fields !== null) continue
    const group = findGroup(id)
    if (!group || group.localOnly) continue
    hooks.removingGroup?.(group)
    const idx = groups.findIndex((g) => g.id === id)
    if (idx !== -1) groups.splice(idx, 1)
    removedGroups.push(id)
  }

  // Positions before anything is added, for keeping local-only silos in place (step 4)
  const priorOrder = [...groups].sort((a, b) => a.order - b.order)

  // 2. New and changed silos
  for (const [id, fields] of Object.entries(patch.silos)) {
    if (fields === null) continue
    const group = findGroup(id)
    if (group) {
      if (!group.localOnly) assignFields(group, fields, ['order', 'id', 'tabs', 'localOnly'])
    } else if (typeof fields.name === 'string' && typeof fields.color === 'string') {
      groups.push(hooks.newGroup(id, fields as SiloView))
    }
  }

  // 3. New, changed and moved tabs
  for (const [id, fields] of Object.entries(patch.tabs)) {
    if (fields === null) continue
    const found = findTab(id)
    if (found) {
      if (found.group.localOnly) continue
      let group = found.group
      if (typeof fields.groupId === 'string' && fields.groupId !== group.id) {
        const target = findGroup(fields.groupId)
        if (target && !target.localOnly) {
          const idx = group.tabs.findIndex((t) => t.id === id)
          const [moved] = group.tabs.splice(idx, 1)
          touchedGroups.add(group.id)
          moved.groupId = target.id
          target.tabs.push(moved)
          hooks.movedTab?.(target.tabs[target.tabs.length - 1], group, target)
          group = target
        }
      }
      const tab = group.tabs.find((t) => t.id === id)
      if (tab) assignFields(tab, fields, ['order', 'id', 'groupId'])
      touchedGroups.add(group.id)
    } else if (typeof fields.groupId === 'string' && typeof fields.url === 'string') {
      const target = findGroup(fields.groupId)
      if (!target || target.localOnly) continue
      target.tabs.push(hooks.newTab(id, fields as TabView))
      touchedGroups.add(target.id)
    }
  }

  // 4. Silo order: synced silos follow the synced order; a silo that's only on this computer
  // stays right after the synced silo it followed before (or first, if none did).
  if (patch.siloOrder) {
    const synced = groups.filter((g) => !g.localOnly)
    const wanted = patch.siloOrder
      .map((id) => synced.find((g) => g.id === id))
      .filter((g): g is G => !!g)
    const syncedOrder = [...wanted, ...synced.filter((g) => !wanted.includes(g))]
    const after = new Map<string | null, G[]>()
    let anchor: string | null = null
    for (const g of priorOrder) {
      if (!groups.includes(g)) continue
      if (!g.localOnly) {
        anchor = g.id
        continue
      }
      after.set(anchor, [...(after.get(anchor) ?? []), g])
    }
    const result = [...(after.get(null) ?? [])]
    for (const g of syncedOrder) result.push(g, ...(after.get(g.id) ?? []))
    result.forEach((g, i) => (g.order = i))
  }

  // 5. Tab order within each silo whose tabs changed
  for (const group of groups) {
    const list = patch.tabOrder[group.id]
    if (!list && !touchedGroups.has(group.id)) continue
    if (group.localOnly) continue
    const sorted = [...group.tabs].sort((a, b) => a.order - b.order)
    const wanted = (list ?? [])
      .map((id) => sorted.find((t) => t.id === id))
      .filter((t): t is T => !!t)
    const rest = sorted.filter((t) => !wanted.includes(t))
    const inOrder = [...wanted, ...rest]
    inOrder.forEach((t, i) => (t.order = i))
    // Keep the array in display order too (moveTab() works with array positions)
    group.tabs.sort((a, b) => a.order - b.order)
  }
  return removedGroups
}

/** Settings + silos → a new silo / tab object as stored in silo-config.json. */
export function storedSilo(id: string, fields: SiloView): Record<string, unknown> {
  const g: Record<string, unknown> = {
    id,
    name: fields.name,
    color: fields.color,
    order: fields.order,
    isCollapsed: false,
    tabs: []
  }
  if (fields.icon) g.icon = clone(fields.icon)
  if (fields.userAgent) g.userAgent = fields.userAgent
  return g
}

export function storedTab(id: string, fields: TabView): Record<string, unknown> {
  const t: Record<string, unknown> = {
    id,
    groupId: fields.groupId,
    name: fields.name,
    url: fields.url,
    order: fields.order,
    notificationsEnabled: fields.notificationsEnabled,
    isMuted: fields.isMuted,
    sleepAfterMinutes: fields.sleepAfterMinutes,
    zoomLevel: 0
  }
  if (fields.iconEmoji) t.iconEmoji = fields.iconEmoji
  if (fields.userAgent) t.userAgent = fields.userAgent
  if (fields.shortcut) t.shortcut = fields.shortcut
  return t
}
