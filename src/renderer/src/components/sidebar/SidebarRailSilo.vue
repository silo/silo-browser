<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import { useGroupDnd } from '@renderer/composables/useSidebarDnd'
import { formatBadge, siloUnread, useSiloMenus } from '@renderer/composables/useSiloMenus'
import type { GroupItem } from '@renderer/types'
import SiloTile from '@renderer/components/common/SiloTile.vue'

// One silo button on the rail (design board "C · Main — rail + list").
const props = defineProps<{ group: GroupItem; selected: boolean }>()
const emit = defineEmits<{ select: [] }>()

const uiStore = useUiStore()
const { openSiloMenu } = useSiloMenus()

const el = ref<HTMLElement | null>(null)
const dnd = useGroupDnd(() => props.group, el)
const unread = computed(() => siloUnread(props.group))

function showTooltip(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const n = props.group.tabs.length
  const sub = [`${n} ${n === 1 ? 'tab' : 'tabs'}`, unread.value ? `${unread.value} unread` : '']
    .filter(Boolean)
    .join(' · ')
  uiStore.showSidebarTooltip(props.group.name, rect.right + 10, rect.top + rect.height / 2, sub)
}
</script>

<template>
  <div
    class="relative flex w-16 justify-center transition-opacity"
    :class="dnd.isBeingDragged.value ? 'opacity-40' : ''"
  >
    <span
      aria-hidden="true"
      class="absolute top-[9px] left-0 h-[18px] w-[3px] rounded-r-[3px] bg-fg1 transition-opacity duration-200"
      :class="selected ? 'opacity-100' : 'opacity-0'"
    />
    <div
      v-if="dnd.indicatorBefore.value"
      class="pointer-events-none absolute -top-1.5 right-3 left-3 h-0.5 rounded-full bg-accent"
    />
    <button
      ref="el"
      type="button"
      draggable="true"
      class="relative rounded-[18px] transition-transform active:scale-95"
      :class="dnd.isDropHighlighted.value ? 'scale-110' : ''"
      :aria-label="`${group.name} silo` + (unread ? `, ${unread} unread` : '')"
      :aria-pressed="selected"
      @click="emit('select')"
      @contextmenu="openSiloMenu($event, group)"
      @mouseenter="showTooltip"
      @mouseleave="uiStore.hideSidebarTooltip()"
      @dragstart="dnd.onHeaderDragstart"
      @dragover="dnd.onHeaderDragover"
      @drop="dnd.onHeaderDrop"
      @dragend="dnd.onDragend"
      @dragleave="dnd.onDragleave"
    >
      <SiloTile
        :silo="group"
        :size="36"
        :radius="selected ? 11 : 18"
        :ring="selected"
        ring-gap="var(--rail)"
        class="transition-[border-radius] duration-200"
      />
      <span
        v-if="unread"
        aria-hidden="true"
        class="absolute -top-[5px] -right-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-[9px] border-2 border-rail bg-badge px-1 text-[10px] font-semibold text-white"
      >
        {{ formatBadge(unread) }}
      </span>
    </button>
    <div
      v-if="dnd.indicatorAfter.value"
      class="pointer-events-none absolute right-3 -bottom-1.5 left-3 h-0.5 rounded-full bg-accent"
    />
  </div>
</template>
