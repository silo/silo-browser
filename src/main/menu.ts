import { app, shell, BrowserWindow, Menu, webContents } from 'electron'

/**
 * The application menu. Most of Silo's shortcuts are menu accelerators so they also work while
 * a page (webview) has focus; each item just forwards a `shortcut:*` message to the renderer.
 *
 * Keep the accelerators in sync with RESERVED in src/renderer/src/utils/accelerator.ts and
 * the shortcut list in SettingsPage.vue.
 */

export interface TabShortcut {
  tabId: string
  accelerator: string
}

const isMac = process.platform === 'darwin'
let tabShortcuts: TabShortcut[] = []

type MenuWin = Electron.BaseWindow | undefined

function send(win: MenuWin, channel: string, ...args: unknown[]): void {
  const target = (win as BrowserWindow | undefined) ?? BrowserWindow.getAllWindows()[0]
  target?.webContents.send(channel, ...args)
}

/** Sends a shortcut message to the main window (for handlers outside the menu). */
export function sendShortcut(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows()[0]?.webContents.send(channel, ...args)
}

function item(
  label: string,
  accelerator: string | undefined,
  channel: string,
  extra: Partial<Electron.MenuItemConstructorOptions> = {},
  ...args: unknown[]
): Electron.MenuItemConstructorOptions {
  return {
    label,
    accelerator,
    click: (_item, win): void => send(win, channel, ...args),
    ...extra
  }
}

const hidden = { visible: false }

