# Folder sync

Keeps silos, tabs and settings the same on several computers through a folder the user picks:
one in iCloud Drive, Dropbox, Google Drive or OneDrive, a Syncthing or Nextcloud folder, a network
drive or a USB stick. No account and no server. Silo never talks to the provider; the provider's
own app moves the files.

Code: `src/shared/sync-model.ts` (data model, merge, patches; shared with the renderer),
`src/main/sync/engine.ts` (the engine, no Electron imports), `src/main/sync/index.ts` (Electron
wiring and IPC), `src/renderer/src/stores/sync.ts` and the `Sync*Dialog.vue` dialogs.
Tests: `pnpm test:sync` (`scripts/sync-test.ts`). Run them after any change to sync code.

## What syncs

| Syncs | Stays on each computer |
| --- | --- |
| Silos: name, color, icon (incl. uploaded logos), user agent, order | Logins, cookies, site data (the `persist:silo-group-*` partitions) |
| Tabs: name, home URL, emoji icon, notifications, mute, sleep, user agent, custom shortcut, order, silo | Zoom, favicons, collapsed silos, sidebar layout, whether the sidebar is collapsed |
| Theme, accent, shades, silo tint, "keep new windows inside Silo", sleep default, confirm-close, default user agent | The open tab, pop-up tabs, site permissions (camera, mic, notifications) |

Silos set to **"only on this computer"** (Edit silo › *Sync to your other computers* off, or the
switch in the setup dialog) are never written to the folder, nor their tabs. `GroupItem.localOnly`
is itself never synced. Turning it on for a synced silo removes that silo from the other
computers; turning it off adds it to them again.

Custom tab shortcuts are stored with `CmdOrCtrl` for the main modifier, so ⌘⌥G on a Mac is
Ctrl+Alt+G on Windows/Linux and back; a Mac's real Control key stays `Control`.

## Files

```
<picked folder>/Silo Browser/
  README.txt
  machines/
    <machine id>.json      ← written only by that computer
```

Each computer writes **only its own file** and reads all of them, so a cloud drive never sees two
writers on one file (no "conflicted copy" problems; conflicted copies that do appear are simply
merged too). A file holds that computer's full merged copy of the setup:

```json
{
  "format": "silo-sync", "version": 1,
  "machine": { "id": "…", "name": "Silos MacBook Pro", "platform": "darwin" },
  "appVersion": "2.2.0", "writtenAt": 1794556740000, "writeId": "…",
  "records": {
    "settings":   { "themeMode": { "v": "dark", "s": "<stamp>" }, … },
    "silo:<id>":  { "_deleted": { "v": false, "s": "…" }, "name": { "v": "Work", "s": "…" }, … },
    "tab:<id>":   { "_deleted": { "v": true,  "s": "…" } }
  }
}
```

Files are written to a temp file and renamed, so they're never half-written. Files that don't
parse (still downloading) are skipped until they do. Files from a newer format `version` are
ignored and Settings asks to update Silo. Unknown record kinds and fields are kept and passed
on, so older versions don't drop what newer ones add.

## Merging

- Every field has a stamp from a hybrid logical clock: `<ms, 15 digits>:<counter, 6>:<machine id>`.
  The newest stamp wins per field. A computer always stamps later than anything it has merged, so
  a computer with a slow clock can't lose an edit it made after seeing another one.
- Merging is commutative, associative and idempotent (a state-based CRDT): any order of reading
  any set of files gives the same result on every computer.
- Deleting is a field (`_deleted`) too. A deleted record keeps only that field. Bringing one back
  (restore, "Keep them", or turning sync back on for a silo) stamps all its fields again.
- Order: `order` is the position among synced silos (or within the silo). Ties are broken by id,
  the same everywhere.

## Local changes

The renderer saves as before. Every save reaches the engine (`setSaveListener` in `store.ts`),
which compares the synced part of the state with the previous save (`diffLocal`). A field counts as
changed by the user only if it differs from **both** the previous save (`base`) and what sync last
put there (`applied`). The renderer saves on a 500 ms timer and through separate calls (groups,
appearance, …), so a save can carry values from before a sync update arrived. Without the
two-way check such a save would look like the user undoing the update (or deleting a silo that
just arrived).

`base` is what the renderer reported: sync's own writes to the state (`writeState`, silent) never
change it.

## Applying changes from other computers

After merging, the engine materializes the records into a view and diffs it with the local state
into a `SyncPatch`. The patch is applied in the main process (and saved), then sent to the renderer
(`sync:patch`), which applies the same patch to its Pinia stores with `applyPatchToGroups`.

- Open tabs are not reloaded. A changed home URL is used the next time the tab loads
  (`WebviewContainer` loads `tab.url` once; Edit tab navigates explicitly).
- Patches are held while the renderer is loading (until it calls `sync:ready`).
- Silos "only on this computer" and their tabs are never touched by a patch.

## Safety

- **Restore points**: `<userData>/sync-restore-points/` keeps the last 20 copies of silos, tabs and
  settings, saved before turning sync on, before restoring, before any change that removes
  something, and at most hourly before other sync changes. Settings › Sync & backup › Restore….
- **Several silos removed elsewhere** (2 or more silos, every synced silo, or 8+ tabs that are at
  least half of them): nothing is removed until the user answers. "Keep them" re-creates them on
  every computer; "Remove" applies it.
- **Logins of silos removed by sync stay 30 days** (`pendingWipes`) before
  `clearStorageData()`, so restoring a silo brings it back signed in. Deleting a silo yourself
  still clears its data right away.
- **Copied profiles** (e.g. Migration Assistant copies `silo-sync.json` with its machine id): when
  our file was written by someone else, the engine merges it and continues under a new id.
- The engine writes nothing while sync is off. It only creates `Silo Browser/` inside a folder
  that exists (never on an unplugged drive's mount point).
- Remote data is validated: ids `[A-Za-z0-9_-]{1,64}` (they become partition names), field and
  record limits, colors must be hex, uploaded logos must be `data:image/` URLs, settings must be
  known values.

## Joining

Settings › Sync & backup › Choose folder… (or "Use a sync folder" on the Welcome screen) opens the
native folder picker. The setup dialog shows what's in the folder and lets the user pick:

- **Combine** (default): this computer's silos are added; where both have the same silo (same id,
  e.g. from an earlier import), the folder's version wins (local fields get the lowest stamp).
- **Use the synced setup**: synced silos that are only on this computer are removed (restorable).
- Which silos stay on this computer only.

An empty folder simply starts from this computer's setup.

**Stop syncing** removes this computer's file from the folder and forgets the merged records;
the local setup stays as it is.

## Engine state

`<userData>/silo-sync.json` (never in the sync folder): machine id, folder, merged records, the
clock, `base` / `applied`, pending wipes and the last write id. If it can't be read, sync is turned
off (the local setup is untouched) and the user can join again.
