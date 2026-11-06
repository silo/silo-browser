<script setup lang="ts">
import { computed } from 'vue'
import type { GroupItem } from '@renderer/types'
import { siloIconOf, siloIconPath, siloInitial } from '@renderer/utils/silo-icons'

/**
 * A silo's colored tile: letter, emoji, built-in icon or uploaded logo.
 * `ring` draws the "active silo" ring (gap in `ringGap` color, then the silo color).
 */
const props = withDefaults(
  defineProps<{
    silo: Pick<GroupItem, 'name' | 'color' | 'icon'>
    size?: number
    radius?: number
    ring?: boolean
    ringGap?: string
    ringWidth?: number
  }>(),
  { size: 20, radius: undefined, ring: false, ringGap: 'var(--chrome)', ringWidth: 1.5 }
)

const icon = computed(() => siloIconOf(props.silo))
const iconPath = computed(() => (icon.value.kind === 'icon' ? siloIconPath(icon.value.value) : null))
const letter = computed(() => siloInitial(props.silo))

const style = computed(() => {
  const r = props.radius ?? Math.round(props.size * 0.3)
  return {
    width: `${props.size}px`,
    height: `${props.size}px`,
    borderRadius: `${r}px`,
    background: props.silo.color,
    boxShadow: props.ring
      ? `0 0 0 2px ${props.ringGap}, 0 0 0 ${2 + props.ringWidth}px ${props.silo.color}`
      : 'none'
  }
})
</script>

<template>
  <span
    aria-hidden="true"
    class="relative flex shrink-0 items-center justify-center overflow-hidden font-display font-bold text-white transition-[box-shadow] duration-200"
    :style="style"
  >
    <img
      v-if="icon.kind === 'image'"
      :src="icon.value"
      alt=""
      class="h-[76%] w-[76%] object-contain"
      draggable="false"
    />
    <span
      v-else-if="icon.kind === 'emoji'"
      class="leading-none"
      :style="{ fontSize: `${Math.round(size * 0.58)}px` }"
    >
      {{ icon.value }}
    </span>
    <svg
      v-else-if="iconPath"
      :width="Math.round(size * 0.56)"
      :height="Math.round(size * 0.56)"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#FFFFFF"
      stroke-width="2.3"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path :d="iconPath" />
    </svg>
    <span
      v-else
      class="leading-none"
      :style="{ fontSize: `${Math.round((4 + size * 0.34) * (letter.length > 1 ? 0.8 : 1))}px` }"
    >
      {{ letter }}
    </span>
  </span>
</template>
