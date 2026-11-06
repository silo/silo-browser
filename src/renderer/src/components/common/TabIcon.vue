<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/** A tab's icon: emoji, favicon, or a colored letter tile when there is no favicon. */
const props = withDefaults(
  defineProps<{
    name: string
    url?: string
    iconUrl?: string
    iconEmoji?: string
    size?: number
    dim?: boolean
  }>(),
  { url: '', iconUrl: undefined, iconEmoji: undefined, size: 18, dim: false }
)

const LETTER_COLORS = [
  '#C5221F',
  '#1D5FD1',
  '#0F6FB8',
  '#C2410C',
  '#0B7A55',
  '#A16207',
  '#6E3BCB',
  '#232326',
  '#B42318',
  '#0F766E'
]

const failed = ref(false)

const faviconUrl = computed(() => {
  if (props.iconUrl) return props.iconUrl
  try {
    const host = new URL(props.url).hostname
    if (!host) return null
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`
  } catch {
    return null
  }
})

watch(faviconUrl, () => {
  failed.value = false
})

const letter = computed(() => Array.from(props.name.trim())[0]?.toUpperCase() ?? '?')
const tileColor = computed(() => {
  let h = 0
  for (const ch of props.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return LETTER_COLORS[h % LETTER_COLORS.length]
})

const radius = computed(() => `${Math.round(props.size * 0.28)}px`)
</script>

<template>
  <span
    aria-hidden="true"
    class="flex shrink-0 items-center justify-center overflow-hidden transition-opacity"
    :style="{ width: `${size}px`, height: `${size}px`, borderRadius: radius, opacity: dim ? 0.5 : 1 }"
  >
    <span v-if="iconEmoji" class="leading-none" :style="{ fontSize: `${Math.round(size * 0.85)}px` }">
      {{ iconEmoji }}
    </span>
    <img
      v-else-if="faviconUrl && !failed"
      :src="faviconUrl"
      alt=""
      class="h-full w-full object-contain"
      draggable="false"
      @error="failed = true"
    />
    <span
      v-else
      class="flex h-full w-full items-center justify-center font-semibold text-white"
      :style="{ background: tileColor, fontSize: `${Math.round(size * 0.56)}px` }"
    >
      {{ letter }}
    </span>
  </span>
</template>
