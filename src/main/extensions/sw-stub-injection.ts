import { existsSync } from 'fs'
import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'

/**
 * Prepend chrome.* stub definitions to an extension's service worker script
 * on disk, so they're the very first thing that runs when Chromium starts
 * the SW.
 *
 * Why this is necessary
 * ─────────────────────
 * In Electron 42, service-worker preloads (`session.registerPreloadScript`
 * with `type: 'service-worker'`) run in a context that is NOT the same main
 * world as the SW's actual script. Even `contextBridge.executeInMainWorld`
 * injects into a sibling world that the SW's `background.js` cannot see.
 * Extensions that touch `chrome.commands`, `chrome.sidePanel`, etc. at the
 * top of their SW script crash with "Cannot read properties of undefined"
 * — and a dead SW means the extension is unusable.
 *
 * The only place we KNOW runs in the same world as the SW's script is the
 * SW's script itself. So we prepend a small synchronous block that:
 *
 *   - Guards each stub with `if (!chrome.X)` so we never clobber a real
 *     implementation that Electron or `electron-chrome-extensions` provides.
 *   - Defines no-op fallbacks for APIs Silo can't fully implement.
 *
 * The change is idempotent — we look for a marker comment and skip if it's
 * already there.
 */

const MARKER = '/* === SILO COMPAT STUBS — DO NOT REMOVE === */'

/**
 * Prepend the stubs to the extension's service worker script.
 * Returns `true` if the file was modified, `false` if it was already
 * prepared (or there's no SW to prepare).
 */
export async function prependCompatStubsToServiceWorker(
  extensionPath: string,
  manifest: { background?: { service_worker?: string; type?: string } } | null | undefined
): Promise<boolean> {
  const swRelativePath = manifest?.background?.service_worker
  if (!swRelativePath) return false

  // ES-module SWs require `import` instead of plain JS at the top — prepending
  // imperative code there could break parsing. Skip for now; commands isn't
  // typically used at the top of module SWs anyway.
  if (manifest?.background?.type === 'module') return false

  const swFullPath = join(extensionPath, swRelativePath)
  if (!existsSync(swFullPath)) return false

  let original: string
  try {
    original = await readFile(swFullPath, 'utf-8')
  } catch (err) {
    console.warn(`[extensions] failed to read SW at ${swFullPath}:`, err)
    return false
  }

  // Idempotency: already prepared.
  if (original.includes(MARKER)) return false

  const prefix = `${MARKER}\n${STUB_SOURCE}\n/* === END SILO COMPAT STUBS === */\n`
  try {
    await writeFile(swFullPath, prefix + original, 'utf-8')
    return true
  } catch (err) {
    console.warn(`[extensions] failed to prepend stubs to ${swFullPath}:`, err)
    return false
  }
}

/** The stub code itself. Uses `var` and `function ()` for max compatibility. */
const STUB_SOURCE = `
;(function () {
  if (typeof chrome === 'undefined') return;
  var stubEvent = function () {
    return {
      addListener: function () {},
      removeListener: function () {},
      hasListener: function () { return false; },
      hasListeners: function () { return false; }
    };
  };
  var asyncNoop = function () { return Promise.resolve(); };
  var asyncReturn = function (v) { return function () { return Promise.resolve(v); }; };

  if (!chrome.commands) {
    chrome.commands = {
      onCommand: stubEvent(),
      getAll: asyncReturn([]),
      update: asyncNoop
    };
  }
  if (!chrome.sidePanel) {
    chrome.sidePanel = {
      setOptions: asyncNoop,
      getOptions: asyncReturn({}),
      open: asyncNoop,
      setPanelBehavior: asyncNoop,
      getPanelBehavior: asyncReturn({ openPanelOnActionClick: false }),
      onAvailableChanged: stubEvent()
    };
  }
  if (!chrome.tabCapture) {
    chrome.tabCapture = {
      capture: asyncReturn(null),
      getCapturedTabs: asyncReturn([]),
      getMediaStreamId: asyncReturn(''),
      onStatusChanged: stubEvent()
    };
  }
  if (!chrome.scripting) {
    chrome.scripting = {
      executeScript: asyncReturn([{ result: null }]),
      insertCSS: asyncNoop,
      removeCSS: asyncNoop,
      registerContentScripts: asyncNoop,
      unregisterContentScripts: asyncNoop,
      updateContentScripts: asyncNoop,
      getRegisteredContentScripts: asyncReturn([])
    };
  }
  if (!chrome.offscreen) {
    chrome.offscreen = {
      createDocument: asyncNoop,
      closeDocument: asyncNoop,
      hasDocument: asyncReturn(false)
    };
  }
  if (!chrome.alarms) {
    chrome.alarms = {
      create: asyncNoop,
      get: asyncReturn(null),
      getAll: asyncReturn([]),
      clear: asyncReturn(true),
      clearAll: asyncReturn(true),
      onAlarm: stubEvent()
    };
  }
  if (!chrome.declarativeNetRequest) {
    chrome.declarativeNetRequest = {
      updateDynamicRules: asyncNoop,
      getDynamicRules: asyncReturn([]),
      updateSessionRules: asyncNoop,
      getSessionRules: asyncReturn([]),
      updateEnabledRulesets: asyncNoop,
      getEnabledRulesets: asyncReturn([]),
      getAvailableStaticRuleCount: asyncReturn(0),
      onRuleMatchedDebug: stubEvent()
    };
  }
})();
`
