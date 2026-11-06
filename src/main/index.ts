import {
  app,
  shell,
  BrowserWindow,
  Menu,
  MenuItem,
  clipboard,
  desktopCapturer,
  nativeTheme,
  ipcMain,
  webContents,
  webFrameMain
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './updater'
import { getCachedState, loadState, saveState, LIGHT_SHADE_HEX, DARK_SHADE_HEX } from './store'
import icon from '../../resources/icon.png?asset'

function createWindow(): BrowserWindow {
  const state = getCachedState()
  // nativeTheme.themeSource is set from the saved theme before the window is created,
  // so shouldUseDarkColors already reflects light / dark / system.
  const isDark = nativeTheme.shouldUseDarkColors
  const bgColor = isDark
    ? (DARK_SHADE_HEX[state.darkShade] ?? DARK_SHADE_HEX.pitch)
    : (LIGHT_SHADE_HEX[state.lightShade] ?? LIGHT_SHADE_HEX.stone)

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: bgColor,
    // Frameless on every platform: the app draws its own 44px title row.
    // macOS keeps the traffic lights; Windows/Linux get the OS window-controls overlay.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : {
          titleBarOverlay: {
            color: bgColor,
            symbolColor: isDark ? '#F3F2F0' : '#1A1917',
            height: 44
          }
        }),
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webviewTag: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// Permissions that require explicit user consent
const promptPermissions = new Set([
  'media',
  'geolocation',
  'notifications',
  'display-capture',
  'midi',
  'midiSysex'
])

// Permissions granted automatically (low-risk)
const autoGrantPermissions = new Set([
  'mediaKeySystem',
  'clipboard-read',
  'clipboard-sanitized-write',
  'accessibility-events',
  'window-management',
  'local-fonts',
  'speaker-selection',
  'screen-wake-lock',
  'idle-detection'
])

// Track sessions that already have permission handlers
const handledSessions = new WeakSet<Electron.Session>()

// Global set of user-granted permissions ("origin::permission"), persisted to disk
const grantedPermissions = new Set<string>()

function loadGrantedPermissions(): void {
  const state = getCachedState()
  for (const entry of state.grantedPermissions) {
    grantedPermissions.add(entry)
  }
}

function persistGrantedPermission(key: string): void {
  grantedPermissions.add(key)
  saveState({ grantedPermissions: [...grantedPermissions] })
}

// Pending permission request callbacks waiting for user response
let permissionRequestId = 0
const pendingPermissionCallbacks = new Map<number, (granted: boolean) => void>()

ipcMain.on(
  'permission:response',
  (_event, { requestId, granted }: { requestId: number; granted: boolean }) => {
    const callback = pendingPermissionCallbacks.get(requestId)
    if (callback) {
      callback(granted)
      pendingPermissionCallbacks.delete(requestId)
    }
  }
)

// ── Screen sharing (getDisplayMedia) ────────────────────────────────────────
// On macOS 15+ the native system picker is used and the handler below is never
// called. Elsewhere (Windows, Linux, older macOS) we list sources with
// desktopCapturer and let the user choose one in Silo's picker dialog.
let displayMediaPickId = 0
const pendingDisplayMediaPicks = new Map<number, (sourceId: string | null) => void>()

ipcMain.on(
  'display-media:response',
  (_event, { requestId, sourceId }: { requestId: number; sourceId: string | null }) => {
    const resolve = pendingDisplayMediaPicks.get(requestId)
    if (resolve) {
      pendingDisplayMediaPicks.delete(requestId)
      resolve(typeof sourceId === 'string' ? sourceId : null)
    }
  }
)

async function pickDisplayMediaSource(
  origin: string
): Promise<Electron.DesktopCapturerSource | null> {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 }
  })
  if (sources.length === 0) return null
  // Linux/Wayland: the desktop portal already let the user pick exactly one source
  if (sources.length === 1) return sources[0]

  const win = BrowserWindow.getAllWindows()[0]
  if (!win) return null

  const requestId = ++displayMediaPickId
  const chosenId = await new Promise<string | null>((resolve) => {
    pendingDisplayMediaPicks.set(requestId, resolve)
    win.webContents.send('display-media:pick', {
      requestId,
      origin,
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        thumbnail: s.thumbnail.toDataURL(),
        isScreen: s.id.startsWith('screen:')
      }))
    })
  })
  // Only accept an id we offered
  return sources.find((s) => s.id === chosenId) ?? null
}

