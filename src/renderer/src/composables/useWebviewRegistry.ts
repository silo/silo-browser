/** Alias so .vue files can name the type without tripping eslint's no-undef on `Electron` */
export type WebviewTag = Electron.WebviewTag

const mainWebviews = new Map<string, Electron.WebviewTag>()
const childWebviews = new Map<string, Electron.WebviewTag>()

export function useWebviewRegistry() {
  function registerMain(tabId: string, wv: Electron.WebviewTag): void {
    mainWebviews.set(tabId, wv)
  }

  function unregisterMain(tabId: string): void {
    mainWebviews.delete(tabId)
  }

  function registerChild(childTabId: string, wv: Electron.WebviewTag): void {
    childWebviews.set(childTabId, wv)
  }

  function unregisterChild(childTabId: string): void {
    childWebviews.delete(childTabId)
  }

  function getMain(tabId: string): Electron.WebviewTag | null {
    return mainWebviews.get(tabId) ?? null
  }

  function getChild(childTabId: string): Electron.WebviewTag | null {
    return childWebviews.get(childTabId) ?? null
  }

  /** Which tab owns a webContents (e.g. the page that called window.open). */
  function findByWebContentsId(
    webContentsId: number
  ): { kind: 'main'; tabId: string } | { kind: 'child'; childId: string } | null {
    const idOf = (wv: Electron.WebviewTag): number | null => {
      try {
        return wv.getWebContentsId()
      } catch {
        return null // not attached yet
      }
    }
    for (const [tabId, wv] of mainWebviews) {
      if (idOf(wv) === webContentsId) return { kind: 'main', tabId }
    }
    for (const [childId, wv] of childWebviews) {
      if (idOf(wv) === webContentsId) return { kind: 'child', childId }
    }
    return null
  }

  function getActive(
    activeTabId: string | null,
    activeChildTabId: string | null
  ): Electron.WebviewTag | null {
    if (activeChildTabId) return childWebviews.get(activeChildTabId) ?? null
    if (activeTabId) return mainWebviews.get(activeTabId) ?? null
    return null
  }

  return {
    registerMain,
    unregisterMain,
    registerChild,
    unregisterChild,
    getMain,
    getChild,
    getActive,
    findByWebContentsId
  }
}

/**
 * Gives a page keyboard focus, like Chrome does when you switch or add a tab, unless something in
 * the app chrome is using it: a dialog, menu or the command bar, or a text field (find bar,
 * settings).
 */
export function focusPage(wv: Electron.WebviewTag | null): void {
  if (!wv) return
  const el = document.activeElement
  if (el instanceof HTMLElement && el !== document.body && el !== wv) {
    if (el.closest('[role="dialog"], [role="menu"]')) return
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      el.isContentEditable
    ) {
      return
    }
  }
  // Coming from another page (e.g. ⌘2 pressed inside it): release it first. Otherwise Chromium
  // keeps sending keys to that page's (now hidden) webContents.
  if (el instanceof HTMLElement && el !== wv && el.tagName === 'WEBVIEW') el.blur()
  wv.focus()
}
