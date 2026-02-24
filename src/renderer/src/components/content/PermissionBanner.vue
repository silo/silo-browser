<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

const PERMISSION_LABELS: Record<string, string> = {
  media: 'use your camera and microphone',
  geolocation: 'know your location',
  notifications: 'show notifications',
  'display-capture': 'share your screen',
  midi: 'use your MIDI devices',
  midiSysex: 'use your MIDI devices'
}

const label = computed(() => {
  const p = uiStore.permissionRequest
  if (!p) return ''
  return PERMISSION_LABELS[p.permission] ?? p.permission
})

const origin = computed(() => uiStore.permissionRequest?.origin ?? '')

function allow(): void {
  uiStore.respondToPermission(true)
}

function block(): void {
  uiStore.respondToPermission(false)
}
</script>

<template>
  <div
    v-if="uiStore.permissionRequest"
    class="flex items-center gap-3 px-4 py-2 bg-surface-raised border-b border-border-light text-sm"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="w-4 h-4 shrink-0 text-accent-solid"
    >
      <path
        fill-rule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
        clip-rule="evenodd"
      />
    </svg>
    <span class="text-fg-secondary truncate">
      <span class="font-medium text-fg-primary">{{ origin }}</span>
      wants to {{ label }}
    </span>
    <div class="flex items-center gap-2 ml-auto shrink-0">
      <button
        @click="block"
        class="px-3 py-1 text-xs font-medium rounded bg-surface-input border border-border-light text-fg-secondary hover:bg-surface-hover transition-colors"
      >
        Block
      </button>
      <button
        @click="allow"
        class="px-3 py-1 text-xs font-medium rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
      >
        Allow
      </button>
    </div>
  </div>
</template>
