import { ipcRenderer } from 'electron'

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
