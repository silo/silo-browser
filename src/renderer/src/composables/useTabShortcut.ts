import { computed, type ComputedRef } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { formatAccelerator } from '@renderer/utils/accelerator'
import { isMac, shortcut } from '@renderer/utils/platform'
import type { TabItem } from '@renderer/types'

export interface TabShortcutHint {
  /** "⌃⌥G" / "⌘3", or '' when the tab has no shortcut */
  label: string
  /** For aria-keyshortcuts, e.g. "Control+Alt+G" / "Meta+3" */
  aria: string
  custom: boolean
}

/**
 * The shortcut shown on a tab: its custom one if set, else its position in the current silo
 * (⌘1–8, ⌘9 for the last tab).
 */
export function useTabShortcut(tab: () => TabItem): ComputedRef<TabShortcutHint> {
  const groupsStore = useGroupsStore()
  return computed(() => {
    const t = tab()
    if (t.shortcut) {
      const aria = t.shortcut.replace('Command', 'Meta')
      return { label: formatAccelerator(t.shortcut), aria, custom: true }
    }
    const digit = groupsStore.positionDigits.get(t.id)
    if (!digit) return { label: '', aria: '', custom: false }
    return {
      label: shortcut(String(digit)),
      aria: `${isMac ? 'Meta' : 'Control'}+${digit}`,
      custom: false
    }
  })
}
