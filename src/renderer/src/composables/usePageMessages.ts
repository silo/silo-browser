import { useUiStore } from '@renderer/stores/ui'
import type { MediaCapture } from '@renderer/types'
import type { WebviewTag } from './useWebviewRegistry'

/** Back / forward in a webview when it has history that way (canGoBack throws before dom-ready). */
export function navigateWebview(wv: WebviewTag | null, direction: unknown): void {
  if (!wv) return
  try {
    if (direction === 'back' && wv.canGoBack()) wv.goBack()
    else if (direction === 'forward' && wv.canGoForward()) wv.goForward()
  } catch {
    // not ready yet
  }
}

/**
 * Messages from the webview preload (src/preload/webview.ts) that main and pop-up tabs handle
 * the same way: camera / mic / screen use, back / forward keys, and ⌘ held for the shortcut
 * hints. Returns a handler for the `ipc-message` channel + args.
 */
export function usePageMessages(
  webview: () => WebviewTag | null,
  setCapture: (capture: MediaCapture | undefined) => void
): (channel: string, args: unknown[]) => void {
  const uiStore = useUiStore()
  return (channel, args) => {
    if (channel === 'media-capture') {
      // See src/preload/media-capture.ts
      const c = (args?.[0] ?? {}) as Partial<MediaCapture>
      const capture = { camera: !!c.camera, mic: !!c.mic, screen: !!c.screen }
      setCapture(capture.camera || capture.mic || capture.screen ? capture : undefined)
    } else if (channel === 'silo:nav') {
      // ⌘← / ⌘→, Alt+← / Alt+→ or a mouse side button inside the page
      navigateWebview(webview(), args?.[0])
    } else if (channel === 'silo:modifier') {
      uiStore.setModifierDown(args?.[0] === true)
    }
  }
}
