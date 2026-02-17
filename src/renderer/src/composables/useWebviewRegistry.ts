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
    getActive
  }
}
