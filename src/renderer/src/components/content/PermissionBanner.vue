<script setup lang="ts">
import { computed } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import AppIcon from '@renderer/components/common/AppIcon.vue'

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
    role="alert"
    class="flex shrink-0 items-center gap-3 border-b border-line bg-card px-4 py-2 text-[13px]"
  >
    <AppIcon name="shield" :size="15" :stroke="2" class="text-fg2" />
    <span class="min-w-0 truncate text-fg2">
      <span class="font-semibold text-fg1">{{ origin }}</span>
      wants to {{ label }}
    </span>
    <div class="ml-auto flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        class="h-7 rounded-[7px] px-3 text-[12.5px] font-medium text-fg2 shadow-[inset_0_0_0_1px_var(--field-line)] transition-colors hover:bg-hover hover:text-fg1"
        @click="block"
      >
        Block
      </button>
      <button
        type="button"
        class="h-7 rounded-[7px] bg-accent px-3 text-[12.5px] font-semibold text-on-accent transition-[filter] hover:brightness-110"
        @click="allow"
      >
        Allow
      </button>
    </div>
  </div>
</template>
