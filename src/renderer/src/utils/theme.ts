import type { AccentColor, DarkShade, LightShade, SiloTint } from '@renderer/types'

// Design tokens for the Silo UI (design canvas "C · Combined").
// Everything here is applied as CSS custom properties on <html> by useAppTheme().

export const LIGHT_SHADES: { id: LightShade; name: string; hex: string; note: string }[] = [
  { id: 'stone', name: 'Stone', hex: '#F6F4F0', note: 'Default · warm' },
  { id: 'paper', name: 'Paper', hex: '#F5F5F4', note: 'Neutral' },
  { id: 'snow', name: 'Snow', hex: '#FFFFFF', note: 'Pure white' },
  { id: 'cool', name: 'Cool', hex: '#F1F4F7', note: 'Slight blue-grey' },
  { id: 'sand', name: 'Sand', hex: '#F2ECE3', note: 'Warmer, softer' },
  { id: 'mist', name: 'Mist', hex: '#E7E7EA', note: 'Dimmer, less glare' }
]

// Keep hex values in sync with DARK_SHADE_HEX / LIGHT_SHADE_HEX in src/main/store.ts
export const DARK_SHADES: { id: DarkShade; name: string; hex: string; note: string }[] = [
  { id: 'pitch', name: 'Pitch black', hex: '#0A0A0B', note: 'Default · deepest' },
  { id: 'graphite', name: 'Graphite', hex: '#161616', note: 'Pure neutral' },
  { id: 'warm', name: 'Warm', hex: '#181513', note: 'Matches Stone' },
  { id: 'cool', name: 'Cool', hex: '#121519', note: 'Slight blue-grey' },
  { id: 'charcoal', name: 'Charcoal', hex: '#1E1E20', note: 'Softer, lower contrast' },
  { id: 'violet', name: 'Silo violet', hex: '#14121A', note: 'The logo black' }
]

/** swatch = the dot shown in Settings, fill = buttons/switches/pills */
export const ACCENTS: { id: AccentColor; name: string; swatch: string; fill: string }[] = [
  { id: 'black', name: 'Black', swatch: '#14121A', fill: '#14121A' },
  { id: 'blue', name: 'Blue', swatch: '#3B82F6', fill: '#2F6BEA' },
  { id: 'green', name: 'Green', swatch: '#22C55E', fill: '#187A47' },
  { id: 'teal', name: 'Teal', swatch: '#14B8A6', fill: '#0F766E' },
  { id: 'violet', name: 'Violet', swatch: '#8B5CF6', fill: '#6E3BCB' },
  { id: 'pink', name: 'Pink', swatch: '#EC4899', fill: '#BE185D' },
  { id: 'red', name: 'Red', swatch: '#EF4444', fill: '#D93036' },
  { id: 'orange', name: 'Orange', swatch: '#F97316', fill: '#C2410C' },
  { id: 'graphite', name: 'Graphite', swatch: '#8A8F9C', fill: '#5F6470' }
]

/** Colors offered for silos. Older silos may use other colors; those keep working. */
export const SILO_COLORS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#2F63D8' },
  { name: 'Green', hex: '#187A47' },
  { name: 'Violet', hex: '#6E3BCB' },
  { name: 'Teal', hex: '#0F766E' },
  { name: 'Rose', hex: '#BE185D' },
  { name: 'Orange', hex: '#C2410C' },
  { name: 'Amber', hex: '#A16207' },
  { name: 'Graphite', hex: '#4A4A52' }
]

export const TINTS: { id: SiloTint; name: string }[] = [
  { id: 'off', name: 'Off' },
  { id: 'subtle', name: 'Subtle' },
  { id: 'strong', name: 'Strong' }
]

/** How much of the active silo's color is mixed into the window chrome (percent). */
const CHROME_TINT: Record<'light' | 'dark', Record<SiloTint, number>> = {
  light: { off: 0, subtle: 7, strong: 15 },
  dark: { off: 0, subtle: 9, strong: 18 }
}
/** Same for the silo rail in the "rail + list" layout — a little stronger in light mode. */
const RAIL_TINT: Record<'light' | 'dark', Record<SiloTint, number>> = {
  light: { off: 0, subtle: 12, strong: 22 },
  dark: { off: 0, subtle: 9, strong: 18 }
}

export function tintPercent(dark: boolean, tint: SiloTint): { chrome: number; rail: number } {
  const mode = dark ? 'dark' : 'light'
  return { chrome: CHROME_TINT[mode][tint], rail: RAIL_TINT[mode][tint] }
}

