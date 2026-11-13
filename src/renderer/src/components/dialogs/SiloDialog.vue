<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useSyncStore } from '@renderer/stores/sync'
import { isMac } from '@renderer/utils/platform'
import { SILO_COLORS } from '@renderer/utils/theme'
import {
  QUICK_EMOJIS,
  QUICK_ICONS,
  SILO_ICONS,
  imageFileToDataUrl,
  siloIconPath
} from '@renderer/utils/silo-icons'
import type { SiloIcon, SiloIconKind } from '@renderer/types'
import DialogShell from '@renderer/components/common/DialogShell.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import UserAgentSelector from '@renderer/components/inputs/UserAgentSelector.vue'

// New / Edit silo (website board "Make every silo yours"): name, icon (letter, emoji,
// built-in icon or uploaded logo), color and user agent.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const syncStore = useSyncStore()

const editing = computed(() =>
  uiStore.editGroupDialogOpen && uiStore.editGroupTargetId
    ? groupsStore.findGroup(uiStore.editGroupTargetId)
    : null
)

const existing = editing.value
const name = ref(existing?.name ?? '')
const color = ref(existing?.color ?? SILO_COLORS[groupsStore.groups.length % SILO_COLORS.length].hex)
const userAgent = ref(existing?.userAgent ?? '')
// Folder sync: off = this silo and its tabs stay on this computer only
const synced = ref(!existing?.localOnly)
const here = isMac ? 'this Mac' : 'this computer'
const syncHint = computed(() => {
  if (!syncStore.enabled) return `When sync is on (Settings). Off keeps it on ${here} only.`
  if (synced.value) return 'Its tabs and settings, never its logins'
  return existing && !existing.localOnly
    ? `Only on ${here}. Your other computers remove it.`
    : `Only on ${here}`
})
const mode = ref<SiloIconKind>(existing?.icon?.kind ?? 'letter')
// Each mode keeps its own value so switching tabs doesn't lose what you picked
const values = ref<Record<SiloIconKind, string>>({
  letter: existing?.icon?.kind === 'letter' ? existing.icon.value : '',
  emoji: existing?.icon?.kind === 'emoji' ? existing.icon.value : '',
  icon: existing?.icon?.kind === 'icon' ? existing.icon.value : '',
  image: existing?.icon?.kind === 'image' ? existing.icon.value : ''
})
const uploadName = ref(existing?.icon?.kind === 'image' ? 'Uploaded logo' : '')
const uploadError = ref('')
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const MODES: { id: SiloIconKind; label: string }[] = [
  { id: 'letter', label: 'Letter' },
  { id: 'emoji', label: 'Emoji' },
  { id: 'icon', label: 'Icon' },
  { id: 'image', label: 'Upload' }
]

const MORE_EMOJIS = ['🏡', '💼', '☕', '🎧', '🎨', '📚', '🚀', '🌱', '🛒', '🎮', '✈️', '💡', '🧪', '📈', '❤️', '⭐']

const icon = computed<SiloIcon | undefined>(() => {
  const value = values.value[mode.value].trim()
  if (mode.value === 'letter') return value ? { kind: 'letter', value } : undefined
  return value ? { kind: mode.value, value } : undefined
})

const preview = computed(() => ({
  name: name.value.trim() || 'Silo',
  color: color.value,
  icon: icon.value
}))

const customColor = computed(() =>
  SILO_COLORS.some((c) => c.hex.toLowerCase() === color.value.toLowerCase()) ? null : color.value
)

function pickEmoji(e: string): void {
  mode.value = 'emoji'
  values.value.emoji = e
}

function pickIcon(id: string): void {
  mode.value = 'icon'
  values.value.icon = id
}

async function useFile(file: File | null | undefined): Promise<void> {
  if (!file) return
  uploadError.value = ''
  try {
    values.value.image = await imageFileToDataUrl(file)
    uploadName.value = file.name || 'Pasted image'
    mode.value = 'image'
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Could not use that image'
  }
}

function onDrop(e: DragEvent): void {
  dragOver.value = false
  useFile(e.dataTransfer?.files?.[0])
}

function onPaste(e: ClipboardEvent): void {
  const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
  if (!item) return
  e.preventDefault()
  useFile(item.getAsFile())
}

