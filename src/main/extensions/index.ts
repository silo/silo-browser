/**
 * Public surface of the extensions feature.
 *
 *   - `extensions` is the singleton that owns per-session wiring, tab tracking,
 *     and the chrome.contextMenus / chrome.windows.create adapters. Used by
 *     `src/main/index.ts` from inside the `web-contents-created` hook.
 *
 *   - The exported functions implement install / remove / enable / clear-data
 *     workflows. They're called from IPC handlers in `src/main/ipc-handlers.ts`.
 */

export { extensionsManager as extensions } from './manager'
export {
  INSTALL_CANCELLED,
  isCancellation,
  clearExtensionData,
  handleGroupDeleted,
  installFromUrl,
  installFromWebStore,
  installUnpacked,
  listExtensions,
  removeExtension,
  setActiveGroups,
  setExtensionEnabled
} from './installer'
