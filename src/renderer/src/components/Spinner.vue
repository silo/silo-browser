<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Tailwind size class set, e.g. 'w-4 h-4' (default) or 'w-3 h-3'. */
    size?: string
    /** Tailwind text-* class controlling stroke colour. Inherits if omitted. */
    color?: string
  }>(),
  {
    size: 'w-4 h-4',
    color: ''
  }
)
</script>

<template>
  <svg
    :class="['animate-spin shrink-0', size, color]"
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Zm2 5.291A7.962 7.962 0 0 1 4 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647Z"
    />
  </svg>
</template>
