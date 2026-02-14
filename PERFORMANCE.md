# Performance Optimization Plan

## Phase 1: Fix Webview Event Listener Leaks (Critical)

**Problem**: `WebviewContainer.vue` and `ChildWebviewContainer.vue` register 6-7 event listeners in `onMounted` but never clean them up in `onUnmounted`. When tabs are closed, listeners and closures leak memory.

**Fix**: Store handlers as named variables, add `onUnmounted` cleanup for all listeners.

**Files**: `WebviewContainer.vue`, `ChildWebviewContainer.vue`

---

## Phase 2: Avoid Persisting Runtime-Only State (High)

**Problem**: Deep watcher on `groups` triggers `debouncedSave` on every `currentUrl`, `currentTitle`, and `notificationCount` change — fields that are runtime-only and shouldn't be persisted. This causes near-constant file writes during active browsing.

**Fix**: Remove the deep watcher. Call `debouncedSave()` explicitly only in actions that mutate persisted fields. Strip runtime-only fields before serialization (eliminates the redundant `JSON.parse(JSON.stringify(toRaw(...)))` too).

**Files**: `stores/groups.ts`

---

## Phase 3: Async File I/O in Main Process (Medium)

**Problem**: `store.ts` uses `readFileSync`/`writeFileSync` which block the main process. Each save also re-reads the entire file to merge partial updates.

**Fix**: Convert `saveState` to async `fs.promises`. Cache state in memory so saves don't need to re-read the file.

**Files**: `src/main/store.ts`, `src/main/ipc-handlers.ts`

---

## Phase 4: Batch IPC Save Calls (Medium)

**Problem**: `debouncedSave` fires two separate IPC calls (`saveGroups` + `saveActiveTab`), each causing a separate file write.

**Fix**: Add a single `saveGroupsAndActiveTab` IPC channel that writes both in one operation.

**Files**: `src/preload/index.ts`, `src/preload/index.d.ts`, `src/main/ipc-handlers.ts`, `stores/groups.ts`
