<script setup lang="ts">
import { ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const name = ref('')
const selectedColor = ref('#3b82f6')
const iconEmoji = ref('')

const colorPresets = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'
]

watch(
  () => uiStore.editGroupTargetId,
  (id) => {
    if (!id) return
    const group = groupsStore.findGroup(id)
    if (group) {
      name.value = group.name
      selectedColor.value = group.color
      iconEmoji.value = group.iconEmoji ?? ''
    }
  },
  { immediate: true }
)

function submit(): void {
  const trimmed = name.value.trim()
  if (!trimmed || !uiStore.editGroupTargetId) return
  groupsStore.updateGroup(uiStore.editGroupTargetId, {
    name: trimmed,
    color: selectedColor.value,
    iconEmoji: iconEmoji.value.trim() || undefined
  })
  close()
}

function close(): void {
  uiStore.closeEditGroupDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.editGroupDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      @click.self="close"
      @keydown.enter="submit"
    >
      <div class="bg-surface-raised rounded-lg p-6 w-80 shadow-xl border border-border-default">
        <h2 class="text-lg font-semibold text-fg-primary mb-4">Edit Group</h2>

        <label class="block text-sm text-fg-muted mb-1">Name</label>
        <input
          v-model="name"
          type="text"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          @keydown.enter.stop="submit"
          autofocus
        />

        <label class="block text-sm text-fg-muted mb-2">Color</label>
        <div class="flex gap-2 mb-4">
          <button
            v-for="color in colorPresets"
            :key="color"
            class="w-7 h-7 rounded-full border-2 transition-all"
            :class="selectedColor === color ? 'border-fg-primary scale-110' : 'border-transparent'"
            :style="{ backgroundColor: color }"
            @click="selectedColor = color"
          />
        </div>

        <label class="block text-sm text-fg-muted mb-1">Icon Emoji (optional)</label>
        <input
          v-model="iconEmoji"
          type="text"
          placeholder="e.g. 🏠"
          class="w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft mb-4"
          maxlength="2"
        />

        <div class="flex justify-end gap-2 mt-2">
          <button
            @click="close"
            class="px-4 py-1.5 text-sm text-fg-muted hover:text-fg-primary transition-colors"
          >
            Cancel
          </button>
          <button
            @click="submit"
            :disabled="!name.trim()"
            class="px-4 py-1.5 text-sm bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
