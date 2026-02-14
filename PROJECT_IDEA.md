# Silo Browser

A cross-platform desktop browser that organizes web apps into session-isolated groups. Each group maintains its own cookies, localStorage, and session data — so you can be logged into multiple accounts of the same service simultaneously without cross-contamination.

## Tech Stack
- Electron
- Vue 3 + Typescript + Pinia
- Vite

## Core Features

### Session-Isolated Groups
- Left sidebar with collapsible groups (e.g., "Work", "Personal", "Client A")
- Each group has its own isolated session storage (cookies, localStorage, IndexedDB)
- Apps like Google, Twitter, GitHub operate privately within their group
- Logging into Gmail in "Work" group does not affect "Personal" group

### App/Tab Management
- Users can add apps (URL + name + icon) to any group
- "+" button next to each group header to add a new app
- "+" button at bottom of sidebar to create a new group
- Clicking a tab icon in the sidebar activates that app in the content area
- Tabs are created lazily (only load when first clicked)

### Tab Options (right-click context menu)
- Edit URL
- Change icon (favicon, custom URL, or emoji)
- Activate/deactivate notifications
- Open in default browser
- Reload
- Delete

### Navigation
- Links within a tab stay in that tab's isolated session
- Right-click any link to open in the system's default browser

## UI Layout
```
┌──────┬────────────┬────────────────────┐
│ [W]  │Current tab │ Opened tab within  │
│ Gmail│─────────────────────────────────│
│ Drive│    Content Area                 │
│  +   │    (active tab's website)       │
│──────│                                 │
│ [P]  │                                 │
│ Gmail│                                 │
│ Twitter                                │
│  +   │                                 │
│      │                                 │
│      │                                 │
│ [+]  │                                 │
└──────┴─────────────────────────────────┘
```
- Left sidebar: two states, one folded only show icons and one little wider show title and icon
- Groups shown with colored border
- Tabs shown as favicon icons within their group
- Content area fills remaining window space

## Inspirations
- [Biscuit browser](https://eatbiscuit.com/) — primary inspiration
- [Wavebox](https://wavebox.io/) — best-in-class session isolation
- [Ferdium](https://ferdium.org/) — open source multi-app browser

## Target Platforms
- Windows
- macOS
- Linux

## Ideas
- Notification badges per tab
- URL/address bar for the active tab
- Back/forward navigation buttons
- Import/export group configuration
- Light/dark theme toggle
- Split view (two tabs side by side)
- Custom user agent per group (e.g., mobile mode)
- Auto-updater
