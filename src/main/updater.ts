import { app, net, shell, BrowserWindow } from 'electron'
import { autoUpdater, UpdateInfo } from 'electron-updater'
import { appendFile, mkdir } from 'fs/promises'
import { join, dirname } from 'path'

const logPath = join(app.getPath('userData'), 'updater.log')
let mainWindow: BrowserWindow | null = null

// State: tracks where we are in the update lifecycle
let downloadedVersion: string | null = null
let installFailed = false
let fallbackDone = false

async function log(level: 'INFO' | 'ERROR', msg: string): Promise<void> {
  const line = `[${new Date().toISOString()}] [${level}] ${msg}\n`
  try {
    await mkdir(dirname(logPath), { recursive: true })
    await appendFile(logPath, line)
  } catch {}
  level === 'ERROR' ? console.error(`[updater] ${msg}`) : console.log(`[updater] ${msg}`)
}

function send(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function isNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return true
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return false
  }
  return false
}

// Fallback: check GitHub releases API directly when electron-updater fails entirely
async function fallbackCheck(): Promise<void> {
  if (fallbackDone) return
  fallbackDone = true

  log('INFO', 'Falling back to GitHub releases API')
  try {
    const res = await net.fetch(
      'https://api.github.com/repos/silo/silo-browser/releases/latest',
      { headers: { 'User-Agent': `SiloBrowser/${app.getVersion()}` } }
    )
    if (!res.ok) {
      log('ERROR', `GitHub API: ${res.status}`)
      return
    }
    const { tag_name } = (await res.json()) as { tag_name: string }
    const latest = tag_name.replace(/^v/, '')
    log('INFO', `GitHub: latest=${latest}, current=${app.getVersion()}`)

    if (isNewer(latest, app.getVersion())) {
      send('updater:fallback-available', latest)
    } else {
      send('updater:up-to-date')
    }
  } catch (e) {
    log('ERROR', `GitHub fallback: ${(e as Error).message}`)
  }
}

export function initAutoUpdater(win: BrowserWindow): void {
  mainWindow = win
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => log('INFO', 'Checking for update...'))

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    log('INFO', `Update available: v${info.version}`)
    autoUpdater.downloadUpdate().catch((e) => {
      log('ERROR', `Download failed: ${(e as Error).message}`)
      fallbackCheck()
    })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    log('INFO', `Up to date: v${info.version}`)
    send('updater:up-to-date')
  })

  autoUpdater.on('download-progress', (p) => {
    log('INFO', `Download: ${p.percent.toFixed(1)}%`)
  })

  // On macOS without code signing, a signature error fires ~500ms after download.
  // We delay the "Restart Now" dialog so the error handler can intercept it and
  // show the "Download from GitHub" fallback instead. With proper code signing,
  // no error fires and the dialog appears after the delay.
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    log('INFO', `Downloaded: v${info.version}`)
    downloadedVersion = info.version
    setTimeout(() => {
      if (!installFailed) send('updater:update-downloaded', info.version)
    }, 1500)
  })

  autoUpdater.on('error', (err: Error) => {
    log('ERROR', err.message)
    if (downloadedVersion) {
      // Error after download = install will fail (e.g. macOS code signature validation)
      installFailed = true
      send('updater:fallback-available', downloadedVersion)
    } else {
      fallbackCheck()
    }
  })

  checkForUpdates()
}

export function checkForUpdates(): void {
  downloadedVersion = null
  installFailed = false
  fallbackDone = false
  log('INFO', `Check starting (v${app.getVersion()})`)
  autoUpdater.checkForUpdates().catch((e) => {
    log('ERROR', `Check failed: ${(e as Error).message}`)
    fallbackCheck()
  })
}

export function quitAndInstall(): void {
  log('INFO', 'Quit and install')
  autoUpdater.quitAndInstall()
}

export function openReleasesPage(): void {
  shell.openExternal('https://github.com/silo/silo-browser/releases/latest')
}
