export const isMac = window.api.platform === 'darwin'

/** "⌘L" on macOS, "Ctrl+L" elsewhere. */
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}

/** "⌥↵" on macOS, "Alt+↵" elsewhere. */
export function altShortcut(key: string): string {
  return isMac ? `⌥${key}` : `Alt+${key}`
}

/** Width reserved for the macOS traffic lights (positioned at x=16, y=16 in main/index.ts). */
export const TRAFFIC_LIGHT_INSET = 84
