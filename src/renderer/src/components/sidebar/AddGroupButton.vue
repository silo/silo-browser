<script setup lang="ts">
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()
</script>

<template>
  <button
    @click="uiStore.openAddGroupDialog()"
    class="flex items-center gap-1.5 p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
    title="Create new group"
  >
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      class="w-4 h-4"
    >
      <path
        d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z"
      />
    </svg>
    <span v-if="uiStore.sidebarExpanded" class="text-xs">New Group</span>
  </button>
</template>
