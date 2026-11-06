# Feature idea: Sync folder

**Status:** idea, not implemented. It appears in the design canvas ("Silo Browser — new design",
board *Website · Sync across machines* and the *Sync & backup* card on *C · Settings*), but was
left out of the 2026 UI rework on purpose.

## Pitch

> Your setup, on every machine. Point Silo at iCloud Drive, Dropbox, Google Drive or OneDrive.
> No account, no server — on macOS, Windows and Linux.

## What the design shows

- **Settings › Sync & backup** card:
  - Status row: green dot + "Syncing to iCloud Drive", the folder path in mono
    (e.g. `~/Library/Mobile Documents/com~apple~CloudDocs/Silo`), and **Change folder…** /
    **Stop syncing** buttons.
  - Header subtitle: "Silo v1.7.0 · synced to iCloud Drive 2 minutes ago".
  - Export / Import / Check for updates stay underneath (today's *Backup & updates* card).
- **Welcome screen**: a "Connect a sync folder" link next to "Import a configuration", so a
  second machine can pick up an existing setup instead of starting from scratch.

## Proposed behaviour

- The user picks a folder (`dialog.showOpenDialog`, `properties: ['openDirectory']`). Silo writes
  `<folder>/Silo/silo-config.json` and remembers the folder path locally (never synced).
- **What syncs:** silos (name, color, icon incl. uploaded logos, user agent), tabs (name, URL,
  icon, notifications/mute/sleep/zoom/user agent), and appearance + behaviour settings.
- **What never syncs:** cookies, logins and other session data (the `persist:silo-group-*`
  partitions), granted permissions, the active tab, window/sidebar state, pop-up tabs.
- On every local change (the existing 500 ms debounced save), also write the synced subset to the
  folder. Write to a temp file and rename, so cloud clients never pick up a half-written file.
- Watch the file (`fs.watch` plus a periodic mtime check, because cloud clients often replace
  files instead of editing them). When it changes and the content differs from ours, load it and
  push it to the renderer the same way `dialog:import-config` does today.
- **Conflicts:** store `updatedAt` plus a per-machine id in the file. Last write wins at the file
  level. If both sides changed since the last sync, keep ours and save theirs as
  `silo-config.conflict-<machine>.json` with a notice in Settings. A later version could merge
  per silo/tab by id.
- Detect the common providers to label the folder nicely (iCloud Drive, Dropbox, Google Drive,
  OneDrive); otherwise show the folder name.

## Open questions

- Should tab order and collapsed state sync, or stay per machine?
- What happens when a synced silo is deleted on one machine? Its session data on other machines
  should be cleared the same way local deletion does (`clearStorageData`).
- Uploaded logos are data URLs inside the config. Fine for a few silos; consider separate files
  in `<folder>/Silo/icons/` if configs get large.
