# Feasibility: Silo Browser on Tauri & CEF

## Context

Silo Browser is an Electron app that organizes web apps into session-isolated groups. Each group has fully isolated cookies, localStorage, IndexedDB, and cache via Electron's `session.fromPartition()`. The app uses `<webview>` tags for embedded browsing, supports child/topbar tabs, native context menus, custom user agents per group, notification interception, auto-updater, and cross-platform window customization.

This document evaluates whether the same app can be built with **Tauri 2.0** or **Chrome Embedded Framework (CEF)** with full feature parity.

---

## Feature Parity Matrix

| Feature | Electron (current) | Tauri 2.0 | CEF |
|---|---|---|---|
| Session isolation per group | `session.fromPartition()` | Platform-split: `data_directory` (Win/Linux), `data_store_identifier` (macOS 14+). No unified API. Open issue [#9285](https://github.com/tauri-apps/tauri/issues/9285) | `CefRequestContext` with per-context `cache_path`. Direct equivalent. |
| Multiple embedded webviews | `<webview>` HTML tag in Vue | `WebviewBuilder` from Rust — no HTML tag, must manage from Rust side | `CefBrowserView` in Views framework. Multiple views in one window. |
| Lazy create + visibility toggle | CSS visibility toggle, stays in DOM | `Webview.show()`/`hide()` from Rust. Linux decorator bug [#11856](https://github.com/tauri-apps/tauri/issues/11856) | `CefView::SetVisible()`. Works correctly, state preserved. |
| Custom user agent per group | `session.setUserAgent()` or `<webview useragent>` | `WebviewBuilder.user_agent()` at creation only. No runtime change. Bug in multi-webview [#9492](https://github.com/tauri-apps/tauri/issues/9492) | No native per-browser UA. Workaround via DevTools protocol `SetUserAgentOverrideAsync()` per browser. |
| Intercept target=_blank / window.open | `setWindowOpenHandler()` | `on_new_window()` handler. **Broken:** pop-ups blocked regardless of permissions [#14263](https://github.com/tauri-apps/tauri/issues/14263), form target=_blank bug [#14090](https://github.com/tauri-apps/tauri/issues/14090) | `CefLifeSpanHandler::OnBeforePopup()`. Full control, reliable. |
| Title change event | `page-title-updated` | `on_document_title_changed()` | `CefDisplayHandler::OnTitleChange()` |
| Favicon change event | `page-favicon-updated` | **Not available.** Must inject JS with MutationObserver workaround. | `CefDisplayHandler::OnFaviconURLChange()` |
| Navigation events | `did-navigate`, `did-navigate-in-page` | `on_navigation()` (before only) | `CefDisplayHandler::OnAddressChange()` |
| Load start/stop events | `did-start-loading` / `did-stop-loading` | `on_page_load()` with `Started`/`Finished` | `CefLoadHandler::OnLoadingStateChange()` |
| Load error event | `did-fail-load` | **Not available** | `CefLoadHandler::OnLoadError()` |
| Native context menus | `Menu` + `MenuItem` on `context-menu` event | Native menus via muda library. No auto-smart items. | `CefContextMenuHandler`. More powerful than Electron — full context params. |
| Session data clearing | `session.clearStorageData()` | `clearAllBrowsingData()` JS API; macOS: `remove_data_store()`; Win/Linux: manual `fs::remove_dir_all` | Cookie deletion via `CefCookieManager::DeleteCookies()`. Full clear requires closing browsers + deleting `cache_path` directory. |
| Execute JS in webview | `webview.executeJavaScript()` | Initialization scripts at webview creation. No post-creation `executeJavaScript()` equivalent from host. | `CefFrame::ExecuteJavaScript()`. Direct equivalent. |
| IPC (renderer <-> host) | `contextBridge` + `ipcRenderer.invoke` / `ipcMain.handle` | `#[tauri::command]` + `invoke()`. Excellent, capability-gated per webview. | `CefMessageRouter` + `CefV8Handler`. Works but more complex (multi-process). |
| macOS hidden titlebar + traffic lights | `titleBarStyle: 'hidden'` + `trafficLightPosition` | `titleBarStyle: "Overlay"` + `trafficLightPosition`. `data-tauri-drag-region` for drag. | `CefWindowDelegate::GetTitlebarHeight()` + CSS `-webkit-app-region: drag`. |
| File dialogs | `dialog.showSaveDialog` / `showOpenDialog` | `@tauri-apps/plugin-dialog` | Direct native API access from host language. |
| Shell: open in system browser | `shell.openExternal()` | `@tauri-apps/plugin-opener` | Native `open` / `ShellExecute` / `xdg-open` from host. |
| JSON file persistence | Node.js `fs` in main process | Rust `std::fs` + `serde_json` | Native file I/O from host language. |
| Auto-updater | `electron-updater` | Built-in Tauri updater plugin | Custom implementation required. |
| Notification interception | `executeJavaScript()` to wrap `window.Notification` | No post-creation JS injection from host. Would need initialization script. | `CefFrame::ExecuteJavaScript()`. Direct equivalent. |
| Cross-platform rendering consistency | Chromium everywhere | **WKWebView (macOS), WebKitGTK (Linux), EdgeWebView2 (Windows)** — different engines per platform | Chromium everywhere |

---

## Tauri 2.0

### What works well

- IPC system (better security model than Electron)
- macOS titlebar customization (full parity)
- File system, dialogs, shell integration (via official plugins)
- Auto-updater (built-in)
- Multiple webviews in one window (supported since Tauri 2.0)

### Critical blockers

1. **No unified session isolation API.** You need platform-conditional Rust code (`data_directory` on Win/Linux, `data_store_identifier` on macOS 14+). The macOS API had a crash bug recently fixed. No committed timeline for a unified solution.

2. **Pop-up/OAuth flows are broken** ([#14263](https://github.com/tauri-apps/tauri/issues/14263)). Pop-up window creation is blocked regardless of permissions. Google OAuth, Apple login, and many other services that use pop-ups will not work. This is a showstopper for a general-purpose browser.

3. **No favicon events.** Requires injecting a MutationObserver via initialization script — fragile for dynamic favicons.

4. **Different rendering engines per platform.** WKWebView on macOS, WebKitGTK on Linux, EdgeWebView2 on Windows. Sites may render or behave differently across platforms. For a browser app, this is a major compatibility risk.

5. **All webview management must move to Rust.** The entire Vue-based `<webview>` lifecycle (WebviewContainer.vue, ChildWebviewContainer.vue) cannot exist. Webviews are created/destroyed/shown/hidden via Rust commands, not HTML. This is a complete architectural rewrite, not a migration.

6. **No post-creation `executeJavaScript()`.** Notification interception script must be an initialization script set at webview creation time — cannot be injected dynamically later.

### Verdict: ~60-70% feature parity. Not recommended.

The core browser-specific features (session isolation, popup handling, consistent rendering) are exactly the ones that are problematic. The features that work well are infrastructure (IPC, dialogs, file system) that any framework can handle.

---

## CEF (Chrome Embedded Framework)

### What works well

- **Session isolation** — `CefRequestContext` with per-context `cache_path` is a direct equivalent to Electron's partitions
- **Multiple browser views** — `CefBrowserView` in the Views framework, with `SetVisible()` for toggling
- **All browser events** — title, favicon, navigation, load start/stop, load error — full coverage via `CefDisplayHandler` + `CefLoadHandler`
- **Navigation interception** — `OnBeforePopup()` for window.open/target=_blank with full control
- **Native context menus** — `CefContextMenuHandler` is more powerful than Electron's approach
- **JS execution** — `CefFrame::ExecuteJavaScript()` direct equivalent
- **Custom titlebar** — `CefWindowDelegate` + CSS `-webkit-app-region: drag` works identically
- **Chromium everywhere** — same rendering engine on all platforms, like Electron

### Limitations

1. **Custom user agent per group** — No native per-browser UA in CEF's API. Workaround: `SetUserAgentOverrideAsync()` via DevTools protocol per browser instance. Works but adds complexity.

2. **Session data clearing** — No single `clearStorageData()` call. Must close all browsers for a context, then delete the `cache_path` directory, then recreate. More ceremony than Electron.

3. **IPC is more complex** — `CefMessageRouter` / `CefV8Handler` works but requires understanding the multi-process architecture (browser process vs renderer process). Steeper learning curve.

4. **No JavaScript/TypeScript for app logic.** The host application must be written in a native language. Your Vue/Pinia/TypeScript main-process code cannot be reused.

5. **Cross-platform packaging is manual.** No `electron-builder` equivalent. You handle `.app` bundles, `.msi`/`.exe` installers, and Linux packages yourself.

6. **No auto-updater built in.** Must implement update checking and installation yourself (e.g., Sparkle on macOS, WinSparkle on Windows).

### Language options for CEF host

| Language | Binding | Cross-platform? | Maturity |
|---|---|---|---|
| C++ | Native CEF | Yes (mac/win/linux) | Production — reference implementation |
| C# / .NET | CefSharp | **Windows only** | Production — very mature |
| Java | JCEF (JetBrains) | Yes (mac/win/linux) | Production — used in all JetBrains IDEs |
| Rust | cef-ui | Yes (incomplete) | Work in progress — not production ready |

For cross-platform: **C++** (maximum control, maximum complexity) or **Java/JCEF** (proven at scale by JetBrains, better DX than C++).

### Architecture for CEF

The Vue/Tailwind UI (sidebar, navigation bar, dialogs) would be loaded as local HTML in a non-isolated `CefBrowserView`. Each group's web content would be a separate `CefBrowserView` with its own `CefRequestContext`. The host app (C++ or Java) manages the browser lifecycle, handles context menus, intercepts popups, and persists state to JSON — replacing both `main/index.ts` and `main/ipc-handlers.ts`.

### Verdict: ~90% feature parity. Feasible but high effort.

CEF can replicate nearly everything Silo Browser does, with Chromium rendering consistency across platforms. The tradeoff is a fundamentally different development stack — native code instead of JavaScript, manual cross-platform packaging, and a steeper learning curve.

---

## Comparison

| Criteria | Tauri | CEF | Electron (current) |
|---|---|---|---|
| Feature parity | ~60-70% | ~90% | 100% |
| Session isolation | Fragmented, buggy | Full (CefRequestContext) | Full (partition) |
| Rendering consistency | 3 different engines | Chromium everywhere | Chromium everywhere |
| Development language | Rust + Vue/TS | C++ or Java | TypeScript/Vue |
| Dev experience / iteration speed | Medium | Low | High |
| Bundle size | Smallest (~10-20MB) | Medium (~100MB+) | Largest (~150MB+) |
| Cross-platform packaging | Built-in | Manual | Built-in (electron-builder) |
| Popup/OAuth support | Broken | Full | Full |
| Community/ecosystem | Growing | Mature but niche | Largest |

---

## Conclusion

- **Tauri**: Not viable for Silo Browser today. The session isolation is fragmented, pop-ups are broken, rendering varies by platform, and the webview management model requires a complete architectural rewrite. Wait for [#9285](https://github.com/tauri-apps/tauri/issues/9285) (browser profiles) and [#14263](https://github.com/tauri-apps/tauri/issues/14263) (pop-up fix) before reconsidering.

- **CEF**: Viable but high-effort. You get ~90% feature parity with Chromium consistency. The cost is rewriting the host application in C++ or Java, losing the TypeScript/Vue development experience for app logic, and handling packaging yourself. Makes sense if you need to eliminate the Electron/Node.js dependency or embed the browser in an existing native app.

- **Electron**: Remains the best fit. It was designed for exactly this use case — a desktop app that embeds web content with session isolation. Every feature Silo needs is a first-class API. The tradeoff (bundle size, memory usage) is well-understood and acceptable for a desktop browser app.
