<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import DialogShell from '@renderer/components/common/DialogShell.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import TabIcon from '@renderer/components/common/TabIcon.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Design board "C · Add tab": URL + detected name, and which logins the tab will share.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const url = ref('')
const name = ref('')
const nameEdited = ref(false)

const silo = computed(() =>
  uiStore.addTabTargetGroupId ? groupsStore.findGroup(uiStore.addTabTargetGroupId) : null
)

function normalizeUrl(input: string): string {
  const trimmed = input.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

const host = computed(() => {
  if (!url.value.trim()) return ''
  try {
    return new URL(normalizeUrl(url.value)).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
})

// Auto-derive the name from the hostname until the user types their own
watch(host, (h) => {
  if (nameEdited.value) return
  const base = h.split('.')[0] ?? ''
  name.value = base ? base.charAt(0).toUpperCase() + base.slice(1) : ''
})

const isDetected = computed(() => !nameEdited.value && !!name.value)

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

const sharingNote = computed(() => {
  if (!silo.value) return ''
  const siblings = [...silo.value.tabs].sort((a, b) => a.order - b.order).map((t) => t.name)
  const others = groupsStore.sortedGroups.filter((g) => g.id !== silo.value!.id).map((g) => g.name)
  const shown = siblings.length > 3 ? [...siblings.slice(0, 3), `${siblings.length - 3} more`] : siblings
  const first = siblings.length
    ? `Shares logins with ${listNames(shown)}.`
    : `The first tab in ${silo.value.name} — it gets its own logins.`
  const second = others.length ? ` Nothing crosses over to ${listNames(others)}.` : ''
  return first + second
})

function submit(): void {
  const trimmedUrl = url.value.trim()
  if (!trimmedUrl || !silo.value) return
  const tab = groupsStore.addTab(silo.value.id, name.value.trim() || host.value || trimmedUrl, normalizeUrl(trimmedUrl))
  groupsStore.activateTab(tab.id)
  close()
}

function close(): void {
  uiStore.closeAddTabDialog()
}
</script>

<template>
  <DialogShell title="Add tab" @close="close" @submit="submit">
    <template #badge>
      <span
        v-if="silo"
        class="flex h-[22px] items-center gap-1.5 rounded-md pr-2 pl-1 text-[12px] font-semibold"
        :style="{ background: `color-mix(in srgb, ${silo.color} 14%, transparent)` }"
      >
        <SiloTile :silo="silo" :size="16" :radius="4" />
        to {{ silo.name }}
      </span>
    </template>

    <div class="flex flex-col gap-1.5">
      <label for="add-tab-url" class="text-[12.5px] font-semibold text-fg2">URL</label>
      <div class="field-input flex items-center gap-2">
        <AppIcon name="globe" :size="14" class="text-fg3" />
        <input
          id="add-tab-url"
          v-model="url"
          type="text"
          autofocus
          spellcheck="false"
          autocomplete="off"
          placeholder="e.g. mail.google.com"
          class="h-full min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-fg1 outline-none placeholder:text-fg3"
        />
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label for="add-tab-name" class="text-[12.5px] font-semibold text-fg2">Name</label>
      <div class="field-input flex items-center gap-[9px] pl-2">
        <TabIcon
          v-if="host"
          :name="name || host"
          :url="normalizeUrl(url)"
          :size="20"
        />
        <span
          v-else
          aria-hidden="true"
          class="h-5 w-5 shrink-0 rounded-[5px] border-[1.5px] border-dashed border-fg3"
        />
        <input
          id="add-tab-name"
          v-model="name"
          type="text"
          autocomplete="off"
          placeholder="Detected from the URL"
          class="h-full min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-fg1 outline-none placeholder:text-fg3"
          @input="nameEdited = true"
        />
        <span v-if="isDetected" class="text-[11.5px] text-fg3">Detected</span>
      </div>
    </div>

    <p v-if="sharingNote" class="m-0 flex items-start gap-2 text-[12px] leading-[1.45] text-fg2">
      <AppIcon name="shield" :size="14" class="mt-px text-fg3" />
      <span>{{ sharingNote }}</span>
    </p>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="!url.trim()">
        Add tab <kbd class="text-[10.5px] opacity-85">↵</kbd>
      </button>
    </template>
  </DialogShell>
</template>
