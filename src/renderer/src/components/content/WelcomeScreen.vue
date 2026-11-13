<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useSyncStore } from '@renderer/stores/sync'
import { SILO_COLORS } from '@renderer/utils/theme'
import AppIcon from '@renderer/components/common/AppIcon.vue'
import SiloLogo from '@renderer/components/common/SiloLogo.vue'

// First-run screen (design board "C · Welcome"): name your first silo, pick its color.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()
const syncStore = useSyncStore()

const colors = SILO_COLORS.slice(0, 7)
const color = ref(colors[0].hex)
const inputRef = ref<HTMLInputElement | null>(null)

// The window tint previews the chosen color; the sidebar previews the name
watch(color, (c) => uiStore.setTintPreviewColor(c), { immediate: true })

onMounted(() => inputRef.value?.focus())
onUnmounted(() => {
  uiStore.setTintPreviewColor(null)
  uiStore.welcomeDraftName = ''
})

function create(): void {
  const name = uiStore.welcomeDraftName.trim()
  if (!name) {
    inputRef.value?.focus()
    return
  }
  const group = groupsStore.addGroup(name, color.value)
  uiStore.openAddTabDialog(group.id)
}

async function importConfig(): Promise<void> {
  const result = await window.api.importConfig()
  if (!result) return
  await groupsStore.loadFromDisk()
  await topbarStore.loadFromDisk()
  await uiStore.loadFromDisk()
}

const pillars = [
  { color: '#187A47', letter: 'P', height: 280, apps: [['G', '#C5221F', '#F59E0B'], ['R', '#C2410C']] },
  {
    color: '#2F63D8',
    letter: 'W',
    height: 340,
    apps: [['G', '#C5221F', '#0EA5E9'], ['C', '#1D5FD1'], ['D', '#0F6FB8']]
  }
]
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center overflow-auto px-10 py-8">
    <div class="flex w-full max-w-[980px] flex-wrap items-center gap-14">
      <div class="flex min-w-0 flex-[1_1_420px] flex-col gap-6">
        <div class="flex items-center gap-[9px]">
          <SiloLogo :size="28" :radius="8" />
          <span class="font-display text-[16px] font-bold">Silo</span>
        </div>
        <div class="flex flex-col gap-3.5">
          <h1
            class="m-0 font-display text-[48px] leading-none font-extrabold tracking-[-0.035em] text-balance"
          >
            Every app in its own silo.
          </h1>
          <p class="m-0 max-w-[440px] text-[15px] leading-[1.55] text-pretty text-fg2">
            A silo keeps its own cookies, logins and storage. Put work in one, personal in another
            — and stay signed in to both Gmail accounts at once.
          </p>
        </div>
        <form class="flex max-w-[440px] flex-col gap-3" @submit.prevent="create">
          <label for="welcome-silo-name" class="text-[13px] font-semibold">
            Name your first silo
          </label>
          <div class="flex flex-wrap gap-2">
            <input
              id="welcome-silo-name"
              ref="inputRef"
              v-model="uiStore.welcomeDraftName"
              placeholder="e.g. Work"
              autocomplete="off"
              maxlength="40"
              class="h-10 min-w-0 flex-[1_1_200px] rounded-[10px] border-0 bg-transparent px-3 text-[14px] text-fg1 shadow-[inset_0_0_0_1.5px_var(--accent)] outline-none placeholder:text-fg3 focus:shadow-[inset_0_0_0_1.5px_var(--accent),0_0_0_3px_var(--accent-soft)]"
            />
            <button
              type="submit"
              class="h-10 rounded-[10px] bg-accent px-[18px] text-[13.5px] font-semibold text-on-accent transition-[filter] hover:brightness-110 disabled:opacity-50"
              :disabled="!uiStore.welcomeDraftName.trim()"
            >
              Create silo
            </button>
          </div>
          <div role="radiogroup" aria-label="Silo color" class="flex flex-wrap gap-2">
            <button
              v-for="c in colors"
              :key="c.hex"
              type="button"
              role="radio"
              :aria-checked="color === c.hex"
              :aria-label="c.name"
              :title="c.name"
              class="h-[22px] w-[22px] rounded-[7px] transition-shadow"
              :style="{
                background: c.hex,
                boxShadow: color === c.hex ? `0 0 0 2px var(--page), 0 0 0 3.5px ${c.hex}` : 'none'
              }"
              @click="color = c.hex"
            />
          </div>
        </form>
        <div class="-ml-2 flex flex-wrap items-center gap-0.5">
          <button
            type="button"
            class="flex h-8 items-center gap-[7px] rounded-lg px-2 text-[13px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
            @click="importConfig"
          >
            <AppIcon name="upload" :size="14" :stroke="2" />
            Import a configuration
          </button>
          <button
            v-if="!syncStore.enabled"
            type="button"
            class="flex h-8 items-center gap-[7px] rounded-lg px-2 text-[13px] text-fg2 transition-colors hover:bg-hover hover:text-fg1"
            @click="syncStore.chooseFolder()"
          >
            <AppIcon name="folder-sync" :size="14" :stroke="2" />
            Use a sync folder
          </button>
        </div>
        <p v-if="syncStore.enabled" class="m-0 -mt-3 text-[12.5px] text-fg3">
          Syncing with {{ syncStore.status?.label }}. Silos you create here appear on your other
          computers.
        </p>
        <p v-if="syncStore.error && !syncStore.setup" class="m-0 -mt-3 text-[12.5px] text-danger">
          {{ syncStore.error }}
        </p>
      </div>

      <!-- Illustration: silos as pillars, each holding its own apps -->
      <div aria-hidden="true" class="flex h-[380px] flex-[0_1_340px] items-end justify-center gap-3.5">
        <div
          v-for="p in pillars"
          :key="p.letter"
          class="box-border flex w-24 flex-col items-center rounded-[48px_48px_16px_16px] py-3.5"
          :style="{
            height: `${p.height}px`,
            background: `color-mix(in srgb, ${p.color} 16%, var(--page))`,
            boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${p.color} 30%, transparent)`
          }"
        >
          <span
            class="mt-[18px] flex h-9 w-9 items-center justify-center rounded-[11px] font-display text-[16px] font-bold text-white"
            :style="{ background: p.color }"
          >
            {{ p.letter }}
          </span>
          <span class="mt-auto flex flex-col items-center gap-2">
            <span
              v-for="(app, i) in p.apps"
              :key="i"
              class="relative flex h-10 w-10 items-center justify-center rounded-[11px] bg-white shadow-[0_3px_10px_rgba(0,0,0,.1)]"
            >
              <span
                class="flex h-[22px] w-[22px] items-center justify-center rounded-md text-[11px] font-semibold text-white"
                :style="{ background: app[1] }"
              >
                {{ app[0] }}
              </span>
              <span
                v-if="app[2]"
                class="absolute -right-[5px] -bottom-[5px] h-4 w-4 rounded-full shadow-[0_0_0_2.5px_#FFFFFF]"
                :style="{ background: app[2] }"
              />
            </span>
          </span>
        </div>
        <div
          class="box-border flex h-[230px] w-24 flex-col items-center rounded-[48px_48px_16px_16px] py-3.5 shadow-[inset_0_0_0_1.5px_var(--field-line)]"
        >
          <span
            class="mt-[18px] flex h-9 w-9 items-center justify-center rounded-[11px] border-[1.5px] border-dashed border-fg3 text-fg3"
          >
            <AppIcon name="plus" :size="15" :stroke="2.2" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
