/**
 * Folder sync tests: several simulated computers, each with its own engine, "main process"
 * state and "renderer" copy, syncing through one temporary folder. Covers joining, concurrent
 * edits, delayed renderer saves, removals (the question + Keep), "only on this computer" silos,
 * shortcut translation, restarts, bad files, copied profiles, and a random fuzz that checks every
 * computer ends up with the same setup and nothing nobody deleted is lost.
 *
 *   pnpm test:sync                      (SEED=7 STEPS=2000 pnpm test:sync for a longer fuzz)
 */
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readdirSync,
  cpSync,
  readFileSync,
  existsSync
} from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SyncEngine, type SyncStatus } from '../src/main/sync/engine'
import * as M from '../src/shared/sync-model'

const ROOT = mkdtempSync(join(tmpdir(), 'silo-sync-test-'))
let failures = 0
let passes = 0
function check(cond: unknown, msg: string): void {
  if (cond) passes++
  else {
    failures++
    console.log('  FAIL:', msg)
  }
}
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
let clockNow = 1_800_000_000_000
const tick = (ms = 1000): number => (clockNow += ms)

type Tab = {
  id: string
  groupId: string
  name: string
  url: string
  order: number
  [k: string]: unknown
}
type Group = {
  id: string
  name: string
  color: string
  order: number
  tabs: Tab[]
  localOnly?: boolean
  [k: string]: unknown
}

const DEFAULT_SETTINGS = {
  themeMode: 'system',
  accentColor: 'black',
  lightShade: 'stone',
  darkShade: 'pitch',
  siloTint: 'subtle',
  openLinksInNewTab: true,
  defaultSleepAfterMinutes: 60,
  confirmCloseChildTabs: false,
  defaultUserAgent: ''
}

