/**
 * Shared partition helpers — usable from both main and renderer.
 *
 * Every Silo group runs in its own Electron session keyed by
 * `persist:silo-group-<groupId>`. Keeping the prefix in one place avoids
 * the constant drifting between the main process (where sessions are
 * fetched via `session.fromPartition`) and the renderer (where the same
 * string is passed as the `partition` attribute on `<webview>`).
 */

export const GROUP_PARTITION_PREFIX = 'persist:silo-group-'

export function groupPartition(groupId: string): string {
  return `${GROUP_PARTITION_PREFIX}${groupId}`
}

/**
 * Whether `groupId` falls within an extension entry's active set, treating
 * `activeGroupIds === undefined` as "all groups" (the legacy default for
 * extensions installed before per-group activation existed).
 *
 * Does NOT check `entry.enabled`. Callers wanting "should be loaded right
 * now" semantics should AND-combine with `entry.enabled` themselves.
 */
export function activeGroupIdsInclude(
  entry: { activeGroupIds?: string[] },
  groupId: string
): boolean {
  if (entry.activeGroupIds === undefined) return true
  return entry.activeGroupIds.includes(groupId)
}
