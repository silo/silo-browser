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
