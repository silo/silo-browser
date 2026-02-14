import { app, shell, BrowserWindow, Menu, MenuItem, clipboard } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerIpcHandlers } from './ipc-handlers'
import { getCachedState } from './store'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    show: false,
    autoHideMenuBar: true,
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

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
