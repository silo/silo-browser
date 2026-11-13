import { isMac } from './platform'

/**
 * Keyboard shortcuts as Electron accelerator strings ("Control+Alt+G").
 * Custom tab shortcuts are stored in this form and registered as hidden menu items by the
 * main process, so they also fire while a page has focus.
 */

const MODIFIER_ORDER = ['Command', 'Control', 'Alt', 'Shift'] as const
type Modifier = (typeof MODIFIER_ORDER)[number]

const MODIFIER_ALIASES: Record<string, Modifier> = {
  command: 'Command',
  cmd: 'Command',
  meta: 'Command',
  super: 'Command',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'Alt',
  shift: 'Shift',
  cmdorctrl: isMac ? 'Command' : 'Control',
  commandorcontrol: isMac ? 'Command' : 'Control'
}

/** Canonical form ("Command+Shift+T") so two spellings of one shortcut compare equal. */
export function normalizeAccelerator(acc: string): string {
  const parts = acc.split('+').filter(Boolean)
  const mods = new Set<Modifier>()
  let key = ''
  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()]
    if (mod) mods.add(mod)
    else key = part.length === 1 ? part.toUpperCase() : part
  }
  return [...MODIFIER_ORDER.filter((m) => mods.has(m)), key].join('+')
}

// KeyboardEvent.code → accelerator key. Uses the physical key, so ⌥G stays "G" on layouts
// where Option+G types a symbol.
function keyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (/^Numpad[0-9]$/.test(code)) return `num${code.slice(6)}`
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backquote: '`',
    Space: 'Space',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown'
  }
  return map[code] ?? null
}

const MODIFIER_CODES = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'CapsLock',
  'Fn'
])

export type RecordResult =
  | { kind: 'pending' } // only modifiers so far
  | { kind: 'invalid'; message: string }
  | { kind: 'ok'; accelerator: string }

/** Turns a keydown into an accelerator, or explains why it can't be used. */
export function acceleratorFromEvent(e: KeyboardEvent): RecordResult {
  if (MODIFIER_CODES.has(e.code)) return { kind: 'pending' }
  const key = keyFromCode(e.code)
  if (!key) return { kind: 'invalid', message: 'That key can’t be used in a shortcut' }
  if (!isMac && e.metaKey) return { kind: 'invalid', message: 'The Windows key can’t be used' }
  const mods: Modifier[] = []
  if (isMac && e.metaKey) mods.push('Command')
  if (e.ctrlKey) mods.push('Control')
  if (e.altKey) mods.push('Alt')
  if (e.shiftKey) mods.push('Shift')
  // macOS: ⌥ (+⇧) alone types characters (⌥L is @ on a German layout), so it can't be a
  // shortcut on its own. Windows/Linux: Alt+key doesn't type (AltGr is Ctrl+Alt, warned about).
  const hasMainModifier = isMac
    ? mods.includes('Command') || mods.includes('Control')
    : mods.some((m) => m !== 'Shift')
  if (!hasMainModifier) {
    return {
      kind: 'invalid',
      message: isMac ? 'Include ⌘ or ⌃ — ⌥ alone types characters' : 'Include Ctrl or Alt'
    }
  }
  return { kind: 'ok', accelerator: normalizeAccelerator([...mods, key].join('+')) }
}

const KEY_LABELS: Record<string, string> = isMac
  ? { Up: '↑', Down: '↓', Left: '←', Right: '→', Space: 'Space', PageUp: 'PgUp', PageDown: 'PgDn' }
  : { Up: '↑', Down: '↓', Left: '←', Right: '→', PageUp: 'PgUp', PageDown: 'PgDn' }

/** "⌃⌥G" on macOS, "Ctrl+Alt+G" elsewhere. */
export function formatAccelerator(acc: string): string {
  const parts = normalizeAccelerator(acc).split('+')
  const key = parts.pop() ?? ''
  const mods = new Set(parts)
  let label = KEY_LABELS[key] ?? key
  if (label.startsWith('num')) label = `Num ${label.slice(3)}`
  if (isMac) {
    // Apple's order: ⌃ ⌥ ⇧ ⌘
    const sym =
      (mods.has('Control') ? '⌃' : '') +
      (mods.has('Alt') ? '⌥' : '') +
      (mods.has('Shift') ? '⇧' : '') +
      (mods.has('Command') ? '⌘' : '')
    return sym + label
  }
  const names = [
    mods.has('Control') ? 'Ctrl' : '',
    mods.has('Alt') ? 'Alt' : '',
    mods.has('Shift') ? 'Shift' : ''
  ].filter(Boolean)
  return [...names, label].join('+')
}

