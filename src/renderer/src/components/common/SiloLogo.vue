<script setup lang="ts">
withDefaults(defineProps<{ size?: number; radius?: number }>(), { size: 28, radius: 8 })
</script>

<template>
  <svg
    role="img"
    aria-label="Silo"
    :width="size"
    :height="size"
    viewBox="0 0 128 128"
    class="shrink-0"
    :style="{ borderRadius: `${radius}px` }"
  >
    <rect width="128" height="128" fill="#14121A" />
    <path
      d="M45.648 105.304V93.784H34V80.856H46.928V92.504H80.464V70.488H45.648V58.968H34V34.648H45.648V23H81.744V34.648H93.52V47.448H80.464V35.928H46.928V57.816H81.744V69.208H93.52V93.784H81.744V105.304H45.648Z"
      fill="#fff"
    />
  </svg>
</template>
