<script setup lang="ts">
import { ref, watch } from 'vue'
import { UA_PRESETS, matchPreset } from '@renderer/utils/user-agent-presets'

const props = withDefaults(
  defineProps<{
    modelValue: string
    defaultLabel?: string
    /** Stretch the dropdown to the container width (dialogs) instead of fitting its text */
    block?: boolean
  }>(),
  { defaultLabel: 'Use default', block: false }
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

</script>

<template>
  <div class="flex flex-col items-stretch gap-2" :class="block ? 'w-full' : 'items-end'">
    <select
      :value="mode"
      class="select-field max-w-full"
      :class="block ? 'w-full' : ''"
      aria-label="User agent"
      @change="onPresetChange"
    >
      <option value="">{{ defaultLabel }}</option>
      <option v-for="preset in UA_PRESETS" :key="preset.id" :value="preset.id">
        {{ preset.label }}
      </option>
      <option value="custom">Custom…</option>
    </select>
    <textarea
      v-if="mode === 'custom'"
      :value="modelValue"
      rows="3"
      aria-label="Custom user agent"
      placeholder="Paste a custom user agent string"
      class="w-full min-w-[260px] resize-none rounded-[9px] border-0 bg-input px-2.5 py-2 font-mono text-[11.5px] text-fg1 shadow-[inset_0_0_0_1px_var(--input-line)] outline-none placeholder:text-fg3 focus:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_3px_var(--accent-soft)]"
      @input="onTextInput"
    ></textarea>
  </div>
</template>
