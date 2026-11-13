<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useSyncStore } from '@renderer/stores/sync'
import { isMac } from '@renderer/utils/platform'
import { timeAgo } from '@renderer/utils/time'
import type { JoinMode } from '../../../../shared/sync-types'
import DialogShell from '@renderer/components/common/DialogShell.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Shown after a sync folder was picked: what's already there, how to combine it with this
// computer's silos, and which silos stay on this computer only.
const groupsStore = useGroupsStore()
const syncStore = useSyncStore()

const summary = computed(() => syncStore.setup!)
const here = isMac ? 'this Mac' : 'this computer'

const hasRemote = computed(() => summary.value.silos.length > 0)
const localSilos = computed(() => groupsStore.sortedGroups)
const mode = ref<JoinMode>('combine')
// Silos to sync (default: all except ones already set to stay on this computer)
const synced = ref<Record<string, boolean>>(
  Object.fromEntries(groupsStore.groups.map((g) => [g.id, !g.localOnly]))
)

const fromWhere = computed(() => {
  const m = summary.value.machines
  if (m.length === 0) return 'another computer'
  if (m.length === 1) return m[0].name
  return `${m[0].name} and ${m.length - 1} other ${m.length === 2 ? 'computer' : 'computers'}`
})

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`

const removedCount = computed(() => {
  if (mode.value !== 'replace') return 0
  const remote = new Set(summary.value.siloIds)
  return localSilos.value.filter((g) => synced.value[g.id] && !remote.has(g.id)).length
})

async function submit(): Promise<void> {
  if (syncStore.busy || summary.value.newerVersion) return
  const localOnly = groupsStore.groups.filter((g) => !synced.value[g.id]).map((g) => g.id)
  await syncStore.start(hasRemote.value ? mode.value : 'combine', localOnly)
}
</script>

<template>
  <DialogShell
    title="Sync between computers"
    :width="480"
    @close="syncStore.cancelSetup()"
    @submit="submit"
  >
    <div class="flex items-start gap-3 rounded-xl bg-field p-3">
      <span
        aria-hidden="true"
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-fg1 text-page"
      >
        <AppIcon name="folder-sync" :size="18" :stroke="1.9" />
      </span>
      <span class="flex min-w-0 flex-col gap-0.5">
        <span class="text-[13.5px] font-semibold">{{ summary.label }}</span>
        <span class="truncate font-mono text-[11px] text-fg2" :title="summary.folder">
          {{ summary.folderDisplay }}
        </span>
      </span>
    </div>

    <p v-if="summary.newerVersion" class="m-0 text-[13px] leading-[1.5] text-danger">
      A newer version of Silo syncs in this folder. Update Silo on this computer first (Settings ›
      Check for updates).
    </p>

    <template v-else-if="hasRemote">
      <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
        This folder has a setup from <span class="font-semibold text-fg1">{{ fromWhere }}</span
        >: {{ plural(summary.silos.length, 'silo') }} and {{ plural(summary.tabs, 'tab')
        }}<template v-if="summary.machines[0]"
          >, last changed {{ timeAgo(summary.machines[0].lastSeen) }}</template
        >.
      </p>
      <div
        v-if="localSilos.length"
        role="radiogroup"
        aria-label="How to start"
        class="flex flex-col gap-1.5"
      >
        <label
          class="flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2.5 shadow-[inset_0_0_0_1px_var(--field-line)]"
          :class="
            mode === 'combine' ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''
          "
        >
          <input
            v-model="mode"
            type="radio"
            value="combine"
            class="mt-0.5 accent-[var(--accent)]"
          />
          <span class="flex flex-col gap-0.5">
            <span class="text-[13px] font-semibold">Combine</span>
            <span class="text-[12.5px] text-fg2">
              Add {{ here }}’s silos to the synced ones. Where both have the same silo, the synced
              one is kept.
            </span>
          </span>
        </label>
        <label
          class="flex cursor-pointer items-start gap-2.5 rounded-[10px] p-2.5 shadow-[inset_0_0_0_1px_var(--field-line)]"
          :class="
            mode === 'replace' ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : ''
          "
        >
          <input
            v-model="mode"
            type="radio"
            value="replace"
            class="mt-0.5 accent-[var(--accent)]"
          />
          <span class="flex flex-col gap-0.5">
            <span class="text-[13px] font-semibold">Use the synced setup</span>
            <span class="text-[12.5px] text-fg2">
              Silos that are only on {{ here }} are removed, except the ones you keep below. You can
              restore them from Settings.
            </span>
          </span>
        </label>
      </div>
    </template>

    <p v-else class="m-0 text-[13.5px] leading-[1.5] text-fg2">
      Silo saves your silos, tabs and settings in this folder. Choose the same folder on your other
      computers to get the same setup there.
    </p>

    <div v-if="localSilos.length && !summary.newerVersion" class="flex flex-col">
      <span class="pb-1 text-[11px] font-semibold tracking-[0.04em] text-fg3 uppercase">
        Silos on {{ here }}
      </span>
      <div
        v-for="g in localSilos"
        :key="g.id"
        class="flex min-h-[40px] items-center gap-2.5 border-b border-row-line py-1 last:border-b-0"
      >
        <SiloTile :silo="g" :size="22" :radius="6" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span :id="`sync-${g.id}`" class="truncate text-[13px] font-semibold">{{ g.name }}</span>
          <span class="text-[11.5px] text-fg3">
            {{ synced[g.id] ? plural(g.tabs.length, 'tab') + ' · syncs' : `Only on ${here}` }}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          class="switch"
          :aria-labelledby="`sync-${g.id}`"
          :aria-checked="!!synced[g.id]"
          @click="synced[g.id] = !synced[g.id]"
        />
      </div>
    </div>

    <p class="m-0 text-[12px] leading-[1.5] text-fg3">
      Logins, cookies and site data are never synced: sign in once on each computer.
      <template v-if="removedCount">
        {{ plural(removedCount, 'silo') }} will be removed from {{ here }}.
      </template>
    </p>
    <p v-if="syncStore.error" class="m-0 text-[12.5px] text-danger">{{ syncStore.error }}</p>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="syncStore.cancelSetup()">Cancel</button>
      <button
        type="submit"
        class="btn"
        :class="removedCount ? 'btn-danger' : 'btn-primary'"
        :disabled="syncStore.busy || summary.newerVersion"
      >
        {{ syncStore.busy ? 'Starting…' : 'Start syncing' }}
      </button>
    </template>
  </DialogShell>
</template>
