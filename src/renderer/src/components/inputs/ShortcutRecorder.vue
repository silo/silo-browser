<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import {
  acceleratorFromEvent,
  formatAccelerator,
  isAltGrRisk,
  normalizeAccelerator,
  reservedLabel
} from '@renderer/utils/accelerator'
import AppIcon from '@renderer/components/common/AppIcon.vue'

/**
 * Click, then press a key combination. The value is an Electron accelerator
 * ("Control+Alt+G"), or '' for none (the tab then keeps its position shortcut).
 */
const props = withDefaults(
  defineProps<{
    modelValue: string
    /** The tab being edited — other tabs' shortcuts count as conflicts, its own doesn't */
    tabId: string
    placeholder?: string
    label?: string
  }>(),
  { placeholder: 'None', label: 'Shortcut' }
)
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const groupsStore = useGroupsStore()
const recording = ref(false)
const error = ref('')
const buttonRef = ref<HTMLButtonElement | null>(null)

const display = computed(() => (props.modelValue ? formatAccelerator(props.modelValue) : ''))
const altGrWarning = computed(() => !!props.modelValue && isAltGrRisk(props.modelValue))

function start(): void {
  error.value = ''
  recording.value = true
  nextTick(() => buttonRef.value?.focus())
}

function stop(): void {
  recording.value = false
}

function conflict(acc: string): string | null {
  const reserved = reservedLabel(acc)
  if (reserved) return `Used by “${reserved}”`
  const normalized = normalizeAccelerator(acc)
  const other = groupsStore.allTabsFlat.find(
    (t) => t.id !== props.tabId && t.shortcut && normalizeAccelerator(t.shortcut) === normalized
  )
  return other ? `Used by the “${other.name}” tab` : null
}

function onKeydown(e: KeyboardEvent): void {
  if (!recording.value) return
  // Swallow everything while recording, so the keys don't trigger Silo's own shortcuts
  e.preventDefault()
  e.stopPropagation()
  const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
  if (plain && e.key === 'Escape') return stop()
  if (plain && (e.key === 'Backspace' || e.key === 'Delete')) {
    emit('update:modelValue', '')
    return stop()
  }
  const result = acceleratorFromEvent(e)
  if (result.kind === 'pending') return
  if (result.kind === 'invalid') {
    error.value = result.message
    return
  }
  const taken = conflict(result.accelerator)
  if (taken) {
    error.value = `${formatAccelerator(result.accelerator)} — ${taken}`
    return
  }
  error.value = ''
  emit('update:modelValue', result.accelerator)
  stop()
}

function clear(): void {
  error.value = ''
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="flex flex-col items-end gap-1">
    <div class="flex items-center gap-1">
      <button
        ref="buttonRef"
        type="button"
        class="field-input flex h-8 min-w-[132px] items-center justify-center gap-1.5 px-2.5 text-[12.5px]"
        :class="recording ? 'text-accent-txt shadow-[inset_0_0_0_2px_var(--accent)]' : ''"
        :aria-label="
          recording
            ? `${label}: press a key combination, Escape to cancel`
            : `${label}: ${display || placeholder}. Click to change`
        "
        @click="recording ? stop() : start()"
        @keydown="onKeydown"
        @blur="stop"
      >
        <template v-if="recording">Press keys…</template>
        <kbd v-else-if="display" class="font-mono text-[12px] text-fg1">{{ display }}</kbd>
        <span v-else class="text-fg3">{{ placeholder }}</span>
      </button>
      <button
        v-if="modelValue && !recording"
        type="button"
        class="flex h-7 w-7 items-center justify-center rounded-lg text-fg3 transition-colors hover:bg-hover hover:text-fg1"
        :aria-label="`Remove ${label.toLowerCase()}`"
        title="Remove"
        @click="clear"
      >
        <AppIcon name="close" :size="11" :stroke="2.4" />
      </button>
    </div>
    <span v-if="error" role="alert" class="text-[11.5px] text-badge">{{ error }}</span>
    <span v-else-if="altGrWarning" class="max-w-[240px] text-right text-[11.5px] text-fg3">
      Ctrl+Alt is AltGr on many keyboards, so this can block typing characters like @ or €.
    </span>
  </div>
</template>
