import { contextBridge, ipcRenderer } from 'electron'
import { installMediaCaptureTracking } from './media-capture'

// Camera / mic / screen-share tracking, installed in the page's main world before any page
// script runs (see media-capture.ts). Frames report through postMessage, handled below.
try {
  contextBridge.executeInMainWorld({ func: installMediaCaptureTracking, args: ['self'] })
} catch {
  // e.g. a page without a main world yet — tracking is best-effort
}

// Prevent web content from stealing OS-level focus.
// In a real browser, window.focus() is a no-op for background tabs.
// Web apps (Teams, Outlook, etc.) call this on new messages/notifications.
window.focus = () => {}

// Block JS dialogs (alert/confirm/prompt) when the window is unfocused.
// These cause Electron to bring the window to the foreground via native dialogs.
const _origAlert = window.alert.bind(window)
const _origConfirm = window.confirm.bind(window)
const _origPrompt = window.prompt.bind(window)

function _isWindowFocused(): boolean {
  try {
    return ipcRenderer.sendSync('silo:is-window-focused')
  } catch {
    return true // fail-open so dialogs aren't broken if IPC fails
  }
}

window.alert = function (message?: string) {
  if (!_isWindowFocused()) {
    return undefined
  }
  return _origAlert(message)
}

window.confirm = function (message?: string): boolean {
  if (!_isWindowFocused()) {
    return false
  }
  return _origConfirm(message)
}

window.prompt = function (message?: string, defaultValue?: string): string | null {
  if (!_isWindowFocused()) {
    return null
  }
  return _origPrompt(message, defaultValue)
}

// Override window.open() in the isolated world (catches calls from preload context).
// The main world override is in the notification injection script (executeJavaScript).
window.open = function (url?: string | URL, _target?: string, _features?: string) {
  const urlStr = url?.toString() ?? ''
  if (urlStr) {
    ipcRenderer.send('silo:window-open', urlStr)
  }
  return null
}

// Listen for window.open() calls relayed from the main world via postMessage.
// The notification injection script overrides window.open() in the main world
// and posts a message here since it can't access ipcRenderer directly.
window.addEventListener('message', (e) => {
  if (e.data?.type === '__silo_window_open' && e.data.url) {
    ipcRenderer.send('silo:window-open', e.data.url)
  }
  if (e.data?.type === '__silo_media_capture' && typeof e.data.frameId === 'string') {
    onFrameCapture(e.data.frameId, e.data.state)
  }
  if (e.data?.type === '__silo_notification_click') {
    const tabId = e.data.tabId || document.documentElement.dataset.siloTabId
    if (tabId) {
      ipcRenderer.send('silo:notification-click', tabId)
      ipcRenderer.sendToHost('notification-click', tabId)
    }
  }
})

// ── Camera / mic / screen share: combine every frame's state and tell the host ──
type CaptureState = { camera: boolean; mic: boolean; screen: boolean }
const captureByFrame = new Map<string, CaptureState>()
let lastCapture = ''

function onFrameCapture(frameId: string, raw: unknown): void {
  const s = (raw ?? {}) as Partial<CaptureState>
  const state = { camera: !!s.camera, mic: !!s.mic, screen: !!s.screen }
  if (state.camera || state.mic || state.screen) captureByFrame.set(frameId, state)
  else captureByFrame.delete(frameId)
  const combined = { camera: false, mic: false, screen: false }
  captureByFrame.forEach((c) => {
    combined.camera ||= c.camera
    combined.mic ||= c.mic
    combined.screen ||= c.screen
  })
  const key = JSON.stringify(combined)
  if (key === lastCapture) return
  lastCapture = key
  ipcRenderer.sendToHost('media-capture', combined)
}

// ── Back / forward like Chrome ──
// ⌘← / ⌘→ (macOS) and Alt+← / Alt+→ (Windows/Linux), but only when not typing in a field and
// the page didn't handle the key itself. Listening on window (bubble phase) runs after the
// page's own handlers. Mouse side buttons (3 = back, 4 = forward) too.
const IS_MAC = process.platform === 'darwin'
const NON_TEXT_INPUTS = new Set([
  'button',
  'checkbox',
  'radio',
  'submit',
  'reset',
  'range',
  'color',
  'file',
  'image'
])

function isEditable(el: Element | null): boolean {
  if (!el) return false
  if ((el as HTMLElement).isContentEditable) return true
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type)
  return false
}