// --- Color helpers ---

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Equivalent of CSS `color-mix(in srgb, top pct%, base)`. */
export function mixHex(top: string, pct: number, base: string): string {
  const a = parseHex(top)
  const b = parseHex(base)
  const t = pct / 100
  return (
    '#' +
    [0, 1, 2]
      .map((i) =>
        Math.round(a[i] * t + b[i] * (1 - t))
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
  )
}

export function isValidHex(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
}

// --- Token sets ---

export function lightShadeHex(id: LightShade): string {
  return (LIGHT_SHADES.find((s) => s.id === id) ?? LIGHT_SHADES[0]).hex
}

export function darkShadeHex(id: DarkShade): string {
  return (DARK_SHADES.find((s) => s.id === id) ?? DARK_SHADES[0]).hex
}

/** Base tokens for a theme + ground color. Values come straight from the design boards. */
export function themeTokens(dark: boolean, base: string): Record<string, string> {
  if (!dark) {
    return {
      '--base': base,
      '--rail-base': mixHex('#000000', 5, base),
      '--fg1': '#1A1917',
      '--fg2': '#45423D',
      '--fg3': '#68645D',
      '--line': 'rgba(0, 0, 0, 0.07)',
      '--hover': 'rgba(0, 0, 0, 0.045)',
      '--press': 'rgba(0, 0, 0, 0.08)',
      '--tab-on': '#FFFFFF',
      '--tab-on-shadow': '0 1px 2px rgba(0,0,0,.07), 0 0 0 1px rgba(0,0,0,.05)',
      '--omni': 'rgba(255, 255, 255, 0.8)',
      '--omni-line': 'rgba(0, 0, 0, 0.08)',
      '--page': '#FFFFFF',
      '--sk1': '#E4E3E7',
      '--sk2': '#EDEDF0',
      '--sk3': '#F5F5F7',
      '--card-shadow': '0 0 0 1px rgba(0,0,0,.05), 0 8px 24px rgba(0,0,0,.06)',
      '--card': '#FFFFFF',
      '--card-line': 'rgba(0, 0, 0, 0.07)',
      '--field': '#F4F2EE',
      '--field-line': 'rgba(0, 0, 0, 0.11)',
      '--input': '#FFFFFF',
      '--input-line': 'rgba(0, 0, 0, 0.13)',
      '--track': '#D6D2CB',
      '--row-line': 'rgba(0, 0, 0, 0.06)',
      '--panel': '#FFFFFF',
      '--scrim': 'rgba(26, 25, 23, 0.28)',
      '--sel': 'rgba(20, 18, 26, 0.06)',
      '--tip-bg': '#1A1917',
      '--tip-fg': '#F6F4F0',
      '--status-ink': '#68645D',
      '--badge': '#D93036',
      '--danger': '#C4262E',
      '--success': '#22A06B',
      '--dialog-shadow': '0 0 0 1px rgba(0,0,0,.07), 0 28px 70px rgba(0,0,0,.35)',
      '--menu-shadow': '0 0 0 1px rgba(0,0,0,.07), 0 12px 32px rgba(0,0,0,.16)'
    }
  }
  const m = (p: number): string => mixHex('#FFFFFF', p, base)
  return {
    '--base': base,
    '--rail-base': mixHex('#000000', 35, base),
    '--fg1': '#F3F2F0',
    '--fg2': '#C8C6C2',
    '--fg3': '#9E9B96',
    '--line': 'rgba(255, 255, 255, 0.08)',
    '--hover': 'rgba(255, 255, 255, 0.06)',
    '--press': 'rgba(255, 255, 255, 0.1)',
    '--tab-on': 'rgba(255, 255, 255, 0.09)',
    '--tab-on-shadow': 'inset 0 0 0 1px rgba(255,255,255,.05)',
    '--omni': 'rgba(255, 255, 255, 0.06)',
    '--omni-line': 'rgba(255, 255, 255, 0.09)',
    '--page': m(4),
    '--sk1': m(15),
    '--sk2': m(10),
    '--sk3': m(6),
    '--card-shadow': '0 0 0 1px rgba(255,255,255,.06), 0 10px 30px rgba(0,0,0,.45)',
    '--card': m(5),
    '--card-line': 'rgba(255, 255, 255, 0.07)',
    '--field': 'rgba(255, 255, 255, 0.05)',
    '--field-line': 'rgba(255, 255, 255, 0.11)',
    '--input': 'rgba(255, 255, 255, 0.05)',
    '--input-line': 'rgba(255, 255, 255, 0.12)',
    '--track': '#3C3C42',
    '--row-line': 'rgba(255, 255, 255, 0.06)',
    '--panel': m(6),
    '--scrim': 'rgba(0, 0, 0, 0.55)',
    '--sel': 'rgba(255, 255, 255, 0.08)',
    '--tip-bg': '#F3F2F0',
    '--tip-fg': '#1A1917',
    '--status-ink': '#68645D',
    '--badge': '#D93036',
    '--danger': '#F0565C',
    '--success': '#3CC489',
    '--dialog-shadow': '0 0 0 1px rgba(255,255,255,.08), 0 28px 70px rgba(0,0,0,.6)',
    '--menu-shadow': '0 0 0 1px rgba(255,255,255,.08), 0 12px 32px rgba(0,0,0,.5)'
  }
}

export function accentTokens(dark: boolean, id: AccentColor): Record<string, string> {
  const a = ACCENTS.find((x) => x.id === id) ?? ACCENTS[0]
  if (a.id === 'black') {
    return dark
      ? { '--accent': '#F3F2F0', '--on-accent': '#14121A', '--accent-txt': '#F3F2F0' }
      : { '--accent': '#14121A', '--on-accent': '#FFFFFF', '--accent-txt': '#14121A' }
  }
  return {
    '--accent': a.fill,
    '--on-accent': '#FFFFFF',
    // On dark grounds the brighter swatch reads better as text/icon color
    '--accent-txt': dark ? a.swatch : a.fill
  }
}
