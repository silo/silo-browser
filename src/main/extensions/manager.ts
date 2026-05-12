import {
  BrowserWindow,
  session as electronSession,
  webContents as electronWebContents
} from 'electron'
import { ElectronChromeExtensions } from 'electron-chrome-extensions'
import { getCachedState, type InstalledExtensionEntry } from '../store'
import { registerSmartCrxProtocolOnMainSession } from './crx-protocol'

export const GROUP_PARTITION_PREFIX = 'persist:silo-group-'

/**
 * Per-session extension wiring.
 *
 * Silo runs one isolated session per group plus the main BrowserWindow's
 * `defaultSession`. Each session that participates in extensions gets its own
 * `ElectronChromeExtensions` binding — that's what the upstream library
 * requires. This class is the single owner of those bindings, plus the
 * adapters needed to make `chrome.tabs.*`, `chrome.contextMenus`, and
 * `chrome.windows.create({type:'popup'})` talk to Silo's tab and window model.
 *
 * It does NOT know anything about installing/removing extensions or the
 * persisted registry — see `./installer.ts` for that.
 */
export class ExtensionsManager {
  private bindings = new WeakMap<Electron.Session, ElectronChromeExtensions>()
  private initializedSessions = new WeakSet<Electron.Session>()
  private resolveMainWindow: () => BrowserWindow | null = () => null
  private mainSessionReady = false

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  setMainWindowResolver(resolver: () => BrowserWindow | null): void {
    this.resolveMainWindow = resolver
  }

  /**
   * Initialise extensions in a group session: ensure the binding exists, then
   * load every enabled entry whose `activeGroupIds` includes this group. Safe
   * to call repeatedly — idempotent per session.
   */
  async initSession(session: Electron.Session): Promise<void> {
    if (this.initializedSessions.has(session)) return
    this.initializedSessions.add(session)

    this.ensureBinding(session)

    const groupId = this.groupIdForSession(session)
    if (!groupId) return

    const entries = (getCachedState().installedExtensions ?? []) as InstalledExtensionEntry[]
    for (const entry of entries) {
      if (this.isActiveInGroup(entry, groupId)) {
        await this.loadEntryInto(session, entry)
      }
    }
  }

  /**
   * Prepare the main (renderer-chrome) session. Unlike group sessions, the
   * main session never loads any extensions — extensions are isolated to the
   * groups they're active in. The only thing we wire here is a smart crx://
   * protocol handler so the `<browser-action-list>` element's icons (which
   * are fetched from the main session) can still resolve to the right group.
   */
  ensureMainSessionReady(): void {
    if (this.mainSessionReady) return
    this.mainSessionReady = true
    registerSmartCrxProtocolOnMainSession()
  }

  /**
   * Backwards-compatible alias. Some older call sites used
   * `ensureMainSessionInitialised`; kept as a tiny shim while the rest of
   * the codebase migrates.
   */
  ensureMainSessionInitialised(): void {
    this.ensureMainSessionReady()
  }

  // ── Session helpers ──────────────────────────────────────────────────────

  mainSession(): Electron.Session {
    return electronSession.defaultSession
  }

  groupSession(groupId: string): Electron.Session {
    return electronSession.fromPartition(`${GROUP_PARTITION_PREFIX}${groupId}`)
  }

  groupPartition(groupId: string): string {
    return `${GROUP_PARTITION_PREFIX}${groupId}`
  }

  /** Every persisted group's session. */
  allGroupSessions(): Electron.Session[] {
    const groups = (getCachedState().groups as Array<{ id?: string }>) ?? []
    return groups
      .filter((g) => typeof g.id === 'string')
      .map((g) => this.groupSession(g.id as string))
  }

  /** Group sessions + main session — every place extensions need to be loaded. */
  allSessions(): Electron.Session[] {
    return [...this.allGroupSessions(), this.mainSession()]
  }

  /** Partition strings for the on-disk storage cleanup helpers. */
  allPartitionStrings(): string[] {
    const groups = (getCachedState().groups as Array<{ id?: string }>) ?? []
    return groups
      .filter((g) => typeof g.id === 'string')
      .map((g) => this.groupPartition(g.id as string))
  }

