import { app, shell, BrowserWindow, Menu, MenuItem, clipboard, nativeTheme } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { initAutoUpdater } from './updater'
import { getCachedState, loadState } from './store'
import icon from '../../resources/icon.png?asset'

function createWindow(): BrowserWindow {
  const state = getCachedState()
  const isLight =
    state.themeMode === 'light' ||
    (state.themeMode === 'system' && false) // system detection not available in main process, default dark
  const bgColor = isLight ? '#f9fafb' : '#111827'

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

// Intercept webview context menus and new-window requests
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') {
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

  // Custom menu to prevent Cmd+W from closing the window
  const menuTemplate: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
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
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_item, win): void => {
            if (win) (win as BrowserWindow).webContents.send('shortcut:close-tab')
          }
        }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate))

  loadState()
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
