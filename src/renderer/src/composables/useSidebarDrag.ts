import { ref, computed } from 'vue'

type DragItemType = 'tab' | 'group'
type DropPosition = 'before' | 'after' | 'inside'

// Module-level reactive refs — shared singleton across all components
const dragType = ref<DragItemType | null>(null)
const dragId = ref<string | null>(null)
const dragGroupId = ref<string | null>(null)

const dropTargetId = ref<string | null>(null)
const dropTargetType = ref<DragItemType | null>(null)
const dropPosition = ref<DropPosition | null>(null)

export function useSidebarDrag() {
  function startTabDrag(tabId: string, groupId: string): void {
    dragType.value = 'tab'
    dragId.value = tabId
    dragGroupId.value = groupId
  }

  function startGroupDrag(groupId: string): void {
    dragType.value = 'group'
    dragId.value = groupId
    dragGroupId.value = null
  }

  function updateDropTarget(id: string, type: DragItemType, position: DropPosition): void {
    dropTargetId.value = id
    dropTargetType.value = type
    dropPosition.value = position
  }

  function clearDropTarget(): void {
    dropTargetId.value = null
    dropTargetType.value = null
    dropPosition.value = null
  }

  function reset(): void {
    dragType.value = null
    dragId.value = null
    dragGroupId.value = null
    clearDropTarget()
  }

  function positionFromEvent(e: DragEvent, el: HTMLElement): 'before' | 'after' {
    const rect = el.getBoundingClientRect()
    const midY = rect.top + rect.height / 2
    return e.clientY < midY ? 'before' : 'after'
  }

  const isDragging = computed(() => dragType.value !== null)
  const isDraggingTab = computed(() => dragType.value === 'tab')
  const isDraggingGroup = computed(() => dragType.value === 'group')

  return {
    dragType,
    dragId,
    dragGroupId,
    dropTargetId,
    dropTargetType,
    dropPosition,
    isDragging,
    isDraggingTab,
    isDraggingGroup,
    startTabDrag,
    startGroupDrag,
    updateDropTarget,
    clearDropTarget,
    reset,
    positionFromEvent
  }
}
