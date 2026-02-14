<script setup lang="ts">
import { ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const name = ref('')
const selectedColor = ref('#3b82f6')

const colorPresets = [
  '#3b82f6', // blue
  '#10b981', // green
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316'  // orange
]

function submit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) return
  groupsStore.addGroup(trimmed, selectedColor.value)
  close()
}

function close(): void {
  name.value = ''
  selectedColor.value = '#3b82f6'
  uiStore.closeAddGroupDialog()
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="uiStore.addGroupDialogOpen"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      @click.self="close"
    >
      <div class="bg-gray-800 rounded-lg p-6 w-80 shadow-xl border border-gray-700">
        <h2 class="text-lg font-semibold text-white mb-4">New Group</h2>

        <label class="block text-sm text-gray-400 mb-1">Name</label>
        <input
          v-model="name"
          type="text"
          placeholder="e.g. Work, Personal"
          class="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded text-white text-sm focus:outline-none focus:border-blue-500 mb-4"
          @keydown.enter="submit"
          autofocus
        />

        <label class="block text-sm text-gray-400 mb-2">Color</label>
        <div class="flex gap-2 mb-6">
          <button
            v-for="color in colorPresets"
            :key="color"
            class="w-7 h-7 rounded-full border-2 transition-all"
            :class="selectedColor === color ? 'border-white scale-110' : 'border-transparent'"
            :style="{ backgroundColor: color }"
            @click="selectedColor = color"
          />
        </div>

        <div class="flex justify-end gap-2">
          <button
            @click="close"
            class="px-4 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            @click="submit"
            :disabled="!name.trim()"
            class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
