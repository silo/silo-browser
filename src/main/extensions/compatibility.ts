/**
 * Map of chrome.* APIs and Chrome extension permissions to how well Silo
 * supports them. Used by the installer to build a compatibility report from
 * an extension's manifest so the user can decide whether to proceed.
 *
 *   'supported'  — Backed by Electron natively or by `electron-chrome-extensions`.
 *                  The API works the same as in Chrome.
 *   'partial'    — Polyfilled but with reduced functionality. Calls don't throw
 *                  but features may not behave fully (e.g. chrome.scripting
 *                  falls back to chrome.tabs.executeScript and only handles
 *                  common cases).
 *   'stub'       — No-op polyfill. The API is defined to prevent crashes, but
 *                  nothing actually happens. Features depending on it won't work.
 *   'unsupported'— Not present at all. Extensions calling the API will crash
 *                  unless they guard against undefined.
 *   'passive'    — A permission marker with no runtime API to support
 *                  (`activeTab`, `unlimitedStorage`, host permissions, etc).
 *
 * Anything not listed below is treated as 'unsupported' — we'd rather warn
 * conservatively than miss something.
 */
export type ApiSupport = 'supported' | 'partial' | 'stub' | 'unsupported' | 'passive'

const API_SUPPORT: Record<string, ApiSupport> = {
  // ── Passive permissions ─────────────────────────────────────────────────
  activeTab: 'passive',
  unlimitedStorage: 'passive',
  geolocation: 'passive',
  clipboardRead: 'passive',
  clipboardWrite: 'passive',
  webRequestBlocking: 'passive',
  proxy: 'passive',

  // ── Fully supported ─────────────────────────────────────────────────────
  storage: 'supported',
  cookies: 'supported',
  contextMenus: 'supported',
  tabs: 'supported',
  notifications: 'supported',
  webNavigation: 'supported',
  webRequest: 'supported',
  windows: 'supported',
  runtime: 'supported',
  i18n: 'supported',
  management: 'supported',

  // ── Partial / polyfilled ────────────────────────────────────────────────
  // chrome.scripting is provided by electron-chrome-extensions and routes
  // through chrome.tabs.executeScript. Do NOT add it to the SW stubs in
  // sw-stub-injection.ts — a no-op stub races with the polyfill at SW
  // start and breaks extensions that rely on executeScript (e.g. Bitwarden
  // autofill).
  scripting: 'partial',

  // ── Stubbed no-op (prevents crash, feature is dead) ─────────────────────
  commands: 'stub',
  sidePanel: 'stub',
  tabCapture: 'stub',
  offscreen: 'stub',
  alarms: 'stub',
  declarativeNetRequest: 'stub',
  declarativeNetRequestWithHostAccess: 'stub',
  declarativeNetRequestFeedback: 'stub',

  // ── Known unsupported (no polyfill, calls will crash) ───────────────────
  nativeMessaging: 'unsupported',
  identity: 'unsupported',
  desktopCapture: 'unsupported',
  bookmarks: 'unsupported',
  history: 'unsupported',
  downloads: 'unsupported',
  topSites: 'unsupported',
  pageCapture: 'unsupported',
  printerProvider: 'unsupported',
  privacy: 'unsupported',
  ttsEngine: 'unsupported',
  tts: 'unsupported',
  vpnProvider: 'unsupported',
  wallpaper: 'unsupported'
}

/** Per-API human label shown in the warning dialog. */
const API_LABELS: Record<string, string> = {
  commands: 'Keyboard shortcuts (chrome.commands)',
  sidePanel: 'Side panel UI (chrome.sidePanel)',
  tabCapture: 'Tab capture (chrome.tabCapture)',
  offscreen: 'Offscreen documents (chrome.offscreen)',
  alarms: 'Scheduled alarms (chrome.alarms)',
  declarativeNetRequest: 'Network request rules (chrome.declarativeNetRequest)',
  scripting: 'Dynamic script injection (chrome.scripting)',
  nativeMessaging: 'Native messaging hosts',
  identity: 'OAuth identity (chrome.identity)',
  desktopCapture: 'Desktop capture',
  bookmarks: 'Bookmarks',
  history: 'Browsing history',
  downloads: 'Download management',
  topSites: 'Top sites',
  pageCapture: 'Page capture'
}

