<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import DialogShell from '@renderer/components/common/DialogShell.vue'

const uiStore = useUiStore()

const isFallback = computed(() => uiStore.fallbackVersion !== null)

function restartNow(): void {
  window.api.quitAndInstall()
}

function downloadFromGitHub(): void {
  window.api.openReleasesPage()
  close()
}

function close(): void {
  uiStore.closeUpdateDialog()
}
</script>

<template>
  <DialogShell
    title="Update available"
    :width="420"
    @close="close"
    @submit="isFallback ? downloadFromGitHub() : restartNow()"
  >
    <div class="flex flex-col gap-2">
      <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
        Silo <span class="font-semibold text-fg1">{{ uiStore.updateVersion }}</span>
        <template v-if="isFallback">
          is available. The automatic update couldn't be applied — you can download it from GitHub.
        </template>
        <template v-else>has been downloaded and is ready to install.</template>
      </p>
      <p v-if="!isFallback" class="m-0 text-[12px] text-fg3">
        Restart now, or it installs the next time you open Silo.
      </p>
    </div>
    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">Later</button>
      <button type="submit" class="btn btn-primary" autofocus>
        {{ isFallback ? 'Download from GitHub' : 'Restart now' }}
      </button>
    </template>
  </DialogShell>
</template>
