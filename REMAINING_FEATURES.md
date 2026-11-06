# Remaining Features

## Not Yet Implemented

- [ ] **Split View** — Display two tabs side by side in the content area
- [ ] **Sync folder** — Point Silo at iCloud Drive, Dropbox, Google Drive or OneDrive to sync silos, tabs and settings across machines (never logins). Designed but not built; spec in [`docs/ideas/sync-folder.md`](docs/ideas/sync-folder.md)
- [ ] **Auto-updater** — Automatic app updates using electron-updater (already installed as dependency)

## Recently Completed

- [x] New UI design (design canvas "C · Combined"): silo tint, light/dark shades, new accents, bundled fonts, rounded page card
- [x] Two sidebar layouts — silo rail + list (default for new installs) or one sidebar — plus a 60px collapsed mode
- [x] Command bar (⌘L) — search tabs in every silo, open an address here or add it as a tab
- [x] Custom silo icons — letter, emoji, built-in icon or uploaded SVG/PNG logo
- [x] Welcome screen (name your first silo) and frameless window on Windows/Linux
- [x] macOS seamless title bar (hidden title bar + traffic lights in sidebar)
- [x] Topbar tabs (new-window links open as child tabs in the nav bar)
- [x] Webview context menu (native right-click menu on links: Open in New Tab, Open in Default Browser, Copy Link)
- [x] Settings modal (gear icon in sidebar, import/export moved here, Cmd+,)
- [x] Tab context menu (Edit, Reload, Notifications, Delete)
- [x] Navigation bar (URL bar + back/forward/reload)
- [x] Drag-and-drop reordering (tabs + groups)
- [x] Edit group/tab dialogs (rename, color, URL, emoji, user agent)
- [x] Notification badges on tab icons
- [x] Keyboard shortcuts (Cmd+T/N/W/R/L/,/1-9)
- [x] Import/export group configuration
- [x] Custom user agent per group