class Machine {
  name: string
  dir: string
  platform: string
  state: Record<string, unknown>
  renderer: { groups: Group[]; settings: Record<string, unknown> }
  patches: M.SyncPatch[] = []
  wiped: string[] = []
  status: SyncStatus | null = null
  engine!: SyncEngine
  constructor(name: string, platform = 'darwin', dir?: string) {
    this.name = name
    this.platform = platform
    this.dir = dir ?? join(ROOT, `userdata-${name}`)
    this.state = { groups: [], ...DEFAULT_SETTINGS, activeTabId: null, sidebarExpanded: true }
    this.renderer = { groups: [], settings: { ...DEFAULT_SETTINGS } }
    this.boot()
  }
  boot(): void {
    this.engine = new SyncEngine({
      userDataDir: this.dir,
      homeDir: ROOT,
      platform: this.platform,
      appVersion: '2.2.0',
      machineName: this.name,
      now: () => clockNow,
      getState: () => this.state,
      writeState: (partial) => Object.assign(this.state, clone(partial)),
      validSetting: (k, v) =>
        k === 'themeMode' ? ['dark', 'light', 'system'].includes(v as string) : true,
      sendPatch: (p) => this.patches.push(clone(p)),
      clearSession: async (id) => void this.wiped.push(id),
      onStatus: (s) => (this.status = s),
      log: () => {}
    })
    this.engine.startup()
    // The renderer loads the (possibly reconciled) state
    this.renderer.groups = clone(this.state.groups as Group[])
    for (const k of Object.keys(DEFAULT_SETTINGS)) this.renderer.settings[k] = this.state[k]
  }
  async ready(): Promise<void> {
    this.engine.rendererReady()
    ;(this.engine as unknown as { stopWatching(): void }).stopWatching()
    await this.engine.pull()
  }
  /** Renderer → main save (like the debounced store saves) */
  save(): void {
    const partial = { groups: clone(this.renderer.groups), ...clone(this.renderer.settings) }
    Object.assign(this.state, partial)
    this.engine.onLocalSave(clone(partial))
  }
  /** The renderer saves groups and settings through separate calls */
  saveGroupsOnly(): void {
    const partial = { groups: clone(this.renderer.groups) }
    Object.assign(this.state, partial)
    this.engine.onLocalSave(clone(partial))
  }
  saveSettingsOnly(): void {
    const partial = clone(this.renderer.settings)
    Object.assign(this.state, partial)
    this.engine.onLocalSave(clone(partial))
  }
  /** Renderer applies patches it received */
  deliver(): void {
    for (const p of this.patches.splice(0)) {
      M.applyPatchToGroups<Tab, Group>(this.renderer.groups, p, {
        newGroup: (id, f) => ({ ...(M.storedSilo(id, f) as Group), isLoaded: false }),
        newTab: (id, f) => ({ ...(M.storedTab(id, f) as Tab), isLoaded: false })
      })
      Object.assign(this.renderer.settings, clone(p.settings))
    }
    this.save()
  }
  async push(): Promise<void> {
    await this.engine.writeOwnFile()
  }
  async pull(): Promise<void> {
    await this.engine.pull()
  }
  view(): M.SyncView {
    const v = M.viewFromLocal(this.renderer.groups, this.renderer.settings)
    // Compare shortcuts in their stored (platform-neutral) form
    for (const t of Object.values(v.tabs))
      if (t.shortcut) t.shortcut = M.shortcutToNeutral(t.shortcut, this.platform)
    return v
  }
  mainView(): M.SyncView {
    const v = M.viewFromLocal(this.state.groups, this.state)
    for (const t of Object.values(v.tabs))
      if (t.shortcut) t.shortcut = M.shortcutToNeutral(t.shortcut, this.platform)
    return v
  }
  // --- user actions in the renderer ---
  addSilo(name: string, id = `s-${name}`): Group {
    const g: Group = {
      id,
      name,
      color: '#2F63D8',
      order: this.renderer.groups.length,
      isCollapsed: false,
      tabs: []
    }
    this.renderer.groups.push(g)
    return g
  }
  addTab(siloId: string, name: string, id = `t-${name}`): Tab {
    const g = this.silo(siloId)!
    const t: Tab = {
      id,
      groupId: siloId,
      name,
      url: `https://${name}.example`,
      order: g.tabs.length,
      notificationsEnabled: true,
      isMuted: false,
      sleepAfterMinutes: 60,
      zoomLevel: 0
    }
    g.tabs.push(t)
    return t
  }
  silo(id: string): Group | undefined {
    return this.renderer.groups.find((g) => g.id === id)
  }
  tab(id: string): Tab | undefined {
    for (const g of this.renderer.groups) {
      const t = g.tabs.find((x) => x.id === id)
      if (t) return t
    }
    return undefined
  }
  removeSilo(id: string): void {
    this.renderer.groups = this.renderer.groups.filter((g) => g.id !== id)
  }
  removeTab(id: string): void {
    for (const g of this.renderer.groups) g.tabs = g.tabs.filter((t) => t.id !== id)
  }
  moveTab(id: string, toSilo: string, index: number): void {
    let tab: Tab | undefined
    for (const g of this.renderer.groups) {
      const i = g.tabs.findIndex((t) => t.id === id)
      if (i !== -1) {
        ;[tab] = g.tabs.splice(i, 1)
        g.tabs.forEach((t, k) => (t.order = k))
      }
    }
    const target = this.silo(toSilo)!
    tab!.groupId = toSilo
    target.tabs.sort((a, b) => a.order - b.order).splice(index, 0, tab!)
    target.tabs.forEach((t, k) => (t.order = k))
  }
}

