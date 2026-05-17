# CLAUDE.md — Silo Browser Development Guide

## Project Overview
Silo Browser is a cross-platform Electron desktop browser that organizes web apps into
session-isolated groups. Each group maintains its own cookies, localStorage, and session data
using Electron's `session.fromPartition()`.

## Tech Stack
- **Build tool**: electron-vite (https://electron-vite.org)
- **Package manager**: pnpm
- **Framework**: Vue 3 + TypeScript + Pinia
- **Styling**: Tailwind CSS v4 (using @tailwindcss/vite plugin)
- **Packaging**: electron-builder

## Architecture

### Three-Process Model
- `src/main/` — Electron main process. Manages window, IPC handlers, persistence.
- `src/preload/` — Preload script. Exposes `window.api` via contextBridge.
- `src/renderer/` — Vue 3 SPA. All UI components, Pinia stores, webview management.

### Session Isolation
Each group uses `persist:silo-group-{groupId}` as its Electron session partition.
The `<webview>` tag's `partition` attribute is set per-tab based on its parent group.
This gives each group fully isolated cookies, localStorage, IndexedDB, and cache.

### Data Flow
Renderer (Pinia) → IPC invoke → Main process (JSON file persistence) → disk.
State is loaded from disk on app startup. Changes are debounced (500ms) and saved via IPC.

### Webview Strategy
We use `<webview>` tags (not WebContentsView) in the renderer.
Webviews are created lazily (only when a tab is first clicked).
Once created, webviews stay in the DOM but are toggled visible/invisible to avoid reloads.
Each webview has a `data-tab-id` attribute for DOM queries from nav bar and shortcuts.

## Key Files
- `electron.vite.config.ts` — Unified Vite config (main + preload + renderer)
- `src/main/index.ts` — Main process entry, creates BrowserWindow with webviewTag: true
- `src/main/store.ts` — JSON file persistence for app state (groups, sidebar). Resolves config path from optional sync folder; all writes go through `atomicWriteJson` (write to unique tmp + rename) and `saveState` serializes through a promise chain so concurrent writes can't rename-clobber each other.
- `src/main/runtime-state.ts` — Main-process side caches that derive from `PersistedState` (granted permissions Set, `nativeTheme.themeSource`). `refreshCachesFromState()` is called after `setSyncFolderPath` to re-sync these when the on-disk config is replaced wholesale.
- `src/main/ipc-handlers.ts` — All IPC handler registrations (store, shell, dialog)
- `src/preload/index.ts` — contextBridge API (window.api)
- `src/preload/index.d.ts` — TypeScript declarations for SiloApi
- `src/renderer/src/stores/groups.ts` — Primary Pinia store (groups, tabs, CRUD, reorder, notifications)
- `src/renderer/src/stores/ui.ts` — UI state (sidebar, dialogs, context menu, settings)
- `src/renderer/src/stores/topbar-tabs.ts` — Runtime-only store for child/topbar tabs
- `src/renderer/src/types/index.ts` — Shared TypeScript interfaces
- `src/renderer/src/App.vue` — Root component with keyboard shortcuts
- `src/renderer/src/components/ContextMenu.vue` — Generic right-click context menu
- `src/renderer/src/components/content/WebviewContainer.vue` — Webview lifecycle + event tracking
- `src/renderer/src/components/content/TheNavigationBar.vue` — URL bar + back/forward/reload + topbar tabs
- `src/renderer/src/components/content/ChildWebviewContainer.vue` — Webview for child (topbar) tabs
- `src/renderer/src/components/sidebar/TheSidebar.vue` — Sidebar with settings gear icon
- `src/renderer/src/components/dialogs/` — AddGroup, AddTab, EditGroup, EditTab, Settings dialogs

## Commands
- `pnpm dev` — Start development with HMR
- `pnpm build` — Build for production
- `pnpm build:mac` — Package for macOS
- `pnpm build:win` — Package for Windows
- `pnpm build:linux` — Package for Linux

## Keyboard Shortcuts
- `Cmd/Ctrl+T` — Add new tab (to first group)
- `Cmd/Ctrl+N` — Create new group
- `Cmd/Ctrl+W` — Close active child tab (never closes primary sidebar tabs)
- `Cmd/Ctrl+R` — Reload active tab (child or main)
- `Cmd/Ctrl+L` — Focus URL bar
- `Cmd/Ctrl+[` or `]` — Toggle sidebar
- `Cmd/Ctrl+1-9` — Switch to Nth tab
- `Cmd/Ctrl+,` — Open settings
- `Escape` — Close context menu / settings

## IPC Channels
- `store:get-state` — Returns full AppState
- `store:save-groups` — Persists groups array
- `store:save-active-tab` — Persists activeTabId
- `store:save-groups-and-active-tab` — Batched save for groups + activeTabId
- `store:save-sidebar-state` — Persists sidebar expanded
- `store:save-open-links-in-new-tab` — Persists link opening behavior setting
- `store:clear-group-session` — Clears session data for a group partition
- `shell:open-external` — Opens URL in system browser
- `dialog:export-config` — Export config to JSON file
- `dialog:import-config` — Import config from JSON file
- `store:get-sync-folder` — Returns `{ path, accessible }` for the configured sync folder
- `dialog:configure-sync-folder` — Picks a folder, optionally adopts its existing config or overwrites it, and refreshes main-process caches
- `store:clear-sync-folder` — Stops syncing and writes current state back to local userData

## Conventions
- Component names: `TheSidebar.vue` for singletons, `SidebarGroup.vue` for reusable
- Pinia stores: Composition API style with `defineStore('name', () => {})`
- IPC channels prefixed: `store:`, `shell:`, `dialog:`
- UUID generation: `crypto.randomUUID()` (available in Electron's renderer)
- Tailwind only in renderer (not main/preload)
- Types shared via `src/renderer/src/types/index.ts`
- Context menus use `ContextMenuEntry` type and `uiStore.showContextMenu()`
- Drag-and-drop uses HTML5 drag API with JSON payloads `{ type: 'tab'|'group', id }`

## Important Notes
- The `<webview>` partition attribute MUST be set before first navigation
- `webviewTag: true` must be in BrowserWindow webPreferences or webviews silently fail
- Persistence runs ONLY in the main process; renderer accesses it via IPC
- Tab `isLoaded`, `notificationCount`, `currentUrl`, `currentTitle` are runtime-only state
- When deleting a group, call `session.fromPartition(partition).clearStorageData()`
- Groups support optional `userAgent` field for custom user agent per group
- macOS uses `titleBarStyle: 'hidden'` with traffic light spacer in sidebar
- Child/topbar tabs are runtime-only (not persisted); managed by `topbar-tabs` store
- Webview context menus are native Electron menus built in the main process via `app.on('web-contents-created')`
- `target=_blank` / `window.open()` links are handled via `setWindowOpenHandler` in main process (not deprecated `new-window` event)
- `openLinksInNewTab` setting (persisted) controls whether _blank links open as topbar tabs or in the system browser
- `app-drag` and `app-no-drag` CSS classes control macOS window dragging regions
- Cloud sync uses a two-file split: `silo-prefs.local.json` (always at userData, holds the sync folder pointer; never synced) and `silo-config.json` (at the sync folder if set, else userData). The pointer can't live inside the synced file because machines have different paths
- When the sync folder is set but currently inaccessible (drive unmounted, etc.), saves fall back to userData and the UI shows a "currently offline" warning. The setting itself is preserved so sync resumes automatically when the folder reappears
- `setSyncFolderPath` does all risky work (parse-validation for "use existing", or writing current state to the new location) BEFORE mutating module state — so a failure leaves the previous configuration intact with no rollback needed

## Remaining Features (not yet implemented)
- Split view (two tabs side by side)
