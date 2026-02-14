<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const appVersion = ref('')

onMounted(async () => {
  appVersion.value = await window.api.getAppVersion()
})

async function handleImport(): Promise<void> {
  const result = await window.api.importConfig()
  if (result) {
    await groupsStore.loadFromDisk()
    close()
  }
}

async function handleExport(): Promise<void> {
  await window.api.exportConfig()
}

function close(): void {
  uiStore.closeSettingsDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.settingsDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="close"
    >
      <div
        class="bg-gray-800 rounded-lg shadow-xl border border-gray-700 w-[480px] max-h-[80vh] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 class="text-lg font-semibold text-white">Settings</h2>
          <button
            @click="close"
            class="text-gray-400 hover:text-white transition-colors"
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
        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <!-- General section -->
          <div>
            <h3
              class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3"
            >
              General
            </h3>
            <div class="space-y-3">
              <label
                class="flex items-center justify-between px-3 py-2 bg-gray-900 border border-gray-700 rounded cursor-pointer hover:border-gray-500 transition-colors"
              >
                <div>
                  <span class="text-sm text-gray-300">Open links in new tab</span>
                  <p class="text-xs text-gray-500 mt-0.5">
                    Links that open new windows will open as topbar tabs instead
                  </p>
                </div>
                <input
                  type="checkbox"
                  :checked="uiStore.openLinksInNewTab"
                  @change="uiStore.setOpenLinksInNewTab(($event.target as HTMLInputElement).checked)"
                  class="w-4 h-4 accent-blue-500 cursor-pointer"
                />
              </label>
            </div>
          </div>

          <!-- Data section -->
          <div>
            <h3
              class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3"
            >
              Data
            </h3>
            <div class="space-y-2">
              <button
                @click="handleExport"
                class="w-full flex items-center gap-3 px-3 py-2 bg-gray-900 border border-gray-700 rounded hover:border-gray-500 transition-colors text-sm text-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 text-gray-400"
                >
                  <path
                    d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z"
                  />
                  <path
                    d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"
                  />
                </svg>
                <span>Export Configuration</span>
              </button>
              <button
                @click="handleImport"
                class="w-full flex items-center gap-3 px-3 py-2 bg-gray-900 border border-gray-700 rounded hover:border-gray-500 transition-colors text-sm text-gray-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 text-gray-400"
                >
                  <path
                    d="M9.25 13.25a.75.75 0 001.5 0V4.636l2.955 3.129a.75.75 0 001.09-1.03l-4.25-4.5a.75.75 0 00-1.09 0l-4.25 4.5a.75.75 0 101.09 1.03L9.25 4.636v8.614z"
                  />
                  <path
                    d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z"
                  />
                </svg>
                <span>Import Configuration</span>
              </button>
            </div>
          </div>

          <!-- About section -->
          <div>
            <h3
              class="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3"
            >
              About
            </h3>
            <p class="text-sm text-gray-500">Silo v{{ appVersion }}</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
