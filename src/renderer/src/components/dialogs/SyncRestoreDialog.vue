<script setup lang="ts">
import { ref } from 'vue'
import { useSyncStore } from '@renderer/stores/sync'
import { dateTime } from '@renderer/utils/time'
import DialogShell from '@renderer/components/common/DialogShell.vue'

// Restore points are saved before sync changes anything (and before turning it on or restoring).
const syncStore = useSyncStore()
const restoring = ref<string | null>(null)
const failed = ref(false)

const plural = (n: number, one: string): string => `${n} ${n === 1 ? one : `${one}s`}`

async function restore(id: string): Promise<void> {
  restoring.value = id
  failed.value = !(await syncStore.restore(id))
  restoring.value = null
}

function close(): void {
  syncStore.restoreOpen = false
}
</script>

<template>
  <DialogShell title="Restore an earlier setup" :width="460" @close="close" @submit="close">
    <p class="m-0 text-[13px] leading-[1.5] text-fg2">
      Silo saves your silos, tabs and settings before sync changes them. Restoring puts them back{{
        syncStore.enabled ? ' on every computer' : ''
      }}. What you have now is saved first, so you can undo it.
    </p>
    <div
      v-if="syncStore.restorePoints.length"
      class="thin-scroll flex max-h-[320px] flex-col overflow-y-auto"
    >
      <div
        v-for="p in syncStore.restorePoints"
        :key="p.id"
        class="flex min-h-[48px] items-center gap-3 border-b border-row-line py-1.5 last:border-b-0"
      >
        <span class="flex min-w-0 flex-1 flex-col gap-0.5">
          <span class="text-[13px] font-semibold">{{ dateTime(p.createdAt) }}</span>
          <span class="truncate text-[12px] text-fg3">
            {{ p.reason }} · {{ plural(p.silos, 'silo') }}, {{ plural(p.tabs, 'tab') }}
          </span>
        </span>
        <button
          type="button"
          class="btn btn-outline btn-sm"
          :disabled="!!restoring"
          @click="restore(p.id)"
        >
          {{ restoring === p.id ? 'Restoring…' : 'Restore' }}
        </button>
      </div>
    </div>
    <p v-else class="m-0 py-2 text-[12.5px] text-fg3">No restore points yet.</p>
    <p v-if="failed" class="m-0 text-[12.5px] text-danger">That restore point couldn't be read.</p>
    <template #footer>
      <button type="submit" class="btn btn-ghost">Close</button>
    </template>
  </DialogShell>
</template>
