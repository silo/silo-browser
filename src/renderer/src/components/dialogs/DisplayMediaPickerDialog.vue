<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import { useUiStore } from '@renderer/stores/ui'

const uiStore = useUiStore()

const request = computed(() => uiStore.displayMediaPick)
const screens = computed(() => request.value?.sources.filter((s) => s.isScreen) ?? [])
const windows = computed(() => request.value?.sources.filter((s) => !s.isScreen) ?? [])
const selectedId = ref<string | null>(screens.value[0]?.id ?? null)

const host = computed(() => {
  const origin = request.value?.origin ?? ''
  try {
    return new URL(origin).host || origin
  } catch {
    return origin
  }
})

function share(): void {
  if (selectedId.value) uiStore.respondToDisplayMediaPick(selectedId.value)
}

function cancel(): void {
  uiStore.respondToDisplayMediaPick(null)
}

const dialogRef = ref<HTMLElement | null>(null)

onMounted(() => {
  nextTick(() => dialogRef.value?.focus())
})
</script>

<template>
  <Teleport to="body">
    <div
      ref="dialogRef"
      class="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      tabindex="-1"
      @click.self="cancel"
      @keydown.enter="share"
    >
      <div
        class="bg-surface-raised rounded-lg shadow-xl border border-border-default w-[640px] max-h-[80vh] flex flex-col"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-6 py-4 border-b border-border-default">
          <h2 class="text-lg font-semibold text-fg-primary">
            Share your screen with <span class="text-fg-secondary">{{ host }}</span>
          </h2>
          <button class="text-fg-muted hover:text-fg-primary transition-colors" @click="cancel">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              class="w-5 h-5"
            >
              <path
                d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z"
              />
            </svg>
          </button>
        </div>

        <!-- Sources -->
        <div class="px-6 py-5 overflow-y-auto">
          <template
            v-for="section in [
              { title: 'Entire screen', items: screens },
              { title: 'Window', items: windows }
            ]"
            :key="section.title"
          >
            <div v-if="section.items.length" class="mb-5 last:mb-0">
              <h3 class="text-xs font-semibold uppercase tracking-wide text-fg-muted mb-2">
                {{ section.title }}
              </h3>
              <div class="grid grid-cols-3 gap-3">
                <button
                  v-for="source in section.items"
                  :key="source.id"
                  class="flex flex-col gap-1.5 p-2 rounded border text-left transition-colors"
                  :class="
                    selectedId === source.id
                      ? 'border-accent bg-surface-active'
                      : 'border-border-default hover:bg-surface-hover'
                  "
                  @click="selectedId = source.id"
                  @dblclick="share"
                >
                  <img
                    :src="source.thumbnail"
                    alt=""
                    class="w-full aspect-video object-contain bg-surface-base rounded"
                  />
                  <span class="text-xs text-fg-secondary truncate">{{ source.name }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-default">
          <button
            class="px-4 py-2 text-sm text-fg-secondary hover:text-fg-primary bg-surface-hover hover:bg-surface-active rounded transition-colors"
            @click="cancel"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 text-sm text-white bg-accent hover:bg-accent-hover rounded transition-colors disabled:opacity-50"
            :disabled="!selectedId"
            @click="share"
          >
            Share
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