  /** All current group ids. Used to default activeGroupIds at install time. */
  allGroupIds(): string[] {
    const groups = (getCachedState().groups as Array<{ id?: string }>) ?? []
    return groups.filter((g) => typeof g.id === 'string').map((g) => g.id as string)
  }

  /**
   * Whether this entry should be loaded in a given group session.
   * `activeGroupIds === undefined` is legacy — treated as "all groups" so we
   * preserve behaviour for upgraded installs.
   */
  isActiveInGroup(entry: InstalledExtensionEntry, groupId: string): boolean {
    if (!entry.enabled) return false
    if (entry.activeGroupIds === undefined) return true
    return entry.activeGroupIds.includes(groupId)
  }

  /** Reverse lookup: which group does this session belong to (if any)? */
  private groupIdForSession(session: Electron.Session): string | null {
    for (const groupId of this.allGroupIds()) {
      if (this.groupSession(groupId) === session) return groupId
    }
    return null
  }

  /**
   * Unload every extension from a group's session. Called by the installer
   * when a group is being deleted; the on-disk session data is wiped
   * separately by `store:clear-group-session`.
   */
  unloadAllFromGroup(groupId: string): void {
    const session = this.groupSession(groupId)
    if (!this.bindings.get(session)) return
    const loaded = session.extensions.getAllExtensions()
    for (const ext of loaded) {
      this.removeFromSession(session, ext.id)
    }
  }

  // ── Extension loading per session ────────────────────────────────────────

  /**
   * Load an entry into a session if it's enabled and not already loaded.
   * Starts the MV3 service worker too, since Electron doesn't auto-start them.
   */
  async loadEntryInto(
    session: Electron.Session,
    entry: InstalledExtensionEntry
  ): Promise<void> {
    if (!entry.enabled) return
    if (session.extensions.getExtension(entry.id)) return

    try {
      const loaded = await session.extensions.loadExtension(entry.path, {
        allowFileAccess: true
      })
      await this.startServiceWorkerIfMv3(session, loaded)
    } catch (err) {
      console.error(`[extensions] failed to load ${entry.id}:`, err)
    }
  }

  /** Load into every group session this entry is active in. */
  async loadEntryIntoActiveGroups(entry: InstalledExtensionEntry): Promise<void> {
    for (const groupId of this.allGroupIds()) {
      if (!this.isActiveInGroup(entry, groupId)) continue
      const session = this.groupSession(groupId)
      this.ensureBinding(session)
      await this.loadEntryInto(session, entry)
    }
  }

  /**
   * Reconcile an entry's loaded state with its `activeGroupIds`: load into
   * groups it should be in, unload from groups it shouldn't. Called whenever
   * activation changes (toggle, group deleted, etc).
   */
  async reconcileEntry(entry: InstalledExtensionEntry): Promise<void> {
    for (const groupId of this.allGroupIds()) {
      const session = this.groupSession(groupId)
      if (this.isActiveInGroup(entry, groupId)) {
        this.ensureBinding(session)
        await this.loadEntryInto(session, entry)
      } else {
        this.removeFromSession(session, entry.id)
      }
    }
  }

  /** Unload an extension from every session it might be loaded in. */
  unloadEverywhere(extensionId: string): void {
    for (const session of this.allSessions()) {
      this.removeFromSession(session, extensionId)
    }
  }

  private removeFromSession(session: Electron.Session, extensionId: string): void {
    try {
      if (session.extensions.getExtension(extensionId)) {
        session.extensions.removeExtension(extensionId)
      }
    } catch {
      // Already gone — fine.
    }
  }

  // ── Tab tracking ─────────────────────────────────────────────────────────

  /** Register a webview's webContents so chrome.tabs.* APIs see it. */
  trackTab(contents: Electron.WebContents): void {
    const binding = this.bindings.get(contents.session)
    if (!binding) return
    const window = this.resolveMainWindow()
    if (!window) return
    binding.addTab(contents, window)
    this.primeTabCache(binding, contents)
  }

