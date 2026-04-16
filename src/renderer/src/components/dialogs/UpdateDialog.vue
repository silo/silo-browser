<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

const isFallback = computed(() => uiStore.fallbackVersion !== null)

function restartNow(): void {
  window.api.quitAndInstall()
}

function downloadFromGitHub(): void {
  window.api.openReleasesPage()
  close()
}

const dialogRef = ref<HTMLElement | null>(null)

onMounted(() => {
  nextTick(() => dialogRef.value?.focus())
})

function close(): void {
  uiStore.closeUpdateDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.updateDialogOpen"
      ref="dialogRef"
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      @click.self="close"
      @keydown.enter="isFallback ? downloadFromGitHub() : restartNow()"
      tabindex="-1"
    >
      <div
        class="bg-surface-raised rounded-lg shadow-xl border border-border-default w-[400px] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 class="text-lg font-semibold text-fg-primary">Update Available</h2>
          <button
            @click="close"
            class="text-fg-muted hover:text-fg-primary transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-5 h-5"
            >
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="px-6 py-5">
          <p class="text-sm text-fg-secondary">
            Version <span class="font-semibold text-fg-primary">{{ uiStore.updateVersion }}</span>
            <template v-if="isFallback">
              is available. Automatic update could not be applied — you can download it manually from GitHub.
            </template>
            <template v-else>
              has been downloaded and is ready to install.
            </template>
          </p>
          <p v-if="!isFallback" class="text-xs text-fg-faint mt-2">
            You can restart now to apply the update, or it will be installed the next time you launch the app.
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <button
            @click="close"
            class="px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary bg-surface-hover hover:bg-surface-active rounded transition-colors"
          >
            Later
          </button>
          <button
            v-if="isFallback"
            @click="downloadFromGitHub"
            class="px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded transition-colors"
          >
            Download from GitHub
          </button>
          <button
            v-else
            @click="restartNow"
            class="px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded transition-colors"
          >
            Restart Now
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
