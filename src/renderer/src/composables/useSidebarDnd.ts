import { computed, type ComputedRef, type Ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useSidebarDrag } from './useSidebarDrag'
import type { GroupItem, TabItem } from '@renderer/types'

// Drag-and-drop handlers for sidebar rows, shared by every sidebar layout
// (expanded, collapsed and rail). Payloads are JSON: { type: 'tab' | 'group', id }.

function readPayload(e: DragEvent): { type: string; id: string } | null {
  const raw = e.dataTransfer?.getData('text/plain')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export interface TabDnd {
  isBeingDragged: ComputedRef<boolean>
  indicatorBefore: ComputedRef<boolean>
  indicatorAfter: ComputedRef<boolean>
  onDragstart: (e: DragEvent) => void
  onDragover: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onDragend: () => void
  onDragleave: (e: DragEvent) => void
}

export function useTabDnd(tab: () => TabItem, el: Ref<HTMLElement | null>): TabDnd {
  const groupsStore = useGroupsStore()
  const drag = useSidebarDrag()

  const isTarget = (pos: 'before' | 'after'): boolean =>
    drag.dropTargetId.value === tab().id &&
    drag.dropTargetType.value === 'tab' &&
    drag.dropPosition.value === pos &&
    drag.dragId.value !== tab().id

  return {
    isBeingDragged: computed(() => drag.isDraggingTab.value && drag.dragId.value === tab().id),
    indicatorBefore: computed(() => isTarget('before')),
    indicatorAfter: computed(() => isTarget('after')),
    onDragstart(e) {
      e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'tab', id: tab().id }))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      // Delay so the browser captures the ghost image before the row fades
      requestAnimationFrame(() => drag.startTabDrag(tab().id, tab().groupId))
    },
    onDragover(e) {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (!el.value || !drag.isDraggingTab.value) return
      drag.updateDropTarget(tab().id, 'tab', drag.positionFromEvent(e, el.value))
    },
    onDrop(e) {
      e.preventDefault()
      e.stopPropagation()
      const data = readPayload(e)
      if (data?.type === 'tab' && data.id !== tab().id) {
        const pos = el.value ? drag.positionFromEvent(e, el.value) : 'after'
        const targetOrder = pos === 'before' ? tab().order : tab().order + 1
        groupsStore.moveTab(data.id, tab().groupId, targetOrder)
      }
      drag.reset()
    },
    onDragend() {
      drag.reset()
    },
    onDragleave(e) {
      if (!el.value?.contains(e.relatedTarget as Node | null) && drag.dropTargetId.value === tab().id) {
        drag.clearDropTarget()
      }
    }
  }
}

export interface GroupDnd {
  isBeingDragged: ComputedRef<boolean>
  isDropHighlighted: ComputedRef<boolean>
  indicatorBefore: ComputedRef<boolean>
  indicatorAfter: ComputedRef<boolean>
  onHeaderDragstart: (e: DragEvent) => void
  onHeaderDragover: (e: DragEvent) => void
  onHeaderDrop: (e: DragEvent) => void
  onBodyDragover: (e: DragEvent) => void
  onBodyDrop: (e: DragEvent) => void
  onDragend: () => void
  onDragleave: (e: DragEvent) => void
}

/** `header` is the element used to decide before/after when reordering silos. */
export function useGroupDnd(group: () => GroupItem, header: Ref<HTMLElement | null>): GroupDnd {
  const groupsStore = useGroupsStore()
  const drag = useSidebarDrag()

  const isTarget = (pos: 'before' | 'after'): boolean =>
    drag.isDraggingGroup.value &&
    drag.dropTargetId.value === group().id &&
    drag.dropTargetType.value === 'group' &&
    drag.dropPosition.value === pos &&
    drag.dragId.value !== group().id

  return {
    isBeingDragged: computed(() => drag.isDraggingGroup.value && drag.dragId.value === group().id),
    isDropHighlighted: computed(
      () =>
        drag.isDraggingTab.value &&
        drag.dropTargetId.value === group().id &&
        drag.dropTargetType.value === 'group' &&
        drag.dropPosition.value === 'inside'
    ),
    indicatorBefore: computed(() => isTarget('before')),
    indicatorAfter: computed(() => isTarget('after')),
    onHeaderDragstart(e) {
      e.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'group', id: group().id }))
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      requestAnimationFrame(() => drag.startGroupDrag(group().id))
    },
    onHeaderDragover(e) {
      e.preventDefault()
      e.stopPropagation()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (drag.isDraggingTab.value) {
        drag.updateDropTarget(group().id, 'group', 'inside')
      } else if (drag.isDraggingGroup.value && drag.dragId.value !== group().id && header.value) {
        drag.updateDropTarget(group().id, 'group', drag.positionFromEvent(e, header.value))
      }
    },
    onHeaderDrop(e) {
      e.preventDefault()
      e.stopPropagation()
      const data = readPayload(e)
      if (data?.type === 'tab') {
        groupsStore.moveTab(data.id, group().id, group().tabs.length)
      } else if (data?.type === 'group' && data.id !== group().id) {
        const pos = header.value ? drag.positionFromEvent(e, header.value) : 'after'
        groupsStore.moveGroup(data.id, pos === 'before' ? group().order : group().order + 1)
      }
      drag.reset()
    },
    onBodyDragover(e) {
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
      if (drag.isDraggingTab.value) drag.updateDropTarget(group().id, 'group', 'inside')
    },
    onBodyDrop(e) {
      e.preventDefault()
      const data = readPayload(e)
      if (data?.type === 'tab') groupsStore.moveTab(data.id, group().id, group().tabs.length)
      drag.reset()
    },
    onDragend() {
      drag.reset()
    },
    onDragleave(e) {
      if (
        !header.value?.contains(e.relatedTarget as Node | null) &&
        drag.dropTargetId.value === group().id &&
        drag.dropTargetType.value === 'group'
      ) {
        drag.clearDropTarget()
      }
    }
  }
}