const MOD_KEY = IS_MAC ? 'Meta' : 'Control'

window.addEventListener('keydown', (e) => {
  // Holding ⌘ / Ctrl shows the tab shortcut hints in the sidebar
  if (e.key === MOD_KEY) {
    if (!e.repeat) ipcRenderer.sendToHost('silo:modifier', true)
    return
  }
  if (IS_MAC ? e.metaKey : e.ctrlKey) ipcRenderer.sendToHost('silo:modifier', false)

  if (e.defaultPrevented || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  const navChord = IS_MAC
    ? e.metaKey && !e.altKey && !e.ctrlKey
    : e.altKey && !e.ctrlKey && !e.metaKey
  if (!navChord || isEditable(document.activeElement)) return
  e.preventDefault()
  ipcRenderer.sendToHost('silo:nav', e.key === 'ArrowLeft' ? 'back' : 'forward')
})

window.addEventListener('keyup', (e) => {
  if (e.key === MOD_KEY) ipcRenderer.sendToHost('silo:modifier', false)
})

window.addEventListener('blur', () => ipcRenderer.sendToHost('silo:modifier', false))

window.addEventListener('mouseup', (e) => {
  if (e.button !== 3 && e.button !== 4) return
  e.preventDefault()
  ipcRenderer.sendToHost('silo:nav', e.button === 3 ? 'back' : 'forward')
})

// Ctrl+scroll (and trackpad pinch) zoom — relay to parent renderer
let _lastZoomTime = 0
document.addEventListener(
  'wheel',
  (e) => {
    if (e.ctrlKey) {
      e.preventDefault()
      const now = Date.now()
      if (now - _lastZoomTime < 100) return
      _lastZoomTime = now
      ipcRenderer.sendToHost('zoom-change', e.deltaY < 0 ? 'in' : 'out')
    }
  },
  { passive: false }
)

// Lock focus/alert/confirm/prompt/open against reassignment by web content
for (const name of ['focus', 'alert', 'confirm', 'prompt', 'open'] as const) {
  const current = window[name]
  Object.defineProperty(window, name, {
    get: () => current,
    set: () => {},
    configurable: false
  })
}

const INTERNAL_RE = /^(https?:\/\/|javascript:|#|about:|chrome:|data:|blob:)/i

function isExternal(url: string): boolean {
  return !!url && !INTERNAL_RE.test(url)
}

function findAnchor(el: HTMLElement | null): HTMLAnchorElement | null {
  while (el && el.tagName !== 'A') el = el.parentElement
  return el as HTMLAnchorElement | null
}

// Dedup — mousedown + click may both fire for the same link
let lastUrl = ''
let lastTime = 0
function openExternal(url: string): void {
  const now = Date.now()
  if (url === lastUrl && now - lastTime < 2000) return
  lastUrl = url
  lastTime = now
  ipcRenderer.send('silo:open-external-protocol', url)
}

// mousedown fires before Chromium processes protocol links.
// Strip the href so Chromium has nothing to navigate, then restore it.
document.addEventListener(
  'mousedown',
  (e) => {
    if (e.button !== 0) return
    const a = findAnchor(e.target as HTMLElement)
    if (!a?.href || !isExternal(a.href)) return
    const url = a.href
    const orig = a.getAttribute('href')
    a.removeAttribute('href')
    setTimeout(() => {
      if (orig) a.setAttribute('href', orig)
    }, 200)
    openExternal(url)
  },
  true
)

// click backup — may not fire for protocol links in isolated world,
// but covers edge cases where it does
document.addEventListener(
  'click',
  (e) => {
    const a = findAnchor(e.target as HTMLElement)
    if (!a?.href || !isExternal(a.href)) return
    e.preventDefault()
    e.stopPropagation()
    e.stopImmediatePropagation()
    openExternal(a.href)
  },
  true
)

// Watch for hidden iframes with protocol src (Teams, Zoom use this pattern)
const obs = new MutationObserver((mutations) => {
  for (const { addedNodes } of mutations) {
    for (const node of addedNodes) {
      if (
        node instanceof HTMLIFrameElement &&
        node.src &&
        isExternal(node.src)
      ) {
        openExternal(node.src)
        node.src = ''
      }
    }
  }
})
if (document.documentElement) {
  obs.observe(document.documentElement, { childList: true, subtree: true })
}
