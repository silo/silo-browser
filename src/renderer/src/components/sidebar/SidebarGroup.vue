<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useSidebarDrag } from '@renderer/composables/useSidebarDrag'
import type { GroupItem, ContextMenuEntry } from '@renderer/types'
import SidebarTab from './SidebarTab.vue'
import AddTabButton from './AddTabButton.vue'

const props = defineProps<{ group: GroupItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const drag = useSidebarDrag()

const groupHeaderEl = ref<HTMLElement | null>(null)

const isBeingDragged = computed(
  () => drag.isDraggingGroup.value && drag.dragId.value === props.group.id
)

const isDropHighlighted = computed(
  () =>
    drag.isDraggingTab.value &&
    drag.dropTargetId.value === props.group.id &&
    drag.dropTargetType.value === 'group' &&
    drag.dropPosition.value === 'inside'
)

const showGroupIndicatorBefore = computed(
  () =>
    drag.isDraggingGroup.value &&
    drag.dropTargetId.value === props.group.id &&
    drag.dropTargetType.value === 'group' &&
    drag.dropPosition.value === 'before' &&
    drag.dragId.value !== props.group.id
)

const showGroupIndicatorAfter = computed(
  () =>
    drag.isDraggingGroup.value &&
    drag.dropTargetId.value === props.group.id &&
    drag.dropTargetType.value === 'group' &&
    drag.dropPosition.value === 'after' &&
    drag.dragId.value !== props.group.id
)

function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  const items: ContextMenuEntry[] = [
    { label: 'Edit Group...', action: () => uiStore.openEditGroupDialog(props.group.id) },
    { label: 'Add Tab...', action: () => uiStore.openAddTabDialog(props.group.id) },
    { separator: true },
    {
      label: 'Delete Group',
      action: () => groupsStore.removeGroup(props.group.id)
    }
  ]
  uiStore.showContextMenu(e.clientX, e.clientY, items)
}

function handleGroupDragStart(e: DragEvent): void {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'group', id: props.group.id }))
  e.dataTransfer!.effectAllowed = 'move'
  requestAnimationFrame(() => {
    drag.startGroupDrag(props.group.id)
  })
}

// Header-specific dragover: handles both tab-into-group and group reorder
function handleHeaderDragOver(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  e.dataTransfer!.dropEffect = 'move'

  if (drag.isDraggingTab.value) {
    drag.updateDropTarget(props.group.id, 'group', 'inside')
  } else if (drag.isDraggingGroup.value && drag.dragId.value !== props.group.id) {
    if (!groupHeaderEl.value) return
    const pos = drag.positionFromEvent(e, groupHeaderEl.value)
    drag.updateDropTarget(props.group.id, 'group', pos)
  }
}

// Header drop: handles both tab-into-group and group reorder
function handleHeaderDrop(e: DragEvent): void {
  e.preventDefault()
  e.stopPropagation()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) {
    drag.reset()
    return
  }
  try {
    const data = JSON.parse(raw)
    if (data.type === 'tab') {
      groupsStore.moveTab(data.id, props.group.id, props.group.tabs.length)
    } else if (data.type === 'group' && data.id !== props.group.id) {
      const pos = groupHeaderEl.value ? drag.positionFromEvent(e, groupHeaderEl.value) : 'after'
      const targetOrder = pos === 'before' ? props.group.order : props.group.order + 1
      groupsStore.moveGroup(data.id, targetOrder)
    }
  } catch {
    // ignore
  }
  drag.reset()
}

// Fallback dragover for the group body area (tab drops on empty space)
function handleBodyDragOver(e: DragEvent): void {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'

  if (drag.isDraggingTab.value) {
    drag.updateDropTarget(props.group.id, 'group', 'inside')
  }
}

// Fallback drop for the group body area
function handleBodyDrop(e: DragEvent): void {
  e.preventDefault()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) {
    drag.reset()
    return
  }
  try {
    const data = JSON.parse(raw)
    if (data.type === 'tab') {
      groupsStore.moveTab(data.id, props.group.id, props.group.tabs.length)
    }
  } catch {
    // ignore
  }
  drag.reset()
}

function handleDragEnd(): void {
  drag.reset()
}

function handleDragLeave(e: DragEvent): void {
  const relatedTarget = e.relatedTarget as HTMLElement | null
  if (!groupHeaderEl.value?.contains(relatedTarget)) {
    if (
      drag.dropTargetId.value === props.group.id &&
      drag.dropTargetType.value === 'group'
    ) {
      drag.clearDropTarget()
    }
  }
}
</script>

<template>
  <div
    class="mb-1 relative transition-opacity duration-200"
    :class="isBeingDragged ? 'opacity-40' : ''"
    :style="{ borderLeftColor: group.color }"
    style="border-left-width: 3px"
    @dragover="handleBodyDragOver"
    @drop="handleBodyDrop"
  >
    <!-- Group reorder indicator: before -->
    <div
      v-if="showGroupIndicatorBefore"
      class="absolute top-0 left-1 right-1 h-0.5 bg-blue-400 rounded-full z-10 pointer-events-none"
    />

    <div
      ref="groupHeaderEl"
      :class="[
        'flex items-center justify-between px-2 py-1.5 cursor-pointer transition-colors',
        isDropHighlighted
          ? 'bg-blue-500/20 ring-1 ring-blue-400/40 rounded'
          : 'hover:bg-gray-700/50'
      ]"
      @click="groupsStore.toggleGroupCollapse(group.id)"
      @contextmenu="handleContextMenu"
      draggable="true"
      @dragstart="handleGroupDragStart"
      @dragover.stop="handleHeaderDragOver"
      @drop.stop="handleHeaderDrop"
      @dragend="handleDragEnd"
      @dragleave="handleDragLeave"
    >
      <div class="flex items-center gap-1.5 min-w-0">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-3 h-3 text-gray-400 shrink-0 transition-transform duration-150"
          :class="group.isCollapsed ? '-rotate-90' : ''"
        >
          <path
            fill-rule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clip-rule="evenodd"
          />
        </svg>
        <span
          v-if="uiStore.sidebarExpanded"
          class="text-xs font-semibold text-gray-300 truncate uppercase tracking-wider"
        >
          {{ group.name }}
        </span>
      </div>
      <button
        v-if="uiStore.sidebarExpanded"
        @click.stop="uiStore.openAddTabDialog(group.id)"
        class="text-gray-500 hover:text-white text-sm leading-none shrink-0"
        title="Add tab"
      >
        +
      </button>
    </div>

    <TransitionGroup
      v-show="!group.isCollapsed"
      tag="div"
      name="tab-list"
      class="pb-1"
    >
      <SidebarTab v-for="tab in group.tabs" :key="tab.id" :tab="tab" />
      <AddTabButton v-if="!uiStore.sidebarExpanded" :group-id="group.id" :key="'add'" />
    </TransitionGroup>

    <!-- Group reorder indicator: after -->
    <div
      v-if="showGroupIndicatorAfter"
      class="absolute bottom-0 left-1 right-1 h-0.5 bg-blue-400 rounded-full z-10 pointer-events-none"
    />
  </div>
</template>
