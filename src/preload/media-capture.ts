/**
 * Camera / microphone / screen-share tracking for web pages.
 *
 * Electron has no event for "this page is capturing", so we wrap getUserMedia /
 * getDisplayMedia in the page's main world and watch the tracks they hand out. Whenever the
 * set of live tracks changes, the frame posts `{ type: '__silo_media_capture', frameId, state }`
 * to the top window, where the webview preload picks it up and tells the host.
 *
 * This function is serialized (`executeInMainWorld` / `toString()`), so it must not reference
 * anything outside its own body.
 */
export function installMediaCaptureTracking(postTo: 'self' | 'top'): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  if (w.__siloCaptureWrapped) return
  w.__siloCaptureWrapped = true

  const devices = w.MediaDevices && w.MediaDevices.prototype
  const trackProto = w.MediaStreamTrack && w.MediaStreamTrack.prototype
  if (!devices || !trackProto) return

  const frameId = Math.random().toString(36).slice(2)
  const live = new Map<MediaStreamTrack, 'user' | 'display'>()
  const idle = JSON.stringify({ camera: false, mic: false, screen: false })
  let lastSent = idle
  let timer: ReturnType<typeof setTimeout> | null = null

  function post(state: { camera: boolean; mic: boolean; screen: boolean }): void {
    try {
      const target = postTo === 'top' ? w.top : w
      target.postMessage({ type: '__silo_media_capture', frameId, state }, '*')
    } catch {
      // detached frame
    }
  }

  function flush(): void {
    timer = null
    const state = { camera: false, mic: false, screen: false }
    live.forEach((source, t) => {
      if (t.readyState !== 'live') {
        live.delete(t)
        return
      }
      if (source === 'display') state.screen = true
      else if (t.kind === 'video') state.camera = true
      else if (t.kind === 'audio') state.mic = true
    })
    const key = JSON.stringify(state)
    if (key === lastSent) return
    lastSent = key
    post(state)
  }

  function schedule(): void {
    if (!timer) timer = setTimeout(flush, 50)
  }

  function watchTrack(t: MediaStreamTrack, source: 'user' | 'display'): void {
    if (!t || live.has(t)) return
    live.set(t, source)
    t.addEventListener('ended', schedule)
    schedule()
  }

  function watchStream(stream: MediaStream, source: 'user' | 'display'): MediaStream {
    try {
      stream.getTracks().forEach((t) => watchTrack(t, source))
    } catch {
      // not a MediaStream
    }
    return stream
  }

  const origGetUserMedia = devices.getUserMedia
  if (typeof origGetUserMedia === 'function') {
    devices.getUserMedia = function (this: unknown, ...args: unknown[]) {
      return origGetUserMedia.apply(this, args).then((s: MediaStream) => watchStream(s, 'user'))
    }
  }

  const origGetDisplayMedia = devices.getDisplayMedia
  if (typeof origGetDisplayMedia === 'function') {
    devices.getDisplayMedia = function (this: unknown, ...args: unknown[]) {
      return origGetDisplayMedia
        .apply(this, args)
        .then((s: MediaStream) => watchStream(s, 'display'))
    }
  }

  // Legacy callback API, still used by a few older call widgets
  const navProto = w.Navigator && w.Navigator.prototype
  const origLegacy = navProto && navProto.webkitGetUserMedia
  if (typeof origLegacy === 'function') {
    navProto.webkitGetUserMedia = function (
      this: unknown,
      constraints: unknown,
      ok: (s: MediaStream) => void,
      fail: (e: unknown) => void
    ) {
      return origLegacy.call(
        this,
        constraints,
        (s: MediaStream) => {
          watchStream(s, 'user')
          if (ok) ok(s)
        },
        fail
      )
    }
  }

  const origStop = trackProto.stop
  trackProto.stop = function (this: MediaStreamTrack, ...args: unknown[]) {
    const result = origStop.apply(this, args)
    if (live.has(this)) schedule()
    return result
  }

  // Call apps clone tracks (e.g. for a self-view); a clone keeps the device in use
  const origClone = trackProto.clone
  trackProto.clone = function (this: MediaStreamTrack, ...args: unknown[]) {
    const copy = origClone.apply(this, args)
    const source = live.get(this)
    if (source) watchTrack(copy, source)
    return copy
  }

  w.addEventListener('pagehide', () => {
    if (lastSent !== idle) {
      lastSent = idle
      post({ camera: false, mic: false, screen: false })
    }
  })
}

/** Script text for frames the preload doesn't run in (cross-origin iframes). */
export const MEDIA_CAPTURE_SUBFRAME_SCRIPT = `(${installMediaCaptureTracking.toString()})('top')`