const folder = (name: string): string => {
  const p = join(ROOT, name)
  mkdirSync(p, { recursive: true })
  return p
}
async function settle(machines: Machine[], rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    for (const m of machines) {
      tick(10)
      await m.push()
      await m.pull()
      m.deliver()
    }
  }
}
/** Views without silos that are "only on this computer" on either machine (they differ by design) */
function comparable(
  v: M.SyncView,
  privateIds: Set<string>,
  privateTabs: Set<string> = new Set()
): M.SyncView {
  const out: M.SyncView = { settings: v.settings, silos: {}, tabs: {} }
  const silos = Object.entries(v.silos)
    .filter(([id]) => !privateIds.has(id))
    .sort((x, y) => x[1].order - y[1].order)
  silos.forEach(([id, s], i) => (out.silos[id] = { ...s, order: i }))
  const byGroup = new Map<string, [string, M.TabView][]>()
  for (const [id, t] of Object.entries(v.tabs)) {
    if (privateIds.has(t.groupId) || privateTabs.has(id)) continue
    byGroup.set(t.groupId, [...(byGroup.get(t.groupId) ?? []), [id, t]])
  }
  for (const list of byGroup.values())
    list
      .sort((x, y) => x[1].order - y[1].order)
      .forEach(([id, t], i) => (out.tabs[id] = { ...t, order: i }))
  return out
}
function sameView(a: Machine, b: Machine, label: string): void {
  const privateIds = new Set(
    [...a.renderer.groups, ...b.renderer.groups].filter((g) => g.localOnly).map((g) => g.id)
  )
  const privateTabs = new Set(
    [...a.renderer.groups, ...b.renderer.groups]
      .filter((g) => g.localOnly)
      .flatMap((g) => g.tabs.map((t) => t.id))
  )
  const va = comparable(a.view(), privateIds, privateTabs)
  const vb = comparable(b.view(), privateIds, privateTabs)
  const ok = M.valuesEqual(va, vb)
  check(ok, `${label}: ${a.name} and ${b.name} have the same setup`)
  if (!ok) {
    for (const kind of ['settings', 'silos', 'tabs'] as const) {
      const ka = va[kind] as Record<string, unknown>
      const kb = vb[kind] as Record<string, unknown>
      for (const k of new Set([...Object.keys(ka), ...Object.keys(kb)])) {
        if (!M.valuesEqual(ka[k], kb[k]))
          console.log(
            `    ${kind}.${k}:`,
            a.name,
            JSON.stringify(ka[k]),
            '|',
            b.name,
            JSON.stringify(kb[k])
          )
      }
    }
  }
}
function consistent(m: Machine, label: string): void {
  check(M.valuesEqual(m.view(), m.mainView()), `${label}: ${m.name} renderer == main state`)
}

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`• ${name}`)
  try {
    await fn()
  } catch (err) {
    failures++
    console.log('  FAIL (threw):', err)
  }
}

