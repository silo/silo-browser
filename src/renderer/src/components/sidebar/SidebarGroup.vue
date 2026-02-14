<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import type { GroupItem, ContextMenuEntry } from '@renderer/types'
import SidebarTab from './SidebarTab.vue'
import AddTabButton from './AddTabButton.vue'

const props = defineProps<{ group: GroupItem }>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

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

function handleDragOver(e: DragEvent): void {
  e.preventDefault()
  e.dataTransfer!.dropEffect = 'move'
}

function handleDropOnGroup(e: DragEvent): void {
  e.preventDefault()
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) return
  try {
    const data = JSON.parse(raw)
    if (data.type === 'tab') {
      groupsStore.moveTab(data.id, props.group.id, props.group.tabs.length)
    } else if (data.type === 'group' && data.id !== props.group.id) {
      groupsStore.moveGroup(data.id, props.group.order)
    }
  } catch {
    // ignore
  }
}

function handleGroupDragStart(e: DragEvent): void {
  e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'group', id: props.group.id }))
  e.dataTransfer!.effectAllowed = 'move'
}
</script>

<template>
  <div
    class="mb-1"
    :style="{ borderLeftColor: group.color }"
    style="border-left-width: 3px"
    @dragover="handleDragOver"
    @drop="handleDropOnGroup"
  >
    <div
      class="flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-gray-700/50 transition-colors"
      @click="groupsStore.toggleGroupCollapse(group.id)"
      @contextmenu="handleContextMenu"
      draggable="true"
      @dragstart="handleGroupDragStart"
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

    <div v-show="!group.isCollapsed" class="pb-1">
      <SidebarTab v-for="tab in group.tabs" :key="tab.id" :tab="tab" />
      <AddTabButton v-if="!uiStore.sidebarExpanded" :group-id="group.id" />
    </div>
  </div>
</template>