/**
 * Loose shape of an extension's `manifest.json` covering every field Silo
 * inspects — manifest_version checks, SW startup, compatibility analysis,
 * description extraction, icon resolution. Loose by design: Chrome manifests
 * are open-shaped so callers should treat unknown fields permissively.
 */
export interface ChromeManifest {
  name?: string
  description?: string
  manifest_version?: number
  permissions?: unknown[]
  optional_permissions?: unknown[]
  host_permissions?: unknown[]
  commands?: unknown
  side_panel?: unknown
  background?: {
    service_worker?: string
    type?: string
  }
  icons?: Record<string, string>
  action?: { default_icon?: string | Record<string, string> }
  browser_action?: { default_icon?: string | Record<string, string> }
}

export interface CompatibilityReport {
  name: string
  supported: string[]
  partial: string[]
  stubbed: string[]
  unsupported: string[]
  /** True when nothing the extension declared is partial/stub/unsupported. */
  fullyCompatible: boolean
  /** True when at least one declared API is `unsupported` (likely to crash). */
  hasUnsupported: boolean
}

/**
 * Analyse an extension's manifest and return a compatibility report.
 *
 * We look at:
 *   - `permissions` and `optional_permissions` arrays
 *   - Top-level manifest sections that imply API usage (`commands`,
 *     `side_panel`) even when the corresponding permission isn't declared
 *
 * Host permissions and pure URL patterns are ignored — they're access
 * declarations, not chrome.* APIs.
 */
export function analyzeManifest(manifest: ChromeManifest): CompatibilityReport {
  const declared = new Set<string>()
  for (const list of [manifest.permissions, manifest.optional_permissions]) {
    if (!Array.isArray(list)) continue
    for (const item of list) {
      if (typeof item === 'string' && !looksLikeUrlPattern(item)) {
        declared.add(item)
      }
    }
  }
  // Implicit API usage from top-level manifest sections.
  if (manifest.commands) declared.add('commands')
  if (manifest.side_panel) declared.add('sidePanel')

  const supported: string[] = []
  const partial: string[] = []
  const stubbed: string[] = []
  const unsupported: string[] = []

  for (const api of declared) {
    const level = API_SUPPORT[api] ?? 'unsupported'
    switch (level) {
      case 'supported':
      case 'passive':
        supported.push(api)
        break
      case 'partial':
        partial.push(api)
        break
      case 'stub':
        stubbed.push(api)
        break
      case 'unsupported':
        unsupported.push(api)
        break
    }
  }

  return {
    name: manifest.name ?? 'this extension',
    supported: supported.sort(),
    partial: partial.sort(),
    stubbed: stubbed.sort(),
    unsupported: unsupported.sort(),
    fullyCompatible: partial.length === 0 && stubbed.length === 0 && unsupported.length === 0,
    hasUnsupported: unsupported.length > 0
  }
}

/** Build the message-body text shown in the warning dialog. */
export function describeReport(report: CompatibilityReport): string {
  const lines: string[] = []
  if (report.unsupported.length > 0) {
    lines.push('Not supported — these features will not work and may crash the extension:')
    for (const api of report.unsupported) lines.push(`  • ${API_LABELS[api] ?? api}`)
    lines.push('')
  }
  if (report.stubbed.length > 0) {
    lines.push('Limited — these features are stubbed so the extension runs but does not actually work:')
    for (const api of report.stubbed) lines.push(`  • ${API_LABELS[api] ?? api}`)
    lines.push('')
  }
  if (report.partial.length > 0) {
    lines.push('Partial — these features work for common cases only:')
    for (const api of report.partial) lines.push(`  • ${API_LABELS[api] ?? api}`)
    lines.push('')
  }
  return lines.join('\n').trim()
}

function looksLikeUrlPattern(value: string): boolean {
  return value.includes('://') || value.startsWith('<') || value.includes('*')
}