async function main(): Promise<void> {
  await test('silo order: private silos stay after the synced silo they followed', async () => {
    const g = (id: string, order: number, localOnly = false): Group => ({
      id,
      name: id,
      color: '#000000',
      order,
      tabs: [],
      ...(localOnly ? { localOnly } : {})
    })
    const groups = [g('L', 0, true), g('S1', 1), g('P', 2, true), g('S2', 3)]
    const patch: M.SyncPatch = {
      settings: {},
      silos: { NEW: { name: 'NEW', color: '#000000', icon: null, userAgent: null, order: 2 } },
      tabs: {},
      siloOrder: ['S2', 'S1', 'NEW'],
      tabOrder: {}
    }
    M.applyPatchToGroups<Tab, Group>(groups, patch, {
      newGroup: (id, f) => M.storedSilo(id, f) as Group,
      newTab: (id, f) => M.storedTab(id, f) as Tab
    })
    const order = [...groups]
      .sort((a, b) => a.order - b.order)
      .map((x) => x.id)
      .join(',')
    check(order === 'L,S2,S1,P,NEW', `order is L,S2,S1,P,NEW (got ${order})`)
  })

  await test('join an empty folder, second computer gets the setup', async () => {
    const f = folder('f1')
    const A = new Machine('A')
    A.addSilo('Work')
    A.addTab('s-Work', 'gmail')
    A.addTab('s-Work', 'slack')
    A.addSilo('Personal')
    A.addTab('s-Personal', 'mail')
    A.renderer.settings.themeMode = 'dark'
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    check(readdirSync(join(f, 'Silo Browser', 'machines')).length === 1, 'A wrote its machine file')
    check(existsSync(join(f, 'Silo Browser', 'README.txt')), 'README written')

    const B = new Machine('B', 'win32')
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    check(B.renderer.groups.length === 2, 'B has 2 silos')
    check(B.renderer.settings.themeMode === 'dark', 'B got the dark theme')
    sameView(A, B, 'after join')
    consistent(B, 'after join')

    // Concurrent edits to different fields of one tab both survive
    tick()
    A.tab('t-gmail')!.name = 'Gmail Work'
    A.save()
    tick()
    B.tab('t-gmail')!.url = 'https://mail.google.com/u/1'
    B.save()
    await settle([A, B])
    check(
      A.tab('t-gmail')!.name === 'Gmail Work' &&
        A.tab('t-gmail')!.url === 'https://mail.google.com/u/1',
      'A has both edits'
    )
    sameView(A, B, 'concurrent field edits')

    // Same field: the later edit wins everywhere
    tick()
    A.silo('s-Work')!.name = 'Work A'
    A.save()
    tick()
    B.silo('s-Work')!.name = 'Work B'
    B.save()
    await settle([A, B])
    check(A.silo('s-Work')!.name === 'Work B', 'later rename wins')
    sameView(A, B, 'same field edits')

    // Removing one tab
    tick()
    A.removeTab('t-slack')
    A.save()
    await settle([A, B])
    check(!B.tab('t-slack'), 'tab removed on B')
    sameView(A, B, 'tab removed')

    // Shortcut: ⌘⌥G on the Mac is Ctrl+Alt+G on Windows, and stays ⌘⌥G on the Mac
    tick()
    A.tab('t-gmail')!.shortcut = 'Command+Alt+G'
    A.save()
    await settle([A, B])
    check(
      B.tab('t-gmail')!.shortcut === 'Control+Alt+G',
      `B shortcut is Control+Alt+G (got ${B.tab('t-gmail')!.shortcut})`
    )
    check(A.tab('t-gmail')!.shortcut === 'Command+Alt+G', 'A shortcut unchanged')
    // A Mac ⌃ shortcut stays ⌃ and doesn't bounce
    tick()
    A.tab('t-mail')!.shortcut = 'Control+Shift+M'
    A.save()
    await settle([A, B])
    check(B.tab('t-mail')!.shortcut === 'Control+Shift+M', 'B has Control+Shift+M')
    check(A.tab('t-mail')!.shortcut === 'Control+Shift+M', 'A still has Control+Shift+M')
    // Windows edits → Mac gets ⌘
    tick()
    B.tab('t-mail')!.shortcut = 'Control+Alt+K'
    B.save()
    await settle([A, B])
    check(
      A.tab('t-mail')!.shortcut === 'Command+Alt+K',
      `A got Command+Alt+K (got ${A.tab('t-mail')!.shortcut})`
    )

    // Per-computer things don't sync
    tick()
    A.tab('t-gmail')!.zoomLevel = 2
    A.tab('t-gmail')!.iconUrl = 'https://x/fav.ico'
    A.silo('s-Work')!.isCollapsed = true
    A.save()
    await settle([A, B])
    check(
      B.tab('t-gmail')!.zoomLevel === 0 && !B.tab('t-gmail')!.iconUrl,
      'zoom and favicon stay per computer'
    )
    check(B.silo('s-Work')!.isCollapsed === false, 'collapsed state stays per computer')

    // Reordering
    tick()
    A.addTab('s-Work', 'docs')
    A.addTab('s-Work', 'cal')
    A.save()
    await settle([A, B])
    tick()
    A.moveTab('t-cal', 's-Work', 0)
    A.save()
    await settle([A, B])
    const orderB = [...B.silo('s-Work')!.tabs].sort((a, b) => a.order - b.order).map((t) => t.id)
    check(orderB[0] === 't-cal', `B order follows (got ${orderB.join(',')})`)
    sameView(A, B, 'reorder')
    // Move a tab to another silo
    tick()
    B.moveTab('t-docs', 's-Personal', 0)
    B.save()
    await settle([A, B])
    check(A.tab('t-docs')!.groupId === 's-Personal', 'move between silos synced')
    sameView(A, B, 'move between silos')
    consistent(A, 'after moves')
    A.engine.dispose()
    B.engine.dispose()
  })

  await test('stale save from the renderer never undoes a sync update', async () => {
    const f = folder('f2')
    const A = new Machine('A2')
    A.addSilo('Work')
    A.addTab('s-Work', 'gmail')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    const B = new Machine('B2')
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    tick()
    A.tab('t-gmail')!.name = 'Renamed on A'
    A.save()
    await A.push()
    // B's renderer has an unrelated change pending: it saves BEFORE the patch is delivered
    await B.pull()
    check(B.patches.length > 0, 'B got a patch')
    B.renderer.settings.accentColor = 'blue'
    B.save() // stale: still has the old tab name
    B.deliver()
    await settle([A, B])
    check(A.tab('t-gmail')!.name === 'Renamed on A', 'rename survived the stale save')
    check(A.renderer.settings.accentColor === 'blue', 'B change arrived on A')
    sameView(A, B, 'stale save')
    // Undo of a local change is detected (value back to what it was)
    tick()
    A.tab('t-gmail')!.name = 'X'
    A.save()
    tick()
    A.tab('t-gmail')!.name = 'Renamed on A'
    A.save()
    await settle([A, B])
    check(B.tab('t-gmail')!.name === 'Renamed on A', 'undo of an edit propagates')
    A.engine.dispose()
    B.engine.dispose()
  })

  await test('several silos removed elsewhere: asks first; Keep brings them back everywhere', async () => {
    const f = folder('f3')
    const A = new Machine('A3')
    for (const n of ['One', 'Two', 'Three']) {
      A.addSilo(n)
      A.addTab(`s-${n}`, `tab${n}`)
    }
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    const B = new Machine('B3')
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    tick()
    A.removeSilo('s-One')
    A.removeSilo('s-Two')
    A.save()
    await A.push()
    await B.pull()
    B.deliver()
    check(B.renderer.groups.length === 3, 'B kept all silos while asking')
    check(
      B.status?.pendingRemoval?.silos.length === 2,
      `B asks about 2 silos (${JSON.stringify(B.status?.pendingRemoval)})`
    )
    // Meanwhile an unrelated edit on B still syncs out
    tick()
    B.silo('s-Three')!.name = 'Three!'
    B.save()
    B.engine.resolveRemoval(false)
    B.deliver()
    await settle([A, B])
    check(A.renderer.groups.length === 3, `A got the silos back (${A.renderer.groups.length})`)
    check(!!A.tab('t-tabOne'), 'with their tabs')
    check(A.silo('s-Three')!.name === 'Three!', 'and the edit')
    const orderA = [...A.renderer.groups]
      .sort((a, b) => a.order - b.order)
      .map((g) => g.id)
      .join(',')
    check(orderA === 's-One,s-Two,s-Three', `back in their places (${orderA})`)
    check(!B.status?.pendingRemoval, 'question gone')
    sameView(A, B, 'keep')

    // Now remove two again and apply
    tick()
    A.removeSilo('s-One')
    A.removeSilo('s-Two')
    A.save()
    await A.push()
    await B.pull()
    B.engine.resolveRemoval(true)
    B.deliver()
    check(B.renderer.groups.length === 1, 'B removed them after confirming')
    const wipes = (B.engine as unknown as { s: { pendingWipes: Record<string, number> } }).s
      .pendingWipes
    check(!!wipes['s-One'] && wipes['s-One'] > clockNow + 29 * 86400_000, 'logins kept for 30 days')
    check(B.wiped.length === 0, 'nothing wiped yet')
    await settle([A, B])
    sameView(A, B, 'apply removal')
    // 31 days later the site data is cleared
    tick(31 * 86400_000)
    await B.engine.runDueWipes()
    check(B.wiped.includes('s-One') && B.wiped.includes('s-Two'), 'wiped after 30 days')

    // One silo removed: no question
    tick()
    A.addSilo('Four')
    A.save()
    await settle([A, B])
    tick()
    A.removeSilo('s-Four')
    A.save()
    await settle([A, B])
    check(
      !B.silo('s-Four') && !B.status?.pendingRemoval,
      'single silo removal applies without asking'
    )
    A.engine.dispose()
    B.engine.dispose()
  })

  await test('"only on this computer" silos', async () => {
    const f = folder('f4')
    const A = new Machine('A4')
    A.addSilo('Shared')
    A.addTab('s-Shared', 'jira')
    A.addSilo('Private')
    A.addTab('s-Private', 'bank')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', ['s-Private'])
    A.renderer.groups.find((g) => g.id === 's-Private')!.localOnly = true
    const files = readdirSync(join(f, 'Silo Browser', 'machines'))
    const content = readFileSync(join(f, 'Silo Browser', 'machines', files[0]), 'utf8')
    check(
      !content.includes('bank') && !content.includes('Private'),
      'local-only silo never written to the folder'
    )
    const B = new Machine('B4')
    B.addSilo('Bsown')
    B.save()
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    check(
      !B.silo('s-Private') && !!B.silo('s-Shared') && !!B.silo('s-Bsown'),
      'B has Shared + its own, not Private'
    )
    await settle([A, B])
    check(!!A.silo('s-Bsown'), 'A got B silo (combine)')
    check(A.silo('s-Private')?.tabs.length === 1, 'A still has Private with its tab')
    // A edits the private silo: nothing syncs
    tick()
    A.silo('s-Private')!.name = 'Private 2'
    A.addTab('s-Private', 'bank2')
    A.save()
    await settle([A, B])
    const allFiles = readdirSync(join(f, 'Silo Browser', 'machines'))
      .map((n) => readFileSync(join(f, 'Silo Browser', 'machines', n), 'utf8'))
      .join('')
    check(!allFiles.includes('bank'), 'still nothing private in the folder')
    // Move a tab from Shared into Private: it disappears elsewhere
    tick()
    A.moveTab('t-jira', 's-Private', 0)
    A.save()
    await settle([A, B])
    check(!B.tab('t-jira'), 'tab moved into a private silo leaves B')
    check(A.tab('t-jira')?.groupId === 's-Private', 'A keeps it in Private')
    // B turns its own silo private → removed on A (one silo, no question)
    tick()
    B.silo('s-Bsown')!.localOnly = true
    B.save()
    await settle([A, B])
    check(!A.silo('s-Bsown'), 'silo made private on B is removed on A')
    check(!!B.silo('s-Bsown'), 'and kept on B')
    // Sync it again
    tick()
    delete B.silo('s-Bsown')!.localOnly
    B.save()
    await settle([A, B])
    check(!!A.silo('s-Bsown'), 'syncing it again brings it back on A')
    // A remote change can't touch a private silo even if ids match
    sameView(A, B, 'local-only')
    consistent(A, 'local-only')
    A.engine.dispose()
    B.engine.dispose()
  })

  await test('replace mode and restart', async () => {
    const f = folder('f5')
    const A = new Machine('A5')
    A.addSilo('Main')
    A.addTab('s-Main', 'a')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    const B = new Machine('B5')
    B.addSilo('Old')
    B.addTab('s-Old', 'old')
    B.save()
    await B.ready()
    await B.engine.start(f, 'replace', [])
    B.deliver()
    check(!B.silo('s-Old') && !!B.silo('s-Main'), 'replace: B has only the synced setup')
    const wipes = (B.engine as unknown as { s: { pendingWipes: Record<string, number> } }).s
      .pendingWipes
    check(!!wipes['s-Old'], 'replaced silo logins kept 30 days')
    await settle([A, B])
    check(!A.silo('s-Old'), 'B old silo never reached A')

    // B edits, then "crashes" before the engine state is saved; restart picks it up
    tick()
    B.silo('s-Main')!.name = 'Main (edited before crash)'
    B.state.groups = clone(B.renderer.groups) // config saved, engine never saw it
    B.engine.dispose()
    const B2 = new Machine('B5', 'darwin', B.dir)
    B2.state = B.state
    B2.engine.dispose()
    B2.boot()
    await B2.ready()
    await settle([A, B2])
    check(
      A.silo('s-Main')!.name === 'Main (edited before crash)',
      'edit made while the engine was down still syncs'
    )
    sameView(A, B2, 'restart')
    A.engine.dispose()
    B2.engine.dispose()
  })

  await test('combine with the same silos (imported earlier): the folder wins', async () => {
    const f = folder('f6')
    const A = new Machine('A6')
    A.addSilo('Work')
    A.addTab('s-Work', 'gmail')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    tick()
    A.silo('s-Work')!.name = 'Work (new name)'
    A.save()
    await A.push()
    const B = new Machine('B6')
    B.addSilo('Work') // same id, old name (from an old export)
    B.addTab('s-Work', 'gmail')
    B.tab('t-gmail')!.name = 'gmail old'
    B.save()
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    check(B.silo('s-Work')!.name === 'Work (new name)', 'B got the newer name')
    check(B.renderer.groups.length === 1, 'no duplicate silo')
    await settle([A, B])
    sameView(A, B, 'combine same ids')
    A.engine.dispose()
    B.engine.dispose()
  })

  await test('bad files, newer versions, conflict copies, copied profiles', async () => {
    const f = folder('f7')
    const A = new Machine('A7')
    A.addSilo('Work')
    A.addTab('s-Work', 'x')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    const dir = join(f, 'Silo Browser', 'machines')
    writeFileSync(join(dir, 'garbage.json'), '{not json')
    writeFileSync(
      join(dir, 'half.json'),
      '{"format":"silo-sync","version":1,"machine":{"id":"zzz"},"records":{"silo:evil":{"_deleted":{"v":false,"s":"bad"}}'
    )
    writeFileSync(
      join(dir, 'future.json'),
      JSON.stringify({
        format: 'silo-sync',
        version: 9,
        machine: { id: 'future', name: 'F' },
        writtenAt: clockNow,
        records: {
          'silo:s-Work': { _deleted: { v: true, s: M.formatStamp(clockNow + 1e6, 0, 'future') } }
        }
      })
    )
    writeFileSync(
      join(dir, 'evil.json'),
      JSON.stringify({
        format: 'silo-sync',
        version: 1,
        machine: { id: 'evil', name: 'E' },
        writtenAt: clockNow,
        records: {
          'silo:../../x': {
            _deleted: { v: false, s: M.formatStamp(clockNow, 0, 'evil') },
            name: { v: 'Bad id', s: M.formatStamp(clockNow, 0, 'evil') }
          },
          'silo:icon-remote': {
            _deleted: { v: false, s: M.formatStamp(clockNow, 0, 'evil') },
            name: { v: 'Remote icon', s: M.formatStamp(clockNow, 0, 'evil') },
            icon: {
              v: { kind: 'image', value: 'https://tracker.example/x.png' },
              s: M.formatStamp(clockNow, 0, 'evil')
            },
            color: { v: 'red; background:url(x)', s: M.formatStamp(clockNow, 0, 'evil') }
          }
        }
      })
    )
    tick()
    await A.pull()
    A.deliver()
    check(!!A.silo('s-Work'), 'newer-version file ignored (silo not deleted)')
    check(A.status?.newerVersion === true, 'status tells about the newer version')
    check(!A.renderer.groups.some((g) => g.id.includes('/')), 'invalid ids rejected')
    const ri = A.silo('icon-remote')
    check(!!ri && !ri.icon && ri.color === '#6B7280', 'remote image URL and bad color rejected')

    // Conflict copy of a machine file (e.g. Dropbox) just merges
    const B = new Machine('B7')
    await B.ready()
    await B.engine.start(f, 'combine', [])
    B.deliver()
    const bFile = join(dir, `${B.engine.machineId}.json`)
    cpSync(bFile, join(dir, `${B.engine.machineId} (conflicted copy).json`))
    await settle([A, B])
    sameView(A, B, 'conflict copy')

    // Copied profile: C starts from B's userData (same machine id)
    tick()
    const C = new Machine('C7', 'darwin', join(ROOT, 'userdata-C7'))
    cpSync(B.dir, C.dir, { recursive: true })
    C.state = clone(B.state)
    C.engine.dispose()
    C.boot()
    await C.ready()
    const oldId = B.engine.machineId
    check(C.engine.machineId === oldId, 'C starts with B machine id')
    tick()
    C.silo('s-Work')!.name = 'from C'
    C.save()
    await C.push()
    tick()
    await B.pull()
    check(
      B.engine.machineId !== oldId || C.engine.machineId !== oldId,
      'one of them switched to a new id'
    )
    await settle([A, B, C], 5)
    check(A.silo('s-Work')!.name === 'from C', 'C edit not lost')
    sameView(A, B, 'copied profile')
    sameView(A, C, 'copied profile')
    A.engine.dispose()
    B.engine.dispose()
    C.engine.dispose()
  })

  await test('stop syncing keeps the setup and removes our file', async () => {
    const f = folder('f8')
    const A = new Machine('A8')
    A.addSilo('Work')
    A.save()
    await A.ready()
    await A.engine.start(f, 'combine', [])
    const id = A.engine.machineId
    await A.engine.stop()
    check(!existsSync(join(f, 'Silo Browser', 'machines', `${id}.json`)), 'machine file removed')
    check(A.renderer.groups.length === 1 && !A.status?.enabled, 'setup kept, sync off')
    tick()
    A.silo('s-Work')!.name = 'after stop'
    A.save()
    check(
      !existsSync(join(f, 'Silo Browser', 'machines', `${id}.json`)),
      'nothing written after stop'
    )
    A.engine.dispose()
  })

  await test('fuzz: 3 computers, random edits and random sync order converge', async () => {
    let seed = Number(process.env.SEED || 42)
    const rnd = (n: number): number => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) | 0
      let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
      return ((x ^ (x >>> 14)) >>> 0) % n
    }
    const f = folder('f9')
    const ms = [new Machine('X', 'darwin'), new Machine('Y', 'win32'), new Machine('Z', 'linux')]
    ms[0].addSilo('Base')
    ms[0].addTab('s-Base', 'base0')
    ms[0].save()
    for (const m of ms) {
      await m.ready()
      await m.engine.start(f, 'combine', [])
      m.deliver()
    }
    await settle(ms)
    let counter = 0
    const createdSilos = new Set<string>(['s-Base'])
    const createdTabs = new Map<string, string>([['t-base0', 's-Base']])
    const touchedSilos = new Set<string>() // removed somewhere
    const touchedTabs = new Set<string>() // removed or moved somewhere
    const STEPS = Number(process.env.STEPS || 400)
    for (let step = 0; step < STEPS; step++) {
      const m = ms[rnd(3)]
      tick(rnd(3) * 7)
      const silos = m.renderer.groups
      const op = rnd(12)
      const anyTab = (): Tab | undefined => {
        const all = silos.flatMap((g) => g.tabs)
        return all[rnd(Math.max(1, all.length))]
      }
      if (op === 0 || silos.length === 0) createdSilos.add(m.addSilo(`S${++counter}`).id)
      else if (op <= 3) {
        const t = m.addTab(silos[rnd(silos.length)].id, `T${++counter}`)
        createdTabs.set(t.id, t.groupId)
      } else if (op === 4) {
        const t = anyTab()
        if (t) t.name = `n${++counter}`
      } else if (op === 5) {
        const t = anyTab()
        if (t) {
          touchedTabs.add(t.id)
          m.removeTab(t.id)
        }
      } else if (op === 6 && silos.length > 3) {
        const g = silos[rnd(silos.length)]
        touchedSilos.add(g.id)
        m.removeSilo(g.id)
      } else if (op === 7) {
        const t = anyTab()
        if (t) {
          touchedTabs.add(t.id)
          m.moveTab(t.id, silos[rnd(silos.length)].id, rnd(4))
        }
      } else if (op === 8) m.renderer.settings.accentColor = ['blue', 'red', 'green'][rnd(3)]
      else if (op === 9) {
        const t = anyTab()
        if (t)
          t.shortcut = rnd(2)
            ? `${m.platform === 'darwin' ? 'Command' : 'Control'}+Alt+${'ABC'[rnd(3)]}`
            : undefined
      } else if (op === 10) {
        const g = silos[rnd(silos.length)]
        g.name = `G${++counter}`
      } else if (op === 11) {
        if (rnd(2)) {
          // Only on this computer, on or off (excluded from the no-loss check)
          const g = silos[rnd(silos.length)]
          touchedSilos.add(g.id)
          if (g.localOnly) delete g.localOnly
          else g.localOnly = true
        } else {
          // Restart the app (what was saved survives; the renderer reloads from it)
          m.save()
          m.engine.flushSync()
          m.engine.dispose()
          m.boot()
          await m.ready()
        }
      }
      // Sometimes save, sometimes leave it pending (stale), sometimes sync
      const action = rnd(8)
      if (action <= 2) m.save()
      if (action === 6) m.saveGroupsOnly()
      if (action === 7) m.saveSettingsOnly()
      if (action === 3) {
        await m.push()
      }
      if (action === 4) {
        await m.pull()
        if (rnd(2)) m.deliver()
      }
      if (action === 5) {
        m.save()
        await m.push()
        await m.pull()
        m.deliver()
      }
      // A remote silo removal may be held: answer it (randomly)
      if (m.status?.pendingRemoval && rnd(2)) {
        m.engine.resolveRemoval(rnd(2) === 0)
        m.deliver()
      }
    }
    for (const m of ms) m.save()
    for (let i = 0; i < 6; i++) {
      for (const m of ms) if (m.status?.pendingRemoval) m.engine.resolveRemoval(true)
      await settle(ms, 1)
    }
    sameView(ms[0], ms[1], 'fuzz')
    sameView(ms[0], ms[2], 'fuzz')
    for (const m of ms) consistent(m, 'fuzz')
    const v = ms[0].view()
    // Nothing nobody deleted may go missing (held removals were answered "remove" at the end,
    // and "keep" answers can only bring things back)
    for (const id of createdSilos)
      if (!touchedSilos.has(id)) check(!!v.silos[id], `silo ${id} survived`)
    for (const [id, silo] of createdTabs) {
      if (!touchedTabs.has(id) && !touchedSilos.has(silo)) check(!!v.tabs[id], `tab ${id} survived`)
    }
    console.log(
      `  (fuzz: ${counter} ops; ended with ${Object.keys(v.silos).length} silos, ${Object.keys(v.tabs).length} tabs)`
    )
    for (const m of ms) m.engine.dispose()
  })

  console.log(`\n${passes} passed, ${failures} failed`)
  rmSync(ROOT, { recursive: true, force: true })
  process.exit(failures ? 1 : 0)
}

main()
