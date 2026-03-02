import {
  app,
  shell,
  BrowserWindow,
  Menu,
  MenuItem,
  clipboard,
  nativeTheme,
  ipcMain
} from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './updater'
import { getCachedState, loadState, saveState } from './store'
import icon from '../../resources/icon.png?asset'

function createWindow(): BrowserWindow {
  const state = getCachedState()
  const isLight =
    state.themeMode === 'light' ||
    (state.themeMode === 'system' && false) // system detection not available in main process, default dark
  const bgColor = isLight ? '#f9fafb' : '#141414'

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: bgColor,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
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

function setupPermissionHandlers(ses: Electron.Session): void {
  if (handledSessions.has(ses)) return
  handledSessions.add(ses)

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

// Intercept webview context menus and new-window requests
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
    // Set up permission handlers for this webview's session
    setupPermissionHandlers(contents.session)
    contents.setWindowOpenHandler(({ url }) => {
      const state = getCachedState()
      if (state.openLinksInNewTab) {
        const win = BrowserWindow.getFocusedWindow()
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
        menu.append(
          new MenuItem({
            label: 'Open in Default Browser',
            click: () => {
              shell.openExternal(params.linkURL)
            }
          })
        )
        menu.append(
          new MenuItem({
            label: 'Copy Link Address',
            click: () => {
              clipboard.writeText(params.linkURL)
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
            enabled: contents.canGoBack(),
            click: () => contents.goBack()
          })
        )
        menu.append(
          new MenuItem({
            label: 'Forward',
            enabled: contents.canGoForward(),
            click: () => contents.goForward()
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
    copyright: 'Copyright \u00A9 2025 silo.dev',
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
          label: 'New Group',
          accelerator: 'CmdOrCtrl+N',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:new-group')
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
    { role: 'editMenu' },
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
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
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

  loadState()
  loadGrantedPermissions()
  const initialState = getCachedState()
  nativeTheme.themeSource = initialState.themeMode as 'dark' | 'light' | 'system'
  registerIpcHandlers()
  const mainWindow = createWindow()
  setTimeout(() => initAutoUpdater(mainWindow), 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
