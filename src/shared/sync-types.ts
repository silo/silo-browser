/** Folder sync: what the main process tells the renderer (see src/main/sync). */

export type JoinMode = 'combine' | 'replace'

export interface SyncMachine {
  id: string
  name: string
  platform: string
  lastSeen: number
  isThis: boolean
}

export interface SyncStatus {
  enabled: boolean
  /** The "Silo Browser" folder sync reads and writes */
  folder: string | null
  /** The folder for display ("~/Library/…") */
  folderDisplay: string | null
  /** "iCloud Drive", "Dropbox", … or the name of the folder the user picked */
  label: string | null
  lastSyncAt: number | null
  machines: SyncMachine[]
  thisMachine: string
  error: string | null
  /** A newer Silo writes files this version can't read */
  newerVersion: boolean
  /** Another computer removed several silos: waiting for the user before removing them here */
  pendingRemoval: { silos: string[]; tabs: number } | null
}

/** What's already in a folder the user picked */
export interface FolderSummary {
  folder: string
  folderDisplay: string
  label: string
  machines: { name: string; lastSeen: number }[]
  /** Names of the silos in the folder, in order */
  silos: string[]
  siloIds: string[]
  tabs: number
  newerVersion: boolean
}

export interface RestorePointInfo {
  id: string
  createdAt: number
  reason: string
  silos: number
  tabs: number
}
