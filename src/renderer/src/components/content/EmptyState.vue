<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'

const groupsStore = useGroupsStore()
const isMac = window.api.platform === 'darwin'
</script>

<template>
  <div class="flex items-center justify-center h-full text-gray-500 relative">
    <!-- macOS drag region when no nav bar is visible -->
    <div
      v-if="isMac"
      class="absolute top-0 left-0 right-0 h-10"
      style="-webkit-app-region: drag"
    />
    <div class="text-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1"
        stroke="currentColor"
        class="w-16 h-16 mx-auto mb-4 text-gray-600"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418"
        />
      </svg>
      <p class="text-lg font-medium text-gray-400">
        {{ groupsStore.groups.length === 0 ? 'Create a group to get started' : 'Select a tab to browse' }}
      </p>
      <p class="text-sm mt-1 text-gray-600">
        {{ groupsStore.groups.length === 0 ? 'Click the + button in the sidebar' : 'Click any tab in the sidebar to load it' }}
      </p>
    </div>
  </div>
</template>
