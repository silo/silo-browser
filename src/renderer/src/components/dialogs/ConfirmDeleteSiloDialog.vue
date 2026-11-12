<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import DialogShell from '@renderer/components/common/DialogShell.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'

// Deleting a silo also wipes its cookies and site data (every login in it), so it asks first.
// Cancel has focus: Enter alone must not delete.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const silo = computed(() =>
  uiStore.confirmDeleteSiloId ? groupsStore.findGroup(uiStore.confirmDeleteSiloId) : null
)
const andTabs = computed(() => {
  const n = silo.value?.tabs.length ?? 0
  return n ? ` and its ${n} ${n === 1 ? 'tab' : 'tabs'}` : ''
})

function confirm(): void {
  if (silo.value) groupsStore.removeGroup(silo.value.id)
  close()
}

function close(): void {
  uiStore.closeConfirmDeleteSilo()
}
</script>

<template>
  <DialogShell title="Delete silo" :width="420" @close="close" @submit="confirm">
    <div v-if="silo" class="flex items-start gap-3">
      <SiloTile :silo="silo" :size="32" :radius="9" />
      <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
        Delete <span class="font-semibold text-fg1">{{ silo.name }}</span
        >{{ andTabs }}? You'll be signed out of everything in it: its cookies and site data are
        deleted. This can't be undone.
      </p>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" autofocus @click="close">Cancel</button>
      <button type="submit" class="btn btn-danger">Delete silo</button>
    </template>
  </DialogShell>
</template>
