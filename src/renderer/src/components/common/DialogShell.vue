<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * Modal panel used by every dialog (design boards "C · Add tab", "Edit silo").
 * Submitting the form (Enter in a field, or a type="submit" button) emits `submit`.
 */
withDefaults(defineProps<{ title: string; width?: number }>(), { width: 420 })
const emit = defineEmits<{ close: []; submit: []; paste: [e: ClipboardEvent] }>()

const formRef = ref<HTMLFormElement | null>(null)
const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`

onMounted(() => {
  nextTick(() => {
    const form = formRef.value
    const first =
      form?.querySelector<HTMLElement>('[autofocus]') ??
      form?.querySelector<HTMLElement>('input, textarea, select')
    ;(first ?? form)?.focus()
  })
})
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim px-4 pt-[min(112px,12vh)] pb-4 backdrop-blur-[2px]"
      @mousedown.self="emit('close')"
    >
      <form
        ref="formRef"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        class="flex w-full flex-col rounded-2xl bg-panel shadow-dialog outline-none"
        :style="{ maxWidth: `${width}px` }"
        @submit.prevent="emit('submit')"
        @keydown.esc.stop.prevent="emit('close')"
        @paste="emit('paste', $event)"
      >
        <div class="flex items-center gap-2 pt-4 pr-3.5 pb-1 pl-[18px]">
          <h2
            :id="titleId"
            class="m-0 font-display text-[18px] font-bold tracking-[-0.02em] text-fg1"
          >
            {{ title }}
          </h2>
          <slot name="badge" />
          <button
            type="button"
            class="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-fg3 transition-colors hover:bg-hover hover:text-fg1"
            aria-label="Close"
            @click="emit('close')"
          >
            <AppIcon name="close" :size="13" :stroke="2.4" />
          </button>
        </div>
        <div class="flex flex-col gap-3.5 px-[18px] pt-3 pb-[18px]">
          <slot />
        </div>
        <div class="flex items-center justify-end gap-1.5 border-t border-line px-3.5 pt-3 pb-3.5">
          <slot name="footer" />
        </div>
      </form>
    </div>
  </Teleport>
</template>
