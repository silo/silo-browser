import { nativeTheme } from 'electron'
import { getCachedState, saveState } from './store'

// Permissions granted by the user at runtime ("origin::permission" entries),
// persisted to the config file. Held as a Set in memory for O(1) lookup in the
// permission request handler.
export const grantedPermissions = new Set<string>()

export function loadGrantedPermissions(): void {
  grantedPermissions.clear()
  const state = getCachedState()
  for (const entry of state.grantedPermissions) {
    grantedPermissions.add(entry)
  }
}

export function persistGrantedPermission(key: string): void {
  grantedPermissions.add(key)
  saveState({ grantedPermissions: [...grantedPermissions] })
}

// Re-syncs main-process caches that derive from PersistedState. Call after the
// on-disk config is replaced wholesale (e.g. after adopting a sync folder's
// existing config), since these caches are otherwise only populated at startup.
export function refreshCachesFromState(): void {
  const state = getCachedState()
  nativeTheme.themeSource = state.themeMode as 'dark' | 'light' | 'system'
  loadGrantedPermissions()
}
