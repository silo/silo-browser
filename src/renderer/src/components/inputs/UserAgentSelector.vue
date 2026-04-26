<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { UA_PRESETS, matchPreset } from '@renderer/utils/user-agent-presets'

const props = withDefaults(
  defineProps<{
    modelValue: string
    defaultLabel?: string
    variant?: 'surface' | 'chrome'
  }>(),
  { defaultLabel: 'Use default', variant: 'surface' }
)

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

// 'custom' must be tracked separately from value: when user picks Custom and
// the textarea is still empty, matchPreset('') returns '' (default), so we'd
// otherwise lose the user's intent and snap back to the Default option.
const mode = ref(matchPreset(props.modelValue))

watch(
  () => props.modelValue,
  (val) => {
    const matched = matchPreset(val)
    if (mode.value !== 'custom' || matched !== 'custom') {
      mode.value = matched
    }
  }
)

function onPresetChange(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  mode.value = value
  if (value === '') {
    emit('update:modelValue', '')
  } else if (value !== 'custom') {
    const preset = UA_PRESETS.find((p) => p.id === value)
    if (preset) emit('update:modelValue', preset.value)
  }
}

function onTextInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}

const isChrome = computed(() => props.variant === 'chrome')

const selectClasses = computed(() =>
  isChrome.value
    ? 'px-2 py-1 bg-chrome-hover/50 border border-chrome-border rounded text-sm text-chrome-fg-secondary cursor-pointer focus:outline-none focus:border-accent'
    : 'w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-sm focus:outline-none focus:border-accent-soft'
)

const textareaClasses = computed(() =>
  isChrome.value
    ? 'w-full px-2 py-1 bg-chrome-hover/50 border border-chrome-border rounded text-xs text-chrome-fg-secondary font-mono focus:outline-none focus:border-accent resize-none'
    : 'w-full px-3 py-2 bg-surface-input border border-border-light rounded text-fg-primary text-xs font-mono focus:outline-none focus:border-accent-soft resize-none'
)
</script>

<template>
  <div class="flex flex-col gap-2">
    <select :value="mode" @change="onPresetChange" :class="selectClasses">
      <option value="">{{ defaultLabel }}</option>
      <option v-for="preset in UA_PRESETS" :key="preset.id" :value="preset.id">
        {{ preset.label }}
      </option>
      <option value="custom">Custom…</option>
    </select>
    <textarea
      v-if="mode === 'custom'"
      :value="modelValue"
      @input="onTextInput"
      rows="3"
      placeholder="Paste a custom user agent string"
      :class="textareaClasses"
    ></textarea>
  </div>
</template>
