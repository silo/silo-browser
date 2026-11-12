# CLAUDE.md — Silo Browser Development Guide

## Project Overview
Silo Browser is a cross-platform Electron desktop browser that organizes web apps into
session-isolated groups. Each group maintains its own cookies, localStorage, and session data
using Electron's `session.fromPartition()`.

## Tech Stack
- **Runtime**: Electron 45 (Chromium 156, Node 24) — see "Updating Electron & Dependencies"
- **Build tool**: electron-vite (https://electron-vite.org)
- **Package manager**: pnpm 12, pinned via `packageManager` in package.json. Corepack/pnpm switches to it
  automatically, and CI's `pnpm/action-setup` reads it too, so don't add `version:` there. Settings live in
  `pnpm-workspace.yaml` (`allowBuilds`, `shamefullyHoist`, `minimumReleaseAgeExclude`), not in package.json.
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
**Never move a webview to a different DOM parent** — that reloads it. App.vue lays the window out
as one CSS grid and only changes `grid-template-areas` between layouts (expanded / collapsed /
settings), so `TheContentArea` (and its webviews) keeps the same parent.

### UI design
The UI follows the design canvas "Silo Browser — new design", page **C · Combined**
(claude.ai artifact `86c9d29b-a0f6-41d3-aa78-838b2afb34aa`). In the UI, groups are called **silos**;
the code still says `group` (stores, IPC, `persist:silo-group-*` partitions — renaming those would
sign users out).
- Design tokens are CSS variables set on `<html>` by `useAppTheme()` from `utils/theme.ts`
  (theme mode, 6 light + 6 dark shades, accent, silo tint). They are registered as Tailwind colors
  in `assets/main.css` (`bg-chrome`, `text-fg2`, `bg-tab-on`, `shadow-card`, …).
- **Silo tint:** the active silo's color is mixed into the window chrome (`--chrome`). The same
  color is sent to the main process (`window:set-chrome-colors`) for the window background and
  the Windows/Linux title bar overlay.
- Fonts are bundled via `@fontsource-variable/*`: Instrument Sans (UI, `font-sans`),
  Bricolage Grotesque (headings, `font-display`), JetBrains Mono (keys, `font-mono`).
- Two sidebar layouts (`sidebarLayout`): `'rail'` (64px silo rail + 208px list of the selected
  silo — the default for new installs) and `'sidebar'` (all silos in one 240px list — what
  configs from before this setting fall back to). Both collapse to the same 60px icon column.
  When switching silos the rail's tab list is re-keyed, so it swaps instantly instead of
  animating.
- Base CSS lives in `@layer base`, shared classes (`.btn`, `.switch`, `.field-input`,
  `.select-field`) in `@layer components`. Unlayered CSS would override Tailwind utilities. Don't
  name a component class like a generated utility (e.g. `text-field` collides with the `field`
  color token).

## Key Files
- `electron.vite.config.ts` — Unified Vite config (main + preload + renderer)
- `src/main/index.ts` — Main process entry, frameless BrowserWindow (traffic lights on macOS, title bar overlay on Windows/Linux), permissions, webview context menu
- `src/main/menu.ts` — App menu + accelerators (each sends `shortcut:*` to the renderer), custom tab shortcuts, Ctrl+Tab handling
- `src/preload/webview.ts` — Sandboxed webview preload: focus/dialog guards, external protocols, back/forward keys + mouse buttons, camera/mic relay
- `src/preload/media-capture.ts` — Main-world getUserMedia/getDisplayMedia wrapper that reports camera/mic/screen use
- `src/main/store.ts` — JSON file persistence; `normalizeState()` validates and migrates configs (startup + import)
- `src/main/ipc-handlers.ts` — All IPC handler registrations (store, shell, dialog, window)
- `src/preload/index.ts` — contextBridge API (window.api)
- `src/preload/index.d.ts` — TypeScript declarations for SiloApi
- `src/renderer/src/stores/groups.ts` — Primary Pinia store (silos/groups, tabs, CRUD, reorder, notifications, sleep)
- `src/renderer/src/stores/ui.ts` — UI state (sidebar + layout, dialogs, command bar, context menu, settings, theme)
- `src/renderer/src/stores/topbar-tabs.ts` — Runtime-only store for child/topbar (pop-up) tabs
- `src/renderer/src/stores/recently-closed.ts` — Runtime-only stack of closed pop-up tabs / removed sidebar tabs (⌘⇧T, ⌘L)
- `src/renderer/src/utils/accelerator.ts` — Shortcut recording/formatting + the list of Silo's own (reserved) shortcuts
- `src/renderer/src/types/index.ts` — Shared TypeScript interfaces
- `src/renderer/src/utils/theme.ts` — Design tokens: shades, accents, silo colors, tint levels
- `src/renderer/src/utils/silo-icons.ts` — Built-in silo icons, emoji quick picks, logo upload → data URL
- `src/renderer/src/composables/useAppTheme.ts` — Applies tokens + silo tint to `<html>`
- `src/renderer/src/composables/useSidebarDnd.ts` — Drag-and-drop handlers shared by all sidebar layouts
- `src/renderer/src/composables/useSiloMenus.ts` — Tab/silo context menus + tab status flags
- `src/renderer/src/App.vue` — Root grid layout, keyboard shortcuts, IPC listeners
- `src/renderer/src/components/CommandBar.vue` — ⌘L: search tabs in every silo, open/add an address
- `src/renderer/src/components/ContextMenu.vue` — Generic right-click context menu
- `src/renderer/src/components/common/` — `SiloTile`, `TabIcon`, `AppIcon`, `DialogShell`, `SiloLogo`
- `src/renderer/src/components/content/WebviewContainer.vue` — Webview lifecycle + event tracking
- `src/renderer/src/components/content/TheNavigationBar.vue` — 44px title row: back/forward/reload/home, pop-up tabs, address button, open externally
- `src/renderer/src/components/content/ChildWebviewContainer.vue` — Webview for child (topbar) tabs
- `src/renderer/src/components/content/WelcomeScreen.vue` / `EmptyState.vue` — no silos / no open tab
- `src/renderer/src/components/sidebar/TheSidebar.vue` — Picks `SidebarFull`, `SidebarRail`, `SidebarCollapsed` or `SettingsRail`
- `src/renderer/src/components/dialogs/` — `SiloDialog` (new + edit silo), AddTab, EditTab, ConfirmRemoveTab, Update
- `src/renderer/src/components/settings/SettingsPage.vue` — Settings cards (look & feel, behaviour, silos, backup, shortcuts)

## Commands
- `pnpm dev` — Start development with HMR
- `pnpm build` — Build for production
- `pnpm build:mac` — Package for macOS
- `pnpm build:win` — Package for Windows
- `pnpm build:linux` — Package for Linux
- `pnpm sign:dev-electron` — (macOS) Sign `node_modules/electron/dist/Electron.app` with your local
  code-signing identity so notifications work in `pnpm dev`. Re-run after every Electron update.

## Keyboard Shortcuts
Most are app-menu accelerators (`src/main/menu.ts`) so they work while a page has focus. Keep the menu,
`RESERVED` in `utils/accelerator.ts` and the list in `SettingsPage.vue` in sync.
- `Cmd/Ctrl+T` — Add new tab to the current silo
- `Cmd/Ctrl+Shift+T` — Reopen the last closed pop-up tab or removed sidebar tab (with its pop-ups)
- `Cmd/Ctrl+N` — Create new silo
- `Cmd/Ctrl+W` — Close active child tab (asks before removing a primary sidebar tab)
- `Cmd/Ctrl+R` — Reload; `Cmd/Ctrl+Shift+R` (and Ctrl/Shift+F5) — reload ignoring cache; `F5` on Windows/Linux
- `Cmd/Ctrl+.` — Stop loading (`Esc` too, when the app chrome has focus); the reload button turns into Stop
- `Cmd/Ctrl+L` — Open the command bar (search tabs / recently closed / enter address)
- `Cmd/Ctrl+F` — Find in page; `Cmd/Ctrl+G` / `+Shift+G` (F3 / Shift+F3) — find next / previous
- `Cmd/Ctrl+P` — Print the page
- `Cmd/Ctrl+[` or `]` — Toggle sidebar (renderer only; not a menu accelerator so pages keep it)
- `Cmd/Ctrl+1-8` — Nth tab of the current silo; `Cmd/Ctrl+9` — its last tab
- `Ctrl+1-9` (macOS) / `Alt+1-9` (Windows/Linux) — Nth silo, back on its last-used tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab`, `Cmd+Opt+→/←`, `Cmd+Shift+]/[` (mac), `Ctrl+PgDn/PgUp` — next / previous tab in the
  current silo. Ctrl+Tab is caught in `before-input-event` (not an NSMenu key equivalent).
- `Cmd+←/→` (mac) / `Alt+←/→` — Back / forward, only when not typing in a field (webview preload + App.vue).
  Mouse side buttons too; three-finger swipe via the window `swipe` event.
- Custom per-tab shortcuts (Edit tab / Settings › Shortcuts) — stored as `TabItem.shortcut` (Electron accelerator),
  registered as hidden menu items via `menu:set-tab-shortcuts`. They work from any silo.
- `Cmd+Opt+I` / `Ctrl+Shift+I` — DevTools for the page; `+Shift` — Silo's own DevTools
- `Cmd/Ctrl+,` — Open settings
- `Escape` — Close the topmost layer (context menu, command bar, dialogs, find bar, settings), else stop loading

## IPC Channels
- `store:get-state` — Returns full AppState
- `store:save-groups` — Persists groups array
- `store:save-active-tab` — Persists activeTabId
- `store:save-groups-and-active-tab` — Batched save for groups + activeTabId
- `store:save-sidebar-state` — Persists sidebar expanded
- `store:save-sidebar-layout` — Persists `'sidebar'` / `'rail'`
- `store:save-open-links-in-new-tab` — Persists link opening behavior setting
- `store:save-appearance` — Persists theme mode, accent, light/dark shade and silo tint
- `window:set-chrome-colors` — Window background + Windows/Linux title bar overlay colors
- `store:clear-group-session` — Clears session data for a group partition
- `display-media:pick` / `display-media:response` — Screen-share source picker (main ⇄ renderer)
- `shell:open-external` — Opens URL in system browser
- `dialog:export-config` — Export config to JSON file
- `dialog:import-config` — Import config from JSON file
- `menu:set-tab-shortcuts` — Custom tab shortcuts → hidden app-menu items

## Conventions
- Component names: `TheSidebar.vue` for singletons, `SidebarGroup.vue` for reusable
- Pinia stores: Composition API style with `defineStore('name', () => {})`
- IPC channels prefixed: `store:`, `shell:`, `dialog:`, `window:`, `menu:`; main → renderer menu accelerators use `shortcut:`
- UUID generation: `crypto.randomUUID()` (available in Electron's renderer)
- Tailwind only in renderer (not main/preload)
- Types shared via `src/renderer/src/types/index.ts`
- Context menus use `ContextMenuEntry` type and `uiStore.showContextMenu()`
- Drag-and-drop uses HTML5 drag API with JSON payloads `{ type: 'tab'|'group', id }`

## Important Notes
- The `<webview>` partition attribute MUST be set before first navigation
- `webviewTag: true` must be in BrowserWindow webPreferences or webviews silently fail
- Persistence runs ONLY in the main process; renderer accesses it via IPC
- Tab `isLoaded`, `notificationCount`, `currentUrl`, `currentTitle`, `capture`, `isLoading` are runtime-only state
- Camera / mic / screen-share use is detected in the page (`src/preload/media-capture.ts`, injected into the main
  world by the webview preload and into sub-frames by the main process) and sent to the host as `media-capture`.
  `useTabStatus` ORs a tab's state with its pop-up tabs', so a call in a pop-up shows on its sidebar tab and silo.
  Tabs on a call or playing audio never go to sleep (`isTabBusy`).
- Every awake tab or pop-up is a full renderer process (~100–500 MB), so:
  - New tabs sleep after 1 hour by default (`defaultSleepAfterMinutes: 60`). Configs from before v2.1 stored
    "never" and are switched once in `normalizeState`; `sleepDefaultMigrated` keeps a later "Never" choice.
  - Pop-up tabs restored from the last session load when first shown (`ChildTab.isLoaded`, `loadedChildTabs`).
  - When a tab sleeps, its pop-ups are unloaded (`unloadChildTabs`), not deleted; they reload when clicked.
- When deleting a group, call `session.fromPartition(partition).clearStorageData()`
- Groups support optional `userAgent` field for custom user agent per group
- Groups have an optional `icon: { kind: 'letter' | 'emoji' | 'icon' | 'image', value }`; uploaded logos are stored as data URLs in the config. Legacy `iconEmoji` is migrated on load.
- `titleBarStyle: 'hidden'` on every platform. macOS traffic lights sit at (16, 16) — keep `TRAFFIC_LIGHT_INSET` in `utils/platform.ts` in sync. Windows/Linux use `titleBarOverlay`; the `.wco-spacer` element reserves room for the OS buttons.
- Child/topbar tabs are runtime-only (not persisted); managed by `topbar-tabs` store
- Webview context menus are native Electron menus built in the main process via `app.on('web-contents-created')`
- `target=_blank` / `window.open()` links are handled via `setWindowOpenHandler` in main process (not deprecated `new-window` event)
- `openLinksInNewTab` setting (persisted) controls whether _blank links open as topbar tabs or in the system browser
- `app-drag` and `app-no-drag` CSS classes control window dragging regions (all platforms)
- Screen sharing (`getDisplayMedia`) goes through `ses.setDisplayMediaRequestHandler` in `src/main/index.ts`.
  On macOS 15+ the native system picker is used. Elsewhere `desktopCapturer` sources are shown in
  `DisplayMediaPickerDialog.vue`.
- macOS notifications need a properly signed app (since Electron 42). The npm Electron.app is ad-hoc signed,
  so run `pnpm sign:dev-electron` for dev. Note that `codesign` on this Mac can't match the identity *name*
  (non-ASCII "Ö"), so sign by SHA-1 hash.
- Web Push (`pushManager.subscribe`) is not supported in Electron: there is no push service. Only the in-page
  Notification API works.
- Geolocation on macOS does not work yet. Info.plist keys and the location entitlement are in place, but
  nothing asks macOS for location authorization (Chrome does this from its own UI), so requests time out.
  A fix needs a native CoreLocation authorization call from the main process.

## Release Process
1. Land changes on `main` (commit directly, or fast-forward a feature branch:
   `git push origin <branch>:main`).
2. Bump `version` in `package.json` in its own commit, with the message `vX.Y.Z` and no other changes.
3. Tag that commit `vX.Y.Z`, then push main and the tag: `git push origin main && git push origin vX.Y.Z`.
4. The tag triggers `.github/workflows/release.yml`. It builds macOS arm64 (signed + notarized),
   Windows (NSIS) and Linux (AppImage + deb) and uploads them to a **draft** GitHub release
   (electron-builder's default). Watch the run with `gh run watch`.
   - If a job never starts ("not acquired by Runner", which happens with macOS arm64 capacity), re-run just
     that job: `gh run rerun <run-id> --job <job-id>`. It uploads into the existing draft.
   - Notarization `HTTP status code: 403. A required agreement is missing or has expired` means Apple published
     a new Developer Program agreement. The Account Holder must accept it at https://developer.apple.com/account,
     then re-run the macOS job.
5. Check that the draft has all assets (dmg, mac zip, setup.exe, AppImage, deb, `latest.yml`, `latest-mac.yml`,
   `latest-linux.yml`, blockmaps).
6. Publish it with release notes:
   `gh release edit vX.Y.Z --draft=false --notes-file notes.md`.
   Notes are short user-facing bullets, then
   `**Full Changelog**: https://github.com/silo/silo-browser/compare/vPREV...vX.Y.Z`.
   Publishing is what releases it: electron-updater only sees published releases (`latest*.yml`).
- `gh` must act as an account with write access to `silo/silo-browser`, or drafts are invisible and
  edits/re-runs fail. If another account is active, prefix commands with
  `GH_TOKEN=$(gh auth token --user silo)`.
- Versioning: patch = fixes, minor = features, an Electron major upgrade, or a dropped OS version.
- Never tag or release without the maintainer's explicit go. A release reaches every user through auto-update.

## Updating Electron & Dependencies
A weekly Orca automation ("Weekly Electron & dependency check") follows this checklist. Apply it to manual upgrades too.

1. `pnpm install`, then `npm view electron dist-tags --json` and `pnpm outdated`.
   pnpm refuses package versions published less than 24h ago (`minimumReleaseAge`, default 1440 min), both when
   resolving and when verifying the lockfile in CI. A brand-new Electron release can't be installed or released
   until it's 24h old, unless you add an exact-version entry to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
   Remove entries from that list once the version is older than 24h.
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
   - Notifications (macOS needs a code-signed app since 42; re-run `pnpm sign:dev-electron`)
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
- Sync folder (iCloud Drive / Dropbox / Google Drive / OneDrive) — see `docs/ideas/sync-folder.md`
