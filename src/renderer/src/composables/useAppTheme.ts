import { watchEffect } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useGroupsStore } from '@renderer/stores/groups'
import {
  accentTokens,
  darkShadeHex,
  isValidHex,
  lightShadeHex,
  mixHex,
  themeTokens,
  tintPercent
} from '@renderer/utils/theme'

/**
 * Applies the design tokens to <html> and keeps them in sync with the theme settings and the
 * active silo (whose color tints the window chrome). Call once, from App.vue.
 */
export function useAppTheme(): void {
  const uiStore = useUiStore()
  const groupsStore = useGroupsStore()
  const root = document.documentElement

  let lastChrome = ''

  watchEffect(() => {
    const dark = uiStore.effectiveTheme === 'dark'
    const base = dark ? darkShadeHex(uiStore.darkShade) : lightShadeHex(uiStore.lightShade)

    root.setAttribute('data-theme', dark ? 'dark' : 'light')
    root.style.colorScheme = dark ? 'dark' : 'light'

    const tokens = { ...themeTokens(dark, base), ...accentTokens(dark, uiStore.accentColor) }
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value)

    // Silo tint: the silo you're in colors the chrome — the active tab's silo, else the one
    // picked on the rail, else the first (e.g. a new silo with no tabs yet). The Welcome screen
    // previews the color being picked.
    const currentSilo =
      groupsStore.activeGroup ??
      (uiStore.railSiloId ? groupsStore.findGroup(uiStore.railSiloId) : null) ??
      groupsStore.sortedGroups[0] ??
      null
    const siloColor = uiStore.tintPreviewColor ?? currentSilo?.color ?? null
    const tint = siloColor && isValidHex(siloColor) ? tintPercent(dark, uiStore.siloTint) : null
    root.style.setProperty('--silo', tint ? siloColor! : base)
    root.style.setProperty('--tp', `${tint?.chrome ?? 0}%`)
    root.style.setProperty('--tr', `${tint?.rail ?? 0}%`)

    // Window background + Windows/Linux title bar overlay must match the chrome exactly
    const chrome = tint ? mixHex(siloColor!, tint.chrome, base) : base
    const key = `${chrome}|${dark}`
    if (key !== lastChrome) {
      lastChrome = key
      window.api.setChromeColors({ background: chrome, symbol: tokens['--fg1'] })
    }
  })
}
