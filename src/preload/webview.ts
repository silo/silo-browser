import { ipcRenderer } from 'electron'

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
})

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
