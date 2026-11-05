# CLAUDE.md — Silo Browser Development Guide

## Project Overview
Silo Browser is a cross-platform Electron desktop browser that organizes web apps into
session-isolated groups. Each group maintains its own cookies, localStorage, and session data
using Electron's `session.fromPartition()`.

## Tech Stack
- **Runtime**: Electron 45 (Chromium 156, Node 24) — see "Updating Electron & Dependencies"
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
- `src/main/store.ts` — JSON file persistence for app state (groups, sidebar)
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

## Release Process
1. Land changes on `main` (commit directly, or fast-forward a feature branch:
   `git push origin <branch>:main`).
2. Bump `version` in `package.json` in its own commit, with the message `vX.Y.Z` and no other changes.
3. Tag that commit `vX.Y.Z`, then push main and the tag: `git push origin main && git push origin vX.Y.Z`.
4. The tag triggers `.github/workflows/release.yml`. It builds macOS arm64 (signed + notarized),
   Windows (NSIS) and Linux (AppImage + deb) and publishes them to GitHub Releases. Watch the run with `gh run watch`.
5. Check that the release has all assets (dmg, mac zip, setup.exe, AppImage, deb, `latest*.yml`, blockmaps).
   electron-updater reads `latest*.yml`, so installed apps pick up the release automatically.
6. Write release notes with `gh release edit vX.Y.Z --notes ...`: short user-facing bullets, then
   `**Full Changelog**: https://github.com/silo/silo-browser/compare/vPREV...vX.Y.Z`.
- Versioning: patch = fixes, minor = features, an Electron major upgrade, or a dropped OS version.
- Never tag or release without the maintainer's explicit go. A release reaches every user through auto-update.

## Updating Electron & Dependencies
A weekly Orca automation ("Weekly Electron & dependency check") follows this checklist. Apply it to manual upgrades too.

1. `pnpm install`, then `npm view electron dist-tags --json` and `pnpm outdated`.
2. Support window: Electron supports only the **newest 3 stable majors**. If our major has dropped out, we're
   getting no Chromium security fixes, and updating is urgent (Silo loads untrusted web content).
   Electron ships patch releases almost every week. Pick them up regularly.
3. For each major we skip, read the breaking changes doc:
   https://github.com/electron/electron/blob/main/docs/breaking-changes.md. Grep `src/` for anything it touches.
   Areas that have been affected before:
   - Permission handlers (`setPermissionRequestHandler` / `setPermissionCheckHandler` in `src/main/index.ts`)
   - `clipboard` (main-process only; async since 44)
   - The sandboxed webview preload `src/preload/webview.ts`: no `Buffer`, `setImmediate`, or `require` of Node modules (45+)
   - `setWindowOpenHandler` / popups
   - Dialogs (`src/main/ipc-handlers.ts`)
   - Notifications (macOS needs a code-signed app since 42)
   - `session.clearStorageData`
4. Keep `@types/node` on the Node major that Electron ships with (`process.versions.node`; see releases.electronjs.org).
5. Electron no longer downloads its binary on install (since 42). The `postinstall` script runs `install-electron`,
   because electron-vite needs `node_modules/electron/path.txt`. Keep it.
6. If a new major drops an OS version, update `minimumSystemVersion` in `electron-builder.yml` and say so in the release notes.
7. electron-vite's built-in Electron→Node/Chrome target table can lag behind. Builds then fall back to its newest
   known target, which works fine.
8. Verify with `pnpm typecheck`, `pnpm exec electron-vite build`, `pnpm dev`, and `pnpm build:mac:fast`.
   `pnpm lint` has errors that were already there; just don't add new ones.
9. Manual smoke test before release:
   - Google/Gmail sign-in
   - Web notifications and sidebar badges
   - Screen sharing (Meet/Teams)
   - Mic/camera permission prompt
   - Right-click → Copy Link Address
   - Open a PDF
   - Config export/import dialogs
   - Auto-update from the previous version

## Remaining Features (not yet implemented)
- Split view (two tabs side by side)