// Accelerators are typed by users (custom tab shortcuts), so accept only the characters an
// Electron accelerator can contain.
const ACCELERATOR_RE = /^[A-Za-z0-9+\-=[\]\\;',./`]{1,48}$/

export function setTabShortcuts(list: unknown): void {
  if (!Array.isArray(list)) return
  tabShortcuts = list
    .filter(
      (s): s is TabShortcut =>
        !!s &&
        typeof s.tabId === 'string' &&
        s.tabId.length <= 100 &&
        typeof s.accelerator === 'string' &&
        s.accelerator.includes('+') &&
        ACCELERATOR_RE.test(s.accelerator)
    )
    .slice(0, 200)
  installAppMenu()
}

function buildTemplate(withTabShortcuts: boolean): Electron.MenuItemConstructorOptions[] {
  const mod = 'CmdOrCtrl'
  const siloMod = isMac ? 'Control' : 'Alt'
  return [
    ...(isMac
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
        // ⌘T: a new tab above the page (pop-up tab); ⇧⌘N: a new tab in the sidebar
        item('New Tab', `${mod}+T`, 'shortcut:new-tab'),
        item('Reopen Closed Tab', `${mod}+Shift+T`, 'shortcut:reopen-closed-tab'),
        item('Add Tab to Sidebar…', `${mod}+Shift+N`, 'shortcut:add-sidebar-tab'),
        item('New Silo', `${mod}+N`, 'shortcut:new-group'),
        item('Open Location…', `${mod}+L`, 'shortcut:command-bar'),
        { type: 'separator' },
        // Cmd+W closes a tab, not the window
        item('Close Tab', `${mod}+W`, 'shortcut:close-tab'),
        { type: 'separator' },
        item('Print…', `${mod}+P`, 'shortcut:print'),
        { type: 'separator' },
        item('Settings', `${mod}+,`, 'shortcut:open-settings')
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
          accelerator: `${mod}+Shift+V`,
          click: (): void => {
            const focused = webContents.getAllWebContents().find((wc) => wc.isFocused())
            if (focused) focused.pasteAndMatchStyle()
          }
        },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
        { type: 'separator' },
        item('Find', `${mod}+F`, 'shortcut:find'),
        item('Find Next', `${mod}+G`, 'shortcut:find-again', {}, 1),
        item('Find Previous', `${mod}+Shift+G`, 'shortcut:find-again', {}, -1),
        ...(isMac
          ? []
          : [
              item('Find Next (F3)', 'F3', 'shortcut:find-again', hidden, 1),
              item('Find Previous (Shift+F3)', 'Shift+F3', 'shortcut:find-again', hidden, -1)
            ])
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Reload Tab', `${mod}+R`, 'shortcut:reload-tab'),
        item('Force Reload Tab', `${mod}+Shift+R`, 'shortcut:hard-reload'),
        ...(isMac
          ? []
          : [
              item('Reload (F5)', 'F5', 'shortcut:reload-tab', hidden),
              item('Force Reload (Ctrl+F5)', 'Ctrl+F5', 'shortcut:hard-reload', hidden),
              item('Force Reload (Shift+F5)', 'Shift+F5', 'shortcut:hard-reload', hidden)
            ]),
        item('Stop Loading', `${mod}+.`, 'shortcut:stop-loading'),
        { type: 'separator' },
        item('Zoom In', `${mod}+=`, 'shortcut:zoom-in'),
        item('Zoom In (Plus)', `${mod}+Shift+=`, 'shortcut:zoom-in', hidden),
        item('Zoom Out', `${mod}+-`, 'shortcut:zoom-out'),
        item('Actual Size', `${mod}+0`, 'shortcut:zoom-reset'),
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        item('Developer Tools', isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I', 'shortcut:page-devtools'),
        {
          label: 'Silo Developer Tools',
          role: 'toggleDevTools',
          accelerator: isMac ? 'Alt+Command+Shift+I' : 'Ctrl+Shift+Alt+I'
        }
      ]
    },
    {
      label: 'Tab',
      submenu: [
        // Ctrl+Tab is caught in before-input-event (see handleTabCycleKey): an NSMenu key
        // equivalent for it isn't reliable on macOS. Shown here, not registered.
        item(
          'Select Next Tab',
          'Control+Tab',
          'shortcut:cycle-tab',
          { registerAccelerator: false },
          1
        ),
        item(
          'Select Previous Tab',
          'Control+Shift+Tab',
          'shortcut:cycle-tab',
          { registerAccelerator: false },
          -1
        ),
        ...(isMac
          ? [
              item('Next Tab (⌥⌘→)', 'Alt+Command+Right', 'shortcut:cycle-tab', hidden, 1),
              item('Previous Tab (⌥⌘←)', 'Alt+Command+Left', 'shortcut:cycle-tab', hidden, -1),
              item('Next Tab (⇧⌘])', 'Shift+Command+]', 'shortcut:cycle-tab', hidden, 1),
              item('Previous Tab (⇧⌘[)', 'Shift+Command+[', 'shortcut:cycle-tab', hidden, -1)
            ]
          : [
              item('Next Tab (Ctrl+PgDn)', 'Ctrl+PageDown', 'shortcut:cycle-tab', hidden, 1),
              item('Previous Tab (Ctrl+PgUp)', 'Ctrl+PageUp', 'shortcut:cycle-tab', hidden, -1)
            ]),
        { type: 'separator' },
        // ⌘1–8: Nth tab of the current silo, ⌘9: its last tab
        ...Array.from({ length: 9 }, (_, i) =>
          item(`Go to Tab ${i + 1}`, `${mod}+${i + 1}`, 'shortcut:go-to-tab', hidden, i)
        ),
        // ⌃1–9 (Alt+1–9 on Windows/Linux): Nth silo
        ...Array.from({ length: 9 }, (_, i) =>
          item(`Go to Silo ${i + 1}`, `${siloMod}+${i + 1}`, 'shortcut:go-to-silo', hidden, i)
        ),
        // Custom per-tab shortcuts (set in Edit tab / Settings)
        ...(withTabShortcuts
          ? tabShortcuts.map((s) =>
              item(`Tab ${s.tabId}`, s.accelerator, 'shortcut:activate-tab', hidden, s.tabId)
            )
          : [])
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
}

export function installAppMenu(): void {
  try {
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(true)))
  } catch (err) {
    // A bad custom accelerator must never cost the user the whole menu
    console.error('Failed to build menu with tab shortcuts:', err)
    Menu.setApplicationMenu(Menu.buildFromTemplate(buildTemplate(false)))
  }
}

/**
 * Ctrl+Tab / Ctrl+Shift+Tab → next / previous tab. Called from `before-input-event` of the
 * window and of every webview, so it works wherever focus is. Returns true if handled.
 */
export function handleTabCycleKey(input: Electron.Input): boolean {
  if (input.type !== 'keyDown' || input.key !== 'Tab') return false
  if (!input.control || input.meta || input.alt) return false
  sendShortcut('shortcut:cycle-tab', input.shift ? -1 : 1)
  return true
}
