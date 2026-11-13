<script setup lang="ts">
import { computed } from 'vue'
import { useSyncStore } from '@renderer/stores/sync'
import { isMac } from '@renderer/utils/platform'
import DialogShell from '@renderer/components/common/DialogShell.vue'

// Another computer removed several silos (or many tabs) at once. Nothing is removed here until
// the user says so; "Keep them" puts them back on every computer.
const syncStore = useSyncStore()
const here = isMac ? 'this Mac' : 'this computer'

const removal = computed(() => syncStore.status?.pendingRemoval ?? { silos: [], tabs: 0 })

const what = computed(() => {
  const { silos, tabs } = removal.value
  const names =
    silos.length <= 3
      ? silos.join(', ')
      : `${silos.slice(0, 3).join(', ')} and ${silos.length - 3} more`
  if (silos.length && tabs)
    return `${silos.length === 1 ? 'the silo' : 'the silos'} ${names} (${tabs} ${tabs === 1 ? 'tab' : 'tabs'})`
  if (silos.length) return `${silos.length === 1 ? 'the silo' : 'the silos'} ${names}`
  return `${tabs} tabs`
})

function later(): void {
  syncStore.removalDismissed = true
}
</script>

<template>
  <DialogShell
    title="Removed on another computer"
    :width="440"
    @close="later"
    @submit="syncStore.resolveRemoval(false)"
  >
    <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
      Another computer removed {{ what }}. Remove
      {{ removal.silos.length + removal.tabs === 1 ? 'it' : 'them' }} from {{ here }} too?
    </p>
    <p class="m-0 text-[12.5px] leading-[1.5] text-fg3">
      If you remove them, their logins stay on {{ here }} for 30 days, so you can still restore them
      from Settings. Keep them to put them back on every computer.
    </p>
    <template #footer>
      <button type="button" class="btn btn-ghost mr-auto" @click="later">Decide later</button>
      <button type="button" class="btn btn-danger" @click="syncStore.resolveRemoval(true)">
        Remove
      </button>
      <button type="submit" class="btn btn-primary" autofocus>Keep them</button>
    </template>
  </DialogShell>
</template>