  /**
   * Mark a webContents as the active tab. Routed from the renderer whenever
   * the user switches tab so chrome.tabs.query({active:true}) returns the
   * correct entry.
   */
  selectActiveTab(webContentsId: number): void {
    const contents = electronWebContents.fromId(webContentsId)
    if (!contents || contents.isDestroyed()) return

    const binding = this.bindings.get(contents.session)
    if (!binding) return

    try {
      const window = this.resolveMainWindow()
      if (window) binding.addTab(contents, window)
      this.primeTabCache(binding, contents)
      binding.selectTab(contents)
    } catch (err) {
      console.warn('[extensions] selectActiveTab failed:', err)
    }
  }

  // ── Context menu ─────────────────────────────────────────────────────────

  /**
   * Get extension-contributed context menu items for a right-click target.
   * Returns an empty array when no extensions registered for this context or
   * no binding exists for the session.
   */
  getContextMenuItems(
    contents: Electron.WebContents,
    params: Electron.ContextMenuParams
  ): Electron.MenuItem[] {
    const binding = this.bindings.get(contents.session)
    if (!binding) return []

    // Ensure the tab is registered AND primed in the library's cache, otherwise
    // a click on an extension menu item is silently dropped (see primeTabCache).
    const window = this.resolveMainWindow()
    if (window) {
      try {
        binding.addTab(contents, window)
      } catch {
        // Already added.
      }
    }
    this.primeTabCache(binding, contents)

    try {
      return binding.getContextMenuItems(contents, params)
    } catch (err) {
      console.warn('[extensions] getContextMenuItems failed:', err)
      return []
    }
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private ensureBinding(session: Electron.Session): ElectronChromeExtensions {
    const existing = this.bindings.get(session)
    if (existing) return existing

    const binding = new ElectronChromeExtensions({
      license: 'GPL-3.0',
      session,
      createTab: async (details) =>
        this.handleCreateTab(session, details as ExtensionCreateTabDetails),
      selectTab: () => {
        // Extension-driven tab activation isn't wired into Silo's tab model.
        // chrome.tabs.update({active:true}) is a no-op for now.
      },
      removeTab: (tab) => this.handleRemoveTab(tab),
      createWindow: async (details) =>
        this.handleCreateWindow(session, details as ExtensionCreateWindowDetails),
      removeWindow: (window) => this.handleRemoveWindow(window as BrowserWindow)
    })

    ElectronChromeExtensions.handleCRXProtocol(session)
    this.bindings.set(session, binding)
    return binding
  }

  /**
   * chrome.tabs.create — open as a standalone BrowserWindow in the same session.
   *
   * We deliberately do NOT return the main Silo window here: subsequent
   * chrome.tabs.update({url}) calls would navigate that webContents, replacing
   * Silo's renderer chrome with the extension's page (Sider, for instance,
   * opens its options page this way). Spawning a fresh window keeps those
   * navigations isolated.
   *
   * Silo's per-group tab model is renderer-driven, so we can't synchronously
   * mount a webview and return its webContents — opening a separate window is
   * the closest semantic match.
   */
  private async handleCreateTab(
    session: Electron.Session,
    details: ExtensionCreateTabDetails
  ): Promise<[Electron.WebContents, BrowserWindow]> {
    const window = openExtensionPopupWindow(
      session,
      this.resolveMainWindow() ?? undefined,
      {
        url: details.url,
        width: 1024,
        height: 768,
        focused: details.active !== false
      }
    )
    return [window.webContents, window]
  }

  /**
   * chrome.windows.create — also routes to a fresh BrowserWindow regardless of
   * the requested `type`. For `'popup'`/`'panel'` this is the obvious match;
   * for `'normal'` it avoids the same renderer-chrome hijack risk as createTab.
   */
  private async handleCreateWindow(
    session: Electron.Session,
    details: ExtensionCreateWindowDetails
  ): Promise<BrowserWindow> {
    return openExtensionPopupWindow(
      session,
      this.resolveMainWindow() ?? undefined,
      details
    )
  }

  private handleRemoveTab(tab: Electron.WebContents): void {
    // The library calls removeTab in two situations:
    //   (a) the webContents was already destroyed (user closed the window);
    //   (b) the extension called chrome.tabs.remove(id) on a live tab.
    //
    // For (a) the window is gone — touching it would re-enter the close path
    // and crash. Only act when the webContents is still alive (case b).
    if (tab.isDestroyed()) return
    const window = BrowserWindow.fromWebContents(tab)
    if (!window || window === this.resolveMainWindow() || window.isDestroyed()) return
    try {
      window.close()
    } catch (err) {
      console.warn('[extensions] handleRemoveTab close failed:', err)
    }
  }

  private handleRemoveWindow(window: BrowserWindow): void {
    // Mirror of handleRemoveTab: bail if the window is already gone, otherwise
    // close any extension-spawned window — but never the main Silo window.
    if (!window || window.isDestroyed()) return
    if (window === this.resolveMainWindow()) return
    try {
      window.close()
    } catch (err) {
      console.warn('[extensions] handleRemoveWindow close failed:', err)
    }
  }

  private async startServiceWorkerIfMv3(
    session: Electron.Session,
    extension: Electron.Extension
  ): Promise<void> {
    const manifest = extension.manifest as {
      manifest_version?: number
      background?: { service_worker?: string }
    }
    if (manifest.manifest_version !== 3 || !manifest.background?.service_worker) return
    await session.serviceWorkers
      .startWorkerForScope(extension.url)
      .catch((err) => console.warn(`[extensions] failed to start SW for ${extension.id}:`, err))
  }

  /**
   * Force a `tabDetailsCache` write inside the library for the given tab.
   *
   * Workaround: the library populates that cache lazily when chrome.tabs.query
   * runs. Its `contextMenus.onClicked` dispatcher reads from the cache with no
   * fallback — a missing entry causes the click to be silently dropped. We
   * reach into `manager.api.tabs.getTabDetails` to force a cache write.
   *
   * If the library's internal shape changes we just no-op rather than crash.
   */
  private primeTabCache(
    binding: ElectronChromeExtensions,
    contents: Electron.WebContents
  ): void {
    try {
      const internals = binding as unknown as {
        api?: { tabs?: { getTabDetails?: (c: Electron.WebContents) => void } }
      }
      internals.api?.tabs?.getTabDetails?.(contents)
    } catch {
      // Internal API changed — best-effort, ignore.
    }
  }
}

interface ExtensionCreateTabDetails {
  url?: string
  active?: boolean
  windowId?: number
  index?: number
}

interface ExtensionCreateWindowDetails {
  type?: string
  /** chrome.windows.create allows an array; we just take the first URL. */
  url?: string | string[]
  width?: number
  height?: number
  top?: number
  left?: number
  focused?: boolean
}

function firstUrl(url: string | string[] | undefined): string | undefined {
  if (!url) return undefined
  return Array.isArray(url) ? url[0] : url
}

// ── Extension popup BrowserWindow factory ──────────────────────────────────

function openExtensionPopupWindow(
  session: Electron.Session,
  _parent: BrowserWindow | undefined,
  details: ExtensionCreateWindowDetails
): BrowserWindow {
  // Independent (non-child) window. We used to set `parent` to keep the popup
  // grouped with the main Silo window, but that turned it into a macOS
  // attached panel — long-running extension UIs (e.g. Sider's sidebar with
  // streaming chat) hit attached-window restrictions and could destabilise
  // the main process when they crashed.
  const window = new BrowserWindow({
    width: details.width ?? 800,
    height: details.height ?? 600,
    x: details.left,
    y: details.top,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      session,
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  // Same reason as the main window: every ElectronChromeExtensions binding
  // that tracks this window adds its own listener set. Default cap of 10
  // gets exceeded once a few groups have bindings.
  window.setMaxListeners(50)

  window.once('ready-to-show', () => {
    if (details.focused === false) window.showInactive()
    else window.show()
  })

  // If the renderer process for this window crashes (Sider streaming heavy
  // content, OOM, etc.) destroy the window cleanly instead of leaving a dead
  // webContents in the extension library's tracking — accessing a destroyed
  // webContents later would crash the main process.
  window.webContents.on('render-process-gone', (_event, details) => {
    console.warn(
      `[extensions] popup renderer gone (${details.reason}); closing window`
    )
    if (!window.isDestroyed()) window.destroy()
  })

  const url = firstUrl(details.url)
  if (url) {
    window.loadURL(url).catch((err) =>
      console.warn('[extensions] popup window failed to load:', err)
    )
  }
  return window
}

/** The single ExtensionsManager instance used across the main process. */
export const extensionsManager = new ExtensionsManager()
