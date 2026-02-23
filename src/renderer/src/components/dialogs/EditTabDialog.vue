<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const name = ref('')
const url = ref('')
const iconEmoji = ref('')
const notificationsEnabled = ref(true)

watch(
  () => uiStore.editTabTargetId,
  (id) => {
    if (!id) return
    const tab = groupsStore.findTab(id)
    if (tab) {
      name.value = tab.name
      url.value = tab.url
      iconEmoji.value = tab.iconEmoji ?? ''
      notificationsEnabled.value = tab.notificationsEnabled
    }
  },
  { immediate: true }
)

function submit(): void {
  const trimmedName = name.value.trim()
  const trimmedUrl = url.value.trim()
  if (!trimmedUrl || !uiStore.editTabTargetId) return

  let finalUrl = trimmedUrl
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = `https://${finalUrl}`
  }

  groupsStore.updateTab(uiStore.editTabTargetId, {
    name: trimmedName || trimmedUrl,
    url: finalUrl,
    iconEmoji: iconEmoji.value.trim() || undefined,
    notificationsEnabled: notificationsEnabled.value
  })
  close()
}

function close(): void {
  uiStore.closeEditTabDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.editTabDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      @click.self="close"
    >
      <div class="bg-surface-raised rounded-lg p-6 w-96 shadow-xl border border-border-default">
        <h2 class="text-lg font-semibold text-fg-primary mb-4">Edit Tab</h2>

        <label class="block text-sm text-fg-muted mb-1">URL</label>
        <input
          v-model="url"
          type="text"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          @keydown.enter="submit"
          autofocus
        />

        <label class="block text-sm text-fg-muted mb-1">Name</label>
        <input
          v-model="name"
          type="text"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          @keydown.enter="submit"
        />

        <label class="block text-sm text-fg-muted mb-1">Icon Emoji (optional)</label>
        <input
          v-model="iconEmoji"
          type="text"
          placeholder="e.g. 📧"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          maxlength="2"
        />

        <label class="flex items-center gap-2 text-sm text-fg-muted mb-6 cursor-pointer">
          <input
            v-model="notificationsEnabled"
            type="checkbox"
            class="rounded border-border-light bg-surface-input"
          />
          Enable notifications
        </label>

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
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