function submit(): void {
  const trimmed = name.value.trim()
  if (!trimmed) return
  const updates = {
    name: trimmed,
    color: color.value,
    icon: icon.value,
    userAgent: userAgent.value.trim() || undefined,
    localOnly: synced.value ? undefined : true
  }
  if (editing.value) {
    groupsStore.updateGroup(editing.value.id, updates)
    close()
  } else {
    const group = groupsStore.addGroup(trimmed, color.value, icon.value)
    // Same tick as addGroup, so the silo is never saved (or synced) without these
    if (updates.userAgent || updates.localOnly) {
      groupsStore.updateGroup(group.id, {
        userAgent: updates.userAgent,
        localOnly: updates.localOnly
      })
    }
    close()
    uiStore.openAddTabDialog(group.id)
  }
}

function close(): void {
  if (uiStore.editGroupDialogOpen) uiStore.closeEditGroupDialog()
  if (uiStore.addGroupDialogOpen) uiStore.closeAddGroupDialog()
}
</script>

<template>
  <DialogShell
    :title="editing ? 'Edit silo' : 'New silo'"
    :width="500"
    @close="close"
    @submit="submit"
    @paste="onPaste"
  >
    <div class="flex items-center gap-4">
      <span
        class="rounded-[18px]"
        :style="{ boxShadow: `0 10px 24px color-mix(in srgb, ${color} 35%, transparent)` }"
      >
        <SiloTile :silo="preview" :size="64" :radius="18" />
      </span>
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="silo-name" class="text-[12.5px] font-semibold text-fg2">Name</label>
        <input
          id="silo-name"
          v-model="name"
          type="text"
          autofocus
          autocomplete="off"
          maxlength="40"
          placeholder="e.g. Work"
          class="field-input h-10 text-[15px]"
        />
      </div>
    </div>

    <div class="flex flex-col gap-2.5">
      <span id="silo-icon-label" class="text-[12.5px] font-semibold text-fg2">Icon</span>
      <div
        role="tablist"
        aria-labelledby="silo-icon-label"
        class="grid grid-cols-4 gap-[3px] rounded-[10px] bg-field p-[3px] shadow-[inset_0_0_0_1px_var(--field-line)]"
      >
        <button
          v-for="m in MODES"
          :key="m.id"
          type="button"
          role="tab"
          :aria-selected="mode === m.id"
          class="h-[30px] rounded-lg text-[13px] font-semibold transition-colors"
          :class="mode === m.id ? 'bg-accent text-on-accent' : 'text-fg2 hover:text-fg1'"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>

      <!-- Letter -->
      <div v-if="mode === 'letter'" class="flex items-center gap-3">
        <input
          v-model="values.letter"
          type="text"
          maxlength="2"
          aria-label="Letter"
          :placeholder="(name.trim()[0] ?? 'A').toUpperCase()"
          class="field-input w-16 text-center font-display text-[16px] font-bold uppercase"
        />
        <span class="text-[12.5px] text-fg3">
          One or two characters. Leave empty to use the first letter of the name.
        </span>
      </div>

      <!-- Emoji -->
      <div v-else-if="mode === 'emoji'" class="flex flex-col gap-2.5">
        <div class="flex items-center gap-3">
          <input
            v-model="values.emoji"
            type="text"
            maxlength="4"
            aria-label="Emoji"
            placeholder="🙂"
            class="field-input w-16 text-center text-[18px]"
          />
          <span class="text-[12.5px] text-fg3">Type or paste any emoji, or pick one.</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="e in MORE_EMOJIS"
            :key="e"
            type="button"
            class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-[17px] transition-colors"
            :class="values.emoji === e ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-field hover:bg-hover'"
            :aria-label="`Use ${e}`"
            @click="pickEmoji(e)"
          >
            {{ e }}
          </button>
        </div>
      </div>

      <!-- Built-in icon -->
      <div v-else-if="mode === 'icon'" class="grid grid-cols-8 gap-1.5">
        <button
          v-for="i in SILO_ICONS"
          :key="i.id"
          type="button"
          class="flex h-[38px] items-center justify-center rounded-[9px] transition-colors"
          :class="values.icon === i.id ? 'text-white' : 'bg-field text-fg1 hover:bg-hover'"
          :style="values.icon === i.id ? { background: color } : {}"
          :aria-label="i.name"
          :aria-pressed="values.icon === i.id"
          :title="i.name"
          @click="pickIcon(i.id)"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path :d="i.path" />
          </svg>
        </button>
      </div>

      <!-- Upload -->
      <template v-else>
        <div
          class="flex items-center gap-3.5 rounded-xl p-3.5 transition-colors"
          :class="dragOver ? 'bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--accent)]' : 'bg-field shadow-[inset_0_0_0_1.5px_var(--field-line)]'"
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
        >
          <SiloTile
            v-if="values.image"
            :silo="{ name: preview.name, color, icon: { kind: 'image', value: values.image } }"
            :size="44"
            :radius="10"
          />
          <span
            v-else
            aria-hidden="true"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-fg3 text-fg3"
          >
            <AppIcon name="image" :size="18" />
          </span>
          <span class="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span class="truncate text-[14px] font-semibold">
              {{ values.image ? uploadName : 'Your own logo' }}
            </span>
            <span class="text-[12.5px]" :class="uploadError ? 'text-danger' : 'text-fg3'">
              {{ uploadError || 'SVG or PNG · drop a file or paste an image' }}
            </span>
          </span>
          <button type="button" class="btn btn-outline btn-sm" @click="fileInput?.click()">
            {{ values.image ? 'Replace' : 'Choose…' }}
          </button>
          <input
            ref="fileInput"
            type="file"
            accept="image/svg+xml,image/png,image/jpeg,image/webp"
            class="hidden"
            @change="useFile(($event.target as HTMLInputElement).files?.[0])"
          />
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="mr-1 text-[12.5px] text-fg3">Or pick</span>
          <button
            v-for="e in QUICK_EMOJIS.slice(0, 3)"
            :key="e"
            type="button"
            class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-field text-[17px] transition-colors hover:bg-hover"
            :aria-label="`Use ${e}`"
            @click="pickEmoji(e)"
          >
            {{ e }}
          </button>
          <button
            v-for="id in QUICK_ICONS"
            :key="id"
            type="button"
            class="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-field text-fg1 transition-colors hover:bg-hover"
            :aria-label="`Use the ${id} icon`"
            @click="pickIcon(id)"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="siloIconPath(id) ?? ''" />
            </svg>
          </button>
        </div>
      </template>
    </div>

    <div class="flex flex-col gap-2.5">
      <span id="silo-color-label" class="text-[12.5px] font-semibold text-fg2">Color</span>
      <div role="radiogroup" aria-labelledby="silo-color-label" class="flex flex-wrap items-center gap-2.5">
        <button
          v-for="c in SILO_COLORS"
          :key="c.hex"
          type="button"
          role="radio"
          :aria-checked="color.toLowerCase() === c.hex.toLowerCase()"
          :aria-label="c.name"
          :title="c.name"
          class="h-7 w-7 rounded-[9px] transition-shadow"
          :style="{
            background: c.hex,
            boxShadow:
              color.toLowerCase() === c.hex.toLowerCase()
                ? '0 0 0 2px var(--panel), 0 0 0 4px var(--fg1)'
                : 'none'
          }"
          @click="color = c.hex"
        />
        <label
          class="relative flex h-7 w-7 cursor-pointer items-center justify-center overflow-hidden rounded-[9px] text-fg2 transition-shadow"
          :title="customColor ? `Custom color ${customColor}` : 'Custom color'"
          :style="
            customColor
              ? { background: customColor, boxShadow: '0 0 0 2px var(--panel), 0 0 0 4px var(--fg1)' }
              : { boxShadow: 'inset 0 0 0 1.5px var(--field-line)' }
          "
        >
          <AppIcon v-if="!customColor" name="plus" :size="13" :stroke="2.2" />
          <input
            type="color"
            :value="color"
            aria-label="Custom color"
            class="absolute inset-0 cursor-pointer opacity-0"
            @input="color = ($event.target as HTMLInputElement).value"
          />
        </label>
      </div>
      <span class="text-[12px] text-fg3">Tints the whole window while you're in this silo.</span>
    </div>

    <div class="flex items-start gap-3.5">
      <span class="flex flex-1 flex-col gap-[3px] pt-1">
        <span class="text-[13.5px] font-semibold">User agent</span>
        <span class="text-[12.5px] text-fg3">Tabs in this silo can still override it</span>
      </span>
      <UserAgentSelector v-model="userAgent" default-label="Automatic" />
    </div>

    <div class="flex items-start gap-3.5">
      <span class="flex flex-1 flex-col gap-[3px] pt-0.5">
        <span id="silo-sync-label" class="text-[13.5px] font-semibold"
          >Sync to your other computers</span
        >
        <span class="text-[12.5px] text-fg3">{{ syncHint }}</span>
      </span>
      <button
        type="button"
        role="switch"
        class="switch mt-0.5"
        aria-labelledby="silo-sync-label"
        :aria-checked="synced"
        @click="synced = !synced"
      />
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="!name.trim()">
        {{ editing ? 'Save' : 'Create silo' }}
      </button>
    </template>
  </DialogShell>
</template>