function setupPermissionHandlers(ses: Electron.Session): void {
  if (handledSessions.has(ses)) return
  handledSessions.add(ses)

  ses.setDisplayMediaRequestHandler(
    (request, callback) => {
      pickDisplayMediaSource(request.securityOrigin)
        .then((source) => {
          if (!source) return callback(null)
          // System audio capture is only supported on Windows
          const audio =
            request.audioRequested && process.platform === 'win32' ? 'loopback' : undefined
          callback(audio ? { video: source, audio } : { video: source })
        })
        .catch(() => callback(null))
    },
    { useSystemPicker: true }
  )

  // Strip Electron/app identifiers from this session's user agent so sites
  // (especially Google sign-in) see a standard Chrome UA.
  ses.setUserAgent(
    ses
      .getUserAgent()
      .replace(/\s+Electron\/\S+/, '')
      .replace(/\s+silo-browser\/\S+/i, '')
  )

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    if (autoGrantPermissions.has(permission)) {
      callback(true)
      return
    }

    if (!promptPermissions.has(permission)) {
      callback(false)
      return
    }

    // Ask the user via renderer UI
    let origin = ''
    try {
      origin = new URL(webContents.getURL()).origin
    } catch {
      origin = webContents.getURL()
    }

    // If already granted for this origin+permission, allow immediately
    const key = `${origin}::${permission}`
    if (grantedPermissions.has(key)) {
      callback(true)
      return
    }

    const requestId = ++permissionRequestId
    pendingPermissionCallbacks.set(requestId, (granted) => {
      if (granted) {
        persistGrantedPermission(key)
      }
      callback(granted)
    })

    const win = BrowserWindow.getFocusedWindow()
    if (win) {
      win.webContents.send('permission:request', { requestId, permission, origin })
    } else {
      pendingPermissionCallbacks.delete(requestId)
      callback(false)
    }
  })

  ses.setPermissionCheckHandler((_webContents, permission) => {
    // Allow check to pass for auto-granted and promptable permissions so websites
    // proceed to the actual request (where our prompt banner handles grant/deny).
    // Electron's check handler only returns boolean — no "prompt" state — so
    // returning false here makes sites think permissions are permanently blocked.
    return autoGrantPermissions.has(permission) || promptPermissions.has(permission)
  })
}

// ── External protocol handling helpers ───────────────────────────────────────
// A URL is "external" if it isn't a standard web/internal scheme.
const INTERNAL_PROTOCOL_RE =
  /^(https?:\/\/|about:|chrome:|devtools:|file:|javascript:|data:|blob:)/i

function isExternalProtocol(url: string): boolean {
  return !!url && !INTERNAL_PROTOCOL_RE.test(url)
}

// Simple dedup — multiple layers may fire for the same protocol URL.
// Only one URL is ever "in flight" at a time, so a single slot suffices.
let lastExternalUrl = ''
let lastExternalTime = 0
function openExternalDedup(url: string): void {
  const now = Date.now()
  if (url === lastExternalUrl && now - lastExternalTime < 3000) return
  lastExternalUrl = url
  lastExternalTime = now
  shell.openExternal(url).catch(() => {})
}

// Webview preloads send protocol URLs here via ipcRenderer.send
ipcMain.on('silo:open-external-protocol', (_event, url: string) => {
  if (url && typeof url === 'string') openExternalDedup(url)
})

// Webview preloads override window.open() and route URLs here via IPC.
// This prevents Electron's internal popup handling from activating the
// parent BrowserWindow (which causes focus stealing from background).
ipcMain.on('silo:window-open', (_event, url: string) => {
  if (!url || typeof url !== 'string') return
  if (isExternalProtocol(url)) {
    openExternalDedup(url)
    return
  }
  const state = getCachedState()
  if (state.openLinksInNewTab) {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.webContents.send('webview-context:open-in-new-tab', url)
    }
  } else {
    shell.openExternal(url)
  }
})

// Notification click — bring window to foreground
ipcMain.on('silo:notification-click', (_event, tabId: string) => {
  if (!tabId || typeof tabId !== 'string') return
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.show()
    win.focus()
  }
})

