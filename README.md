# Silo Browser

A desktop browser that organizes web apps into session-isolated groups.

Each group maintains its own cookies, localStorage, and session data — so you can run multiple accounts for the same service side by side. Built with Electron, Vue 3, and TypeScript.

![Silo Browser](screenshots/silo-browser-default.png)

![Silo Browser Tabs](screenshots/silo-browser-tabs.png)

<video src="https://github.com/user-attachments/assets/bfce7b76-9db2-4fd0-b482-40b874e04d3c"></video>

## Features

| Feature | Description |
| --- | --- |
| Session-isolated groups | Each group has its own cookies, localStorage, IndexedDB, and cache. Log into the same site with different accounts across groups. |
| Tab management | Add, edit, delete, and reorder tabs with drag-and-drop. Move tabs between groups. |
| Child tabs | Links that open in new windows stay inside the app as topbar tabs, scoped to the parent tab. |
| Custom user agent | Set a custom user-agent string per group so sites see a different browser identity. |
| Notification badges | Tabs show a red badge count when they receive notifications in the background. Per-tab notification toggle. |
| Tab mute | Mute audio on any tab. A speaker icon indicates when a tab is playing audio. |
| Collapsible sidebar | Expand or collapse the sidebar to icon-only mode. State persists across sessions. |
| Keyboard shortcuts | Quick access to common actions — new tab, new group, reload, focus URL bar, switch tabs, and more. |
| Emoji tab icons | Override a tab's favicon with any emoji character. |
| Import / export config | Save your full setup (groups, tabs, settings) to a JSON file and restore it anytime. |
| Auto-updater | The app checks for updates in the background and prompts you when a new version is ready. |
| Cross-platform | Available for macOS, Windows, and Linux. |

## Why Electron?

| Criteria | Electron | Tauri | CEF |
| --- | --- | --- | --- |
| Session isolation | `session.fromPartition()` | Fragmented — no unified API, platform-specific workarounds | `CefRequestContext` — works but complex cleanup |
| Rendering engine | Chromium everywhere | Different per platform (WKWebView, WebKitGTK, WebView2) | Chromium everywhere |
| Pop-up / OAuth support | Full | Broken — pop-ups blocked regardless of permissions | Full |
| Favicon events | Built-in | Not available — requires JS workaround | Built-in |
| Auto-updater | `electron-updater` | Built-in plugin | Must implement yourself |
| Cross-platform packaging | `electron-builder` | Built-in | Must implement yourself |
| Dev language | TypeScript / Vue | Rust + TypeScript / Vue | C++ or Java |
| Dev iteration speed | Fast | Medium | Slow |

## Development

```bash
# Install dependencies
pnpm install

# Start dev server with HMR
pnpm dev

# Build for production
pnpm build:mac
pnpm build:win
pnpm build:linux
```
