<script setup lang="ts">
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
        width="128"
        height="128"
        viewBox="0 0 128 128"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        class="w-20 h-20 mx-auto mb-6"
      >
        <rect width="128" height="128" rx="50" fill="#14121A" />
        <path
          d="M45.648 105.304V93.784H34V80.856H46.928V92.504H80.464V70.488H45.648V58.968H34V34.648H45.648V23H81.744V34.648H93.52V47.448H80.464V35.928H46.928V57.816H81.744V69.208H93.52V93.784H81.744V105.304H45.648Z"
          fill="white"
        />
      </svg>
      <h1 class="text-2xl font-semibold text-gray-300 mb-2">Welcome to Silo Browser</h1>
      <p class="text-base text-gray-400 mb-4">
        Your web apps, organized and isolated.
      </p>
      <p class="text-sm text-gray-600">
        Get started by adding a new group and tab in the sidebar.
      </p>
    </div>
  </div>
</template>