// Script to inject into webview subframes (including cross-origin iframes) so
// that Notification clicks are routed back to Silo via postMessage → preload IPC.
const NOTIF_CLICK_SUBFRAME_SCRIPT = `
(() => {
  if (window.__siloNotifWrapped) return;
  const OrigNotif = window.Notification;
  if (!OrigNotif) return;
  const WrappedNotif = function(title, opts) {
    const n = new OrigNotif(title, opts);
    n.addEventListener('click', () => {
      try { window.top.postMessage({ type: '__silo_notification_click' }, '*'); } catch(e) {}
    });
    return n;
  };
  WrappedNotif.requestPermission = OrigNotif.requestPermission.bind(OrigNotif);
  Object.defineProperty(WrappedNotif, 'permission', { get: () => OrigNotif.permission });
  WrappedNotif.prototype = OrigNotif.prototype;
  window.Notification = WrappedNotif;
  window.__siloNotifWrapped = true;
})()
`

// Intercept webview context menus and new-window requests
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    // Set up permission handlers for this webview's session
    setupPermissionHandlers(contents.session)

    // Inject notification-click override into child frames (cross-origin iframes
    // like JSFiddle results) so Notification clicks can route back to Silo.
    contents.on('did-frame-finish-load', (_e, isMainFrame, processId, routingId) => {
      if (isMainFrame) return
      try {
        const frame = webFrameMain.fromId(processId, routingId)
        if (frame) frame.executeJavaScript(NOTIF_CLICK_SUBFRAME_SCRIPT).catch(() => {})
      } catch {}
    })

    // ── External protocol handling (mailto:, tel:, msteams://, zoommtg://, etc.) ──
    // Multiple redundant layers to catch protocol URLs and open them via the OS.

    // Layer 1: Electron-level navigation events
    contents.on('will-navigate', (event, url) => {
      if (isExternalProtocol(url)) {
        event.preventDefault()
        openExternalDedup(url)
      }
    })

    contents.setWindowOpenHandler(({ url }) => {
      if (isExternalProtocol(url)) {
        openExternalDedup(url)
        return { action: 'deny' }
      }
      // Allow Google OAuth popups so sign-in works inside webviews
      if (url.includes('accounts.google.com')) {
        return { action: 'allow' }
      }
      const state = getCachedState()
      if (state.openLinksInNewTab) {
        // Use getAllWindows()[0] instead of getFocusedWindow() so URLs are
        // still routed correctly when the window is in the background
        const win = BrowserWindow.getAllWindows()[0]
        if (win) {
          win.webContents.send('webview-context:open-in-new-tab', url)
        }
      } else {
        shell.openExternal(url)
      }
      return { action: 'deny' }
    })

    contents.on('context-menu', (_e, params) => {
      const menu = new Menu()

      if (params.linkURL) {
        const isProtocolLink = isExternalProtocol(params.linkURL)
        if (!isProtocolLink) {
          menu.append(
            new MenuItem({
              label: 'Open Link in New Tab',
              click: () => {
                const win = BrowserWindow.getFocusedWindow()
                if (win) {
                  win.webContents.send('webview-context:open-in-new-tab', params.linkURL)
                }
              }
            })
          )
        }
        menu.append(
          new MenuItem({
            label: isProtocolLink ? 'Open in App' : 'Open in Default Browser',
            click: () => {
              shell.openExternal(params.linkURL)
            }
          })
        )
        menu.append(
          new MenuItem({
            label: 'Copy Link Address',
            click: () => {
              clipboard.writeText(params.linkURL).catch(() => {})
            }
          })
        )
        menu.append(new MenuItem({ type: 'separator' }))
      }

      if (params.isEditable) {
        menu.append(new MenuItem({ role: 'undo' }))
        menu.append(new MenuItem({ role: 'redo' }))
        menu.append(new MenuItem({ type: 'separator' }))
        menu.append(new MenuItem({ role: 'cut' }))
        menu.append(new MenuItem({ role: 'copy' }))
        menu.append(new MenuItem({ role: 'paste' }))
        menu.append(new MenuItem({ role: 'selectAll' }))
      } else if (params.selectionText) {
        menu.append(new MenuItem({ role: 'copy' }))
      } else if (!params.linkURL) {
        menu.append(
          new MenuItem({
            label: 'Back',
            enabled: contents.navigationHistory.canGoBack(),
            click: () => contents.navigationHistory.goBack()
          })
        )
        menu.append(
          new MenuItem({
            label: 'Forward',
            enabled: contents.navigationHistory.canGoForward(),
            click: () => contents.navigationHistory.goForward()
          })
        )
        menu.append(
          new MenuItem({
            label: 'Reload',
            click: () => contents.reload()
          })
        )
      }

      const win = BrowserWindow.getFocusedWindow()
      if (win) {
        menu.popup({ window: win })
      }
    })
  }
})

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.silo-browser')

  app.setAboutPanelOptions({
    applicationName: 'Silo Browser',
    copyright: `Copyright \u00A9 ${new Date().getFullYear()} silo.dev`,
    website: 'https://silo.dev'
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Full default menu with Cmd+W overridden to close tab instead of window
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:new-tab')
          }
        },
        {
          label: 'New Silo',
          accelerator: 'CmdOrCtrl+N',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:new-group')
          }
        },
        {
          label: 'Open Location…',
          accelerator: 'CmdOrCtrl+L',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:command-bar')
          }
        },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:close-tab')
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:open-settings')
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        {
          label: 'Paste and Match Style',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: (): void => {
            const focused = webContents.getAllWebContents().find((wc) => wc.isFocused())
            if (focused) focused.pasteAndMatchStyle()
          }
        },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Find',
          accelerator: 'CmdOrCtrl+F',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:find')
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Reload Tab',
          accelerator: 'CmdOrCtrl+R',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:reload-tab')
          }
        },
        {
          label: 'Force Reload Tab',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:reload-tab')
          }
        },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        // Go to tab 1–9 — menu accelerators so they also work while a page has focus
        ...Array.from({ length: 9 }, (_, i) => ({
          label: `Go to Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          visible: false,
          click: (_item: Electron.MenuItem, win: Electron.BaseWindow | undefined): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:go-to-tab', i)
          }
        })),
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+=',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:zoom-in')
          }
        },
        {
          label: 'Zoom In (Plus)',
          accelerator: 'CmdOrCtrl+Shift+=',
          visible: false,
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:zoom-in')
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:zoom-out')
          }
        },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:zoom-reset')
          }
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: (): void => {
            shell.openExternal('https://silo.dev')
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  // Strip "Electron/X.X.X" and app name from the default User Agent so sites
  // like WhatsApp, which check for "Chrome 85+", see a normal Chrome UA.
  app.userAgentFallback = app.userAgentFallback
    .replace(/\s+Electron\/\S+/, '')
    .replace(/\s+silo-browser\/\S+/i, '')

  // Synchronous IPC so webview preloads can check if the window is focused
  // (used to suppress JS dialogs that would steal focus from background)
  ipcMain.on('silo:is-window-focused', (event) => {
    const win = BrowserWindow.getAllWindows()[0]
    event.returnValue = win ? win.isFocused() : false
  })

  loadState()
  loadGrantedPermissions()
  const initialState = getCachedState()
  nativeTheme.themeSource = initialState.themeMode as 'dark' | 'light' | 'system'
  registerIpcHandlers()
  const mainWindow = createWindow()
  setTimeout(() => initAutoUpdater(mainWindow), 3000)

  // ── FOCUS GUARD ──
  // Prevent the BrowserWindow from being shown/focused by Electron internals
  // when the app is in the background. We monkey-patch mainWindow.show() so
  // only the initial ready-to-show call goes through. Subsequent show() calls
  // while blurred are suppressed. The user can still switch to the app via
  // Cmd+Tab or clicking because macOS handles that at the window-server level,
  // bypassing BrowserWindow.show().
  let _appBlurred = false
  let _initialShowDone = false

  const _origShow = mainWindow.show.bind(mainWindow)
  mainWindow.show = function () {
    if (_initialShowDone && _appBlurred) {
      return
    }
    _initialShowDone = true
    _origShow()
  }

  mainWindow.on('blur', () => {
    _appBlurred = true
  })

  mainWindow.on('focus', () => {
    _appBlurred = false
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