/** Windows/Linux: Ctrl+Alt is AltGr on many keyboard layouts (€, @, [ …). */
export function isAltGrRisk(acc: string): boolean {
  if (isMac) return false
  const n = normalizeAccelerator(acc)
  return n.includes('Control') && n.includes('Alt')
}

// Shortcuts Silo itself uses. Keep in sync with the app menu in src/main/index.ts and the
// keydown handler in App.vue.
function buildReserved(): Map<string, string> {
  const m = isMac ? 'Command' : 'Control'
  const entries: [string, string][] = [
    [`${m}+T`, 'New tab'],
    [`${m}+Shift+T`, 'Reopen closed tab'],
    [`${m}+Shift+N`, 'Add tab to sidebar'],
    [`${m}+N`, 'New silo'],
    [`${m}+W`, 'Close tab'],
    [`${m}+L`, 'Address & search'],
    [`${m}+F`, 'Find in page'],
    [`${m}+G`, 'Find next'],
    [`${m}+Shift+G`, 'Find previous'],
    [`${m}+R`, 'Reload'],
    [`${m}+Shift+R`, 'Hard reload'],
    [`${m}+P`, 'Print'],
    [`${m}+.`, 'Stop loading'],
    [`${m}+,`, 'Settings'],
    [`${m}+[`, 'Toggle sidebar'],
    [`${m}+]`, 'Toggle sidebar'],
    [`${m}+=`, 'Zoom in'],
    [`${m}+Shift+=`, 'Zoom in'],
    [`${m}+-`, 'Zoom out'],
    [`${m}+0`, 'Actual size'],
    [`Control+Tab`, 'Next tab'],
    [`Control+Shift+Tab`, 'Previous tab'],
    [`${m}+A`, 'Select all'],
    [`${m}+C`, 'Copy'],
    [`${m}+V`, 'Paste'],
    [`${m}+Shift+V`, 'Paste and match style'],
    [`${m}+X`, 'Cut'],
    [`${m}+Z`, 'Undo'],
    [`${m}+Shift+Z`, 'Redo']
  ]
  for (let i = 1; i <= 9; i++) {
    entries.push([`${m}+${i}`, `Go to tab ${i}`])
    entries.push([`${isMac ? 'Control' : 'Alt'}+${i}`, `Go to silo ${i}`])
  }
  if (isMac) {
    entries.push(
      ['Command+Alt+Right', 'Next tab'],
      ['Command+Alt+Left', 'Previous tab'],
      ['Command+Shift+]', 'Next tab'],
      ['Command+Shift+[', 'Previous tab'],
      ['Command+Left', 'Back'],
      ['Command+Right', 'Forward'],
      ['Command+Alt+I', 'Developer tools'],
      ['Command+Alt+Shift+I', 'Silo developer tools'],
      ['Command+Q', 'Quit'],
      ['Command+H', 'Hide Silo'],
      ['Command+Alt+H', 'Hide others'],
      ['Command+M', 'Minimize'],
      ['Command+Control+F', 'Full screen']
    )
  } else {
    entries.push(
      ['Control+PageDown', 'Next tab'],
      ['Control+PageUp', 'Previous tab'],
      ['Alt+Left', 'Back'],
      ['Alt+Right', 'Forward'],
      ['Control+Shift+I', 'Developer tools'],
      ['Control+Alt+Shift+I', 'Silo developer tools'],
      ['Control+Y', 'Redo'],
      ['Control+F5', 'Hard reload'],
      ['Shift+F5', 'Hard reload']
    )
  }
  return new Map(entries.map(([acc, label]) => [normalizeAccelerator(acc), label]))
}

const RESERVED = buildReserved()

/** The built-in action using this shortcut, if any. */
export function reservedLabel(acc: string): string | null {
  return RESERVED.get(normalizeAccelerator(acc)) ?? null
}
