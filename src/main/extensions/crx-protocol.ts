import { net, session as electronSession } from 'electron'
import { join } from 'path'
import type { ChromeManifest } from './compatibility'

/**
 * Serve `crx://extension-icon/<id>/<size>/<grayed>?partition=<p>` requests in
 * the **main** session by forwarding to whichever group session actually has
 * the extension loaded.
 *
 * Background: the `<browser-action-list>` element is rendered inside Silo's
 * renderer chrome (main session). Its `<img src="crx://…">` icons therefore
 * resolve against the main session's protocol handler. If we load extensions
 * only in per-group sessions (which we do, to isolate them from Silo's UI),
 * the main session's regular crx:// handler can't find them. This routes by
 * the `partition` query parameter the element already includes in the URL.
 */
export function registerSmartCrxProtocolOnMainSession(): void {
  const main = electronSession.defaultSession
  // Tolerate being called twice — overrides the previous handler.
  try {
    main.protocol.unhandle('crx')
  } catch {
    // No previous handler — fine.
  }
  main.protocol.handle('crx', async (request) => {
    const url = new URL(request.url)
    if (url.hostname !== 'extension-icon') {
      return new Response(null, { status: 404 })
    }
    const partition = url.searchParams.get('partition')
    if (!partition) return new Response(null, { status: 404 })

    const parts = url.pathname.split('/').filter(Boolean)
    const extensionId = parts[0]
    const requestedSize = Number.parseInt(parts[1] || '32', 10)
    if (!extensionId) return new Response(null, { status: 404 })

    const groupSession = electronSession.fromPartition(partition)
    const extension = groupSession.extensions.getExtension(extensionId)
    if (!extension) return new Response(null, { status: 404 })

    const iconPath = pickIconPath(extension.manifest as ChromeManifest, requestedSize)
    if (!iconPath) return new Response(null, { status: 404 })

    return net.fetch(`file://${join(extension.path, iconPath)}`)
  })
}

/** Pick the smallest icon that's ≥ requestedSize, falling back to the largest. */
function pickIconPath(manifest: ChromeManifest, requestedSize: number): string | null {
  const sources: Array<Record<string, string> | undefined> = [
    manifest.icons,
    asMap(manifest.action?.default_icon),
    asMap(manifest.browser_action?.default_icon)
  ]
  for (const map of sources) {
    if (!map) continue
    const sizes = Object.keys(map)
      .map((k) => Number.parseInt(k, 10))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b)
    if (sizes.length === 0) continue
    const best = sizes.find((s) => s >= requestedSize) ?? sizes[sizes.length - 1]
    return map[best.toString()] ?? null
  }
  return null
}

function asMap(value: string | Record<string, string> | undefined): Record<string, string> | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return { '16': value }
  return value
}
