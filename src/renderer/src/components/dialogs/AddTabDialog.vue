<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const name = ref('')
const url = ref('')
const nameManuallyEdited = ref(false)

// Auto-derive name from URL hostname
watch(url, (newUrl) => {
  if (nameManuallyEdited.value) return
  try {
    const parsed = new URL(newUrl.startsWith('http') ? newUrl : `https://${newUrl}`)
    const host = parsed.hostname.replace('www.', '')
    name.value = host.charAt(0).toUpperCase() + host.slice(1).split('.')[0]
  } catch {
    name.value = ''
  }
})

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

function submit(): void {
  const trimmedUrl = url.value.trim()
  const trimmedName = name.value.trim()
  if (!trimmedUrl || !uiStore.addTabTargetGroupId) return

  const finalName = trimmedName || trimmedUrl
  groupsStore.addTab(uiStore.addTabTargetGroupId, finalName, normalizeUrl(trimmedUrl))
  close()
}

function onNameInput(): void {
  nameManuallyEdited.value = true
}

function close(): void {
  name.value = ''
  url.value = ''
  nameManuallyEdited.value = false
  uiStore.closeAddTabDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.addTabDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      @click.self="close"
    >
      <div class="bg-surface-raised rounded-lg p-6 w-96 shadow-xl border border-border-default">
        <h2 class="text-lg font-semibold text-fg-primary mb-4">Add Tab</h2>

        <label class="block text-sm text-fg-muted mb-1">URL</label>
        <input
          v-model="url"
          type="text"
          placeholder="e.g. mail.google.com"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          @keydown.enter="submit"
          autofocus
        />

        <label class="block text-sm text-fg-muted mb-1">Name</label>
        <input
          v-model="name"
          type="text"
          placeholder="Auto-detected from URL"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-6"
          @keydown.enter="submit"
          @input="onNameInput"
        />

        <div class="flex justify-end gap-2">
          <button
            @click="close"
            class="px-4 py-1.5 text-sm text-fg-muted hover:text-fg-primary transition-colors"
          >
            Cancel
          </button>
          <button
            @click="submit"
            :disabled="!url.trim()"
            class="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
