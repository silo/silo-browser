<script setup lang="ts">
import { computed, ref } from 'vue'
import { useUiStore } from '@renderer/stores/ui'
import DialogShell from '@renderer/components/common/DialogShell.vue'

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
</script>

<template>
  <DialogShell
    :title="`Share your screen with ${host}`"
    :width="640"
    @close="cancel"
    @submit="share"
  >
    <div class="thin-scroll -mx-1 flex max-h-[min(60vh,520px)] flex-col gap-5 overflow-y-auto px-1">
      <template
        v-for="section in [
          { title: 'Entire screen', items: screens },
          { title: 'Window', items: windows }
        ]"
        :key="section.title"
      >
        <div v-if="section.items.length" class="flex flex-col gap-2">
          <h3 class="m-0 text-[11px] font-semibold tracking-[0.04em] text-fg3 uppercase">
            {{ section.title }}
          </h3>
          <div class="grid grid-cols-3 gap-2.5">
            <button
              v-for="source in section.items"
              :key="source.id"
              type="button"
              :aria-pressed="selectedId === source.id"
              class="flex flex-col gap-1.5 rounded-[10px] p-2 text-left transition-[background-color,box-shadow]"
              :class="
                selectedId === source.id
                  ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]'
                  : 'shadow-[inset_0_0_0_1px_var(--field-line)] hover:bg-hover'
              "
              @click="selectedId = source.id"
              @dblclick="share"
            >
              <img
                :src="source.thumbnail"
                alt=""
                class="aspect-video w-full rounded-md bg-field object-contain"
              />
              <span class="truncate text-[12px] text-fg2">{{ source.name }}</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="cancel">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="!selectedId" autofocus>Share</button>
    </template>
  </DialogShell>
</template>
