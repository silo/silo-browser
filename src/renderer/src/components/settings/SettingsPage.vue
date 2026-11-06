<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { ACCENTS, DARK_SHADES, LIGHT_SHADES, TINTS, mixHex } from '@renderer/utils/theme'
import { isMac, shortcut } from '@renderer/utils/platform'
import type { SidebarLayout, ThemeMode } from '@renderer/types'
import UserAgentSelector from '@renderer/components/inputs/UserAgentSelector.vue'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Design board "C · Settings": cards for look & feel, behaviour, silos, backup and shortcuts.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const topbarStore = useTopbarTabsStore()

const appVersion = ref('')
const checkingForUpdates = ref(false)

onMounted(async () => {
  appVersion.value = await window.api.getAppVersion()
})

// --- Look & feel ---

const lightHex = computed(() => LIGHT_SHADES.find((s) => s.id === uiStore.lightShade)!.hex)
const darkHex = computed(() => DARK_SHADES.find((s) => s.id === uiStore.darkShade)!.hex)

/** Mini window previews for the theme cards, drawn in the user's chosen shades. */
const themes = computed(() => {
  const light = { panel: lightHex.value, line: 'rgba(0,0,0,.14)', active: '#FFFFFF', page: '#FFFFFF' }
  const dark = {
    panel: darkHex.value,
    line: 'rgba(255,255,255,.2)',
    active: 'rgba(255,255,255,.14)',
    page: mixHex('#FFFFFF', 6, darkHex.value)
  }
  const half = (a: string, b: string): string => `linear-gradient(90deg, ${a} 50%, ${b} 50%)`
  return [
    { id: 'light' as ThemeMode, label: 'Light', ...light },
    { id: 'dark' as ThemeMode, label: 'Dark', ...dark },
    {
      id: 'system' as ThemeMode,
      label: 'Match system',
      panel: half(light.panel, dark.panel),
      line: 'rgba(127,127,127,.35)',
      active: 'rgba(127,127,127,.3)',
      page: half(light.page, dark.page)
    }
  ]
})

const lightLabel = computed(() => {
  const name = LIGHT_SHADES.find((s) => s.id === uiStore.lightShade)!.name
  return uiStore.effectiveTheme === 'light' ? `${name} · in use` : name
})
const darkLabel = computed(() => {
  const name = DARK_SHADES.find((s) => s.id === uiStore.darkShade)!.name
  return uiStore.effectiveTheme === 'dark' ? `${name} · in use` : name
})

const LAYOUTS: { id: SidebarLayout; label: string }[] = [
  { id: 'sidebar', label: 'One sidebar' },
  { id: 'rail', label: 'Rail + list' }
]

const selectedRing = '0 0 0 2px var(--card), 0 0 0 4px var(--fg1)'

// --- Silos ---

function siloMeta(tabs: number, ua?: string): string {
  return `${tabs} ${tabs === 1 ? 'tab' : 'tabs'} · ${ua ? 'custom user agent' : 'default user agent'}`
}

// --- Backup & updates ---

function handleCheckForUpdates(): void {
  checkingForUpdates.value = true
  uiStore.updaterUpToDate = false
  window.api.checkForUpdates()
  setTimeout(() => {
    checkingForUpdates.value = false
  }, 5000)
}

async function handleImport(): Promise<void> {
  const result = await window.api.importConfig()
  if (result) {
    await groupsStore.loadFromDisk()
    await topbarStore.loadFromDisk()
    await uiStore.loadFromDisk()
    uiStore.closeSettingsPage()
  }
}

async function handleExport(): Promise<void> {
  await window.api.exportConfig()
}

function openWebsite(): void {
  window.api.openExternal('https://silo.dev')
}

// --- Shortcuts ---

const shortcuts = [
  { label: 'New tab', keys: shortcut('T') },
  { label: 'New silo', keys: shortcut('N') },
  { label: 'Close pop-up tab', keys: shortcut('W') },
  { label: 'Reload', keys: shortcut('R') },
  { label: 'Address & search', keys: shortcut('L') },
  { label: 'Find in page', keys: shortcut('F') },
  { label: 'Settings', keys: shortcut(',') },
  { label: 'Toggle sidebar', keys: isMac ? '⌘[ ⌘]' : 'Ctrl+[ ]' },
  { label: 'Go to tab 1–9', keys: shortcut('1–9') },
  { label: 'Zoom in / out', keys: isMac ? '⌘+ ⌘−' : 'Ctrl+ +/−' },
  { label: 'Actual size', keys: shortcut('0') },
  { label: 'Close dialog or settings', keys: 'Esc' }
]
</script>

<template>
  <main class="flex min-h-0 min-w-0 flex-col">
    <div aria-hidden="true" class="app-drag h-11 shrink-0" />
    <div class="thin-scroll min-h-0 flex-1 overflow-y-auto">
      <div class="mx-auto flex max-w-[1064px] flex-col gap-5 px-8 pb-12">
        <header class="flex flex-wrap items-end gap-3">
          <div class="flex flex-col gap-1">
            <h1 class="m-0 font-display text-[32px] leading-none font-bold tracking-[-0.03em]">
              Settings
            </h1>
            <span class="text-[13px] text-fg2">Silo v{{ appVersion }}</span>
          </div>
          <button type="button" class="btn btn-outline ml-auto" @click="uiStore.closeSettingsPage()">
            Back to browser
            <kbd class="text-[10.5px] text-fg3">Esc</kbd>
          </button>
        </header>

        <div class="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(400px,100%),1fr))]">
          <!-- Look & feel -->
          <section
            aria-labelledby="h-look"
            class="flex flex-col gap-4 rounded-2xl bg-card px-5 pt-[18px] pb-5 shadow-[0_0_0_1px_var(--card-line)]"
          >
            <h2 id="h-look" class="m-0 font-display text-[17px] font-bold tracking-[-0.01em]">
              Look &amp; feel
            </h2>
            <div role="radiogroup" aria-label="Theme" class="grid grid-cols-3 gap-2">
              <button
                v-for="t in themes"
                :key="t.id"
                type="button"
                role="radio"
                :aria-checked="uiStore.themeMode === t.id"
                class="flex flex-col gap-1.5 text-left"
                @click="uiStore.setThemeMode(t.id)"
              >
                <span
                  aria-hidden="true"
                  class="box-border flex h-[60px] w-full gap-[5px] rounded-[10px] p-1.5 transition-shadow"
                  :style="{
                    background: t.panel,
                    boxShadow:
                      uiStore.themeMode === t.id
                        ? '0 0 0 2px var(--accent)'
                        : '0 0 0 1px var(--card-line)'
                  }"
                >
                  <span class="flex w-[30px] flex-col gap-1 pt-0.5">
                    <span class="flex items-center gap-[3px]">
                      <span class="h-1.5 w-1.5 rounded-[2px] bg-[#2F63D8]" />
                      <span class="h-1 flex-1 rounded-sm" :style="{ background: t.line }" />
                    </span>
                    <span class="h-[7px] rounded-[3px]" :style="{ background: t.active }" />
                    <span class="mr-1 ml-0.5 h-1 rounded-sm" :style="{ background: t.line }" />
                    <span class="mt-0.5 flex items-center gap-[3px]">
                      <span class="h-1.5 w-1.5 rounded-[2px] bg-[#187A47]" />
                      <span class="h-1 flex-1 rounded-sm" :style="{ background: t.line }" />
                    </span>
                  </span>
                  <span class="flex-1 rounded-[5px]" :style="{ background: t.page }" />
                </span>
                <span
                  class="text-[12.5px]"
                  :class="uiStore.themeMode === t.id ? 'font-semibold text-fg1' : 'font-medium text-fg2'"
                >
                  {{ t.label }}
                </span>
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="flex flex-[1_1_160px] flex-col gap-0.5">
                <span id="l-lshade" class="text-[13px] font-semibold">Light shade</span>
                <span class="text-[12px] text-fg2">{{ lightLabel }}</span>
              </div>
              <div role="radiogroup" aria-labelledby="l-lshade" class="flex flex-wrap gap-2">
                <button
                  v-for="x in LIGHT_SHADES"
                  :key="x.id"
                  type="button"
                  role="radio"
                  :aria-checked="uiStore.lightShade === x.id"
                  :aria-label="x.name"
                  :title="`${x.name} — ${x.note}`"
                  class="h-[30px] w-[30px] rounded-[9px] transition-shadow"
                  :style="{
                    background: x.hex,
                    boxShadow:
                      uiStore.lightShade === x.id ? selectedRing : 'inset 0 0 0 1px var(--field-line)'
                  }"
                  @click="uiStore.setLightShade(x.id)"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="flex flex-[1_1_160px] flex-col gap-0.5">
                <span id="l-dshade" class="text-[13px] font-semibold">Dark shade</span>
                <span class="text-[12px] text-fg2">{{ darkLabel }}</span>
              </div>
              <div role="radiogroup" aria-labelledby="l-dshade" class="flex flex-wrap gap-2">
                <button
                  v-for="x in DARK_SHADES"
                  :key="x.id"
                  type="button"
                  role="radio"
                  :aria-checked="uiStore.darkShade === x.id"
                  :aria-label="x.name"
                  :title="`${x.name} — ${x.note}`"
                  class="h-[30px] w-[30px] rounded-[9px] transition-shadow"
                  :style="{
                    background: x.hex,
                    boxShadow:
                      uiStore.darkShade === x.id ? selectedRing : 'inset 0 0 0 1px var(--field-line)'
                  }"
                  @click="uiStore.setDarkShade(x.id)"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="flex flex-[1_1_160px] flex-col gap-0.5">
                <span id="l-tint" class="text-[13px] font-semibold">Silo tint</span>
                <span class="text-[12px] text-fg2">Window takes the active silo’s color</span>
              </div>
              <div
                role="radiogroup"
                aria-labelledby="l-tint"
                class="flex gap-0.5 rounded-[9px] bg-field p-[3px] shadow-[inset_0_0_0_1px_var(--field-line)]"
              >
                <button
                  v-for="u in TINTS"
                  :key="u.id"
                  type="button"
                  role="radio"
                  :aria-checked="uiStore.siloTint === u.id"
                  class="h-[26px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors"
                  :class="
                    uiStore.siloTint === u.id
                      ? 'bg-card text-fg1 shadow-[0_1px_2px_rgba(0,0,0,.14),0_0_0_1px_var(--card-line)]'
                      : 'text-fg2 hover:text-fg1'
                  "
                  @click="uiStore.setSiloTint(u.id)"
                >
                  {{ u.name }}
                </button>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <span id="l-accent" class="flex-[1_1_160px] text-[13px] font-semibold">Accent</span>
              <div role="radiogroup" aria-labelledby="l-accent" class="flex flex-wrap gap-2">
                <button
                  v-for="a in ACCENTS"
                  :key="a.id"
                  type="button"
                  role="radio"
                  :aria-checked="uiStore.accentColor === a.id"
                  :aria-label="a.name"
                  :title="a.name"
                  class="h-[22px] w-[22px] rounded-full transition-shadow"
                  :style="{
                    background: a.swatch,
                    boxShadow:
                      uiStore.accentColor === a.id
                        ? selectedRing
                        : a.id === 'black'
                          ? 'inset 0 0 0 1px var(--field-line)'
                          : 'none'
                  }"
                  @click="uiStore.setAccentColor(a.id)"
                />
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <div class="flex flex-[1_1_160px] flex-col gap-0.5">
                <span id="l-layout" class="text-[13px] font-semibold">Sidebar layout</span>
                <span class="text-[12px] text-fg2">
                  {{
                    uiStore.sidebarLayout === 'rail'
                      ? 'Silo rail, with one silo’s tabs at a time'
                      : 'Every silo and its tabs in one list'
                  }}
                </span>
              </div>
              <div
                role="radiogroup"
                aria-labelledby="l-layout"
                class="flex gap-0.5 rounded-[9px] bg-field p-[3px] shadow-[inset_0_0_0_1px_var(--field-line)]"
              >
                <button
                  v-for="l in LAYOUTS"
                  :key="l.id"
                  type="button"
                  role="radio"
                  :aria-checked="uiStore.sidebarLayout === l.id"
                  class="h-[26px] rounded-[7px] px-3 text-[12.5px] font-medium transition-colors"
                  :class="
                    uiStore.sidebarLayout === l.id
                      ? 'bg-card text-fg1 shadow-[0_1px_2px_rgba(0,0,0,.14),0_0_0_1px_var(--card-line)]'
                      : 'text-fg2 hover:text-fg1'
                  "
                  @click="uiStore.setSidebarLayout(l.id)"
                >
                  {{ l.label }}
                </button>
              </div>
            </div>
          </section>

          <!-- Behaviour -->
          <section
            aria-labelledby="h-behave"
            class="flex flex-col rounded-2xl bg-card px-5 pt-[18px] pb-3 shadow-[0_0_0_1px_var(--card-line)]"
          >
            <h2 id="h-behave" class="m-0 mb-1.5 font-display text-[17px] font-bold tracking-[-0.01em]">
              Behaviour
            </h2>
            <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
              <div class="flex flex-1 flex-col gap-0.5">
                <span id="l-links" class="text-[13px] font-semibold">Keep new windows inside Silo</span>
                <span class="text-[12px] text-fg2">
                  Pop-ups open as tabs above the page, with the same login
                </span>
              </div>
              <button
                type="button"
                role="switch"
                class="switch"
                aria-labelledby="l-links"
                :aria-checked="uiStore.openLinksInNewTab"
                @click="uiStore.setOpenLinksInNewTab(!uiStore.openLinksInNewTab)"
              />
            </div>
            <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
              <div class="flex flex-1 flex-col gap-0.5">
                <span id="l-confirm" class="text-[13px] font-semibold">
                  Confirm before closing pop-up tabs
                </span>
                <span class="text-[12px] text-fg2">Ask before {{ shortcut('W') }} closes one</span>
              </div>
              <button
                type="button"
                role="switch"
                class="switch"
                aria-labelledby="l-confirm"
                :aria-checked="uiStore.confirmCloseChildTabs"
                @click="uiStore.setConfirmCloseChildTabs(!uiStore.confirmCloseChildTabs)"
              />
            </div>
            <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
              <div class="flex flex-1 flex-col gap-0.5">
                <label for="c-sleep" class="text-[13px] font-semibold">Put idle tabs to sleep</label>
                <span class="text-[12px] text-fg2">For new tabs — each tab can change it</span>
              </div>
              <select
                id="c-sleep"
                class="select-field"
                :value="uiStore.defaultSleepAfterMinutes"
                @change="
                  uiStore.setDefaultSleepAfterMinutes(
                    Number(($event.target as HTMLSelectElement).value)
                  )
                "
              >
                <option :value="0">Never</option>
                <option :value="30">After 30 min</option>
                <option :value="60">After 1 hour</option>
                <option :value="120">After 2 hours</option>
                <option :value="240">After 4 hours</option>
              </select>
            </div>
            <div class="flex items-start gap-3.5 py-2.5">
              <div class="flex flex-1 flex-col gap-0.5 pt-1">
                <span class="text-[13px] font-semibold">Default user agent</span>
                <span class="text-[12px] text-fg2">Silos and tabs can override it</span>
              </div>
              <UserAgentSelector
                :model-value="uiStore.defaultUserAgent"
                default-label="Automatic"
                @update:model-value="uiStore.setDefaultUserAgent"
              />
            </div>
          </section>

          <!-- Silos -->
          <section
            aria-labelledby="h-silos"
            class="flex flex-col rounded-2xl bg-card px-5 pt-[18px] pb-3 shadow-[0_0_0_1px_var(--card-line)]"
          >
            <div class="mb-1.5 flex items-center">
              <h2 id="h-silos" class="m-0 flex-1 font-display text-[17px] font-bold tracking-[-0.01em]">
                Silos
              </h2>
              <button type="button" class="btn btn-ghost btn-sm" @click="uiStore.openAddGroupDialog()">
                <AppIcon name="plus" :size="12" :stroke="2.5" />
                New silo
              </button>
            </div>
            <div
              v-for="s in groupsStore.sortedGroups"
              :key="s.id"
              class="flex items-center gap-3 border-b border-row-line py-2 last:border-b-0"
            >
              <SiloTile :silo="s" :size="28" :radius="8" />
              <span class="flex min-w-0 flex-1 items-baseline gap-2">
                <span class="truncate text-[13.5px] font-semibold">{{ s.name }}</span>
                <span class="truncate text-[12px] text-fg2">{{ siloMeta(s.tabs.length, s.userAgent) }}</span>
              </span>
              <button
                type="button"
                class="btn btn-outline btn-sm h-[26px]"
                :aria-label="`Edit ${s.name}`"
                @click="uiStore.openEditGroupDialog(s.id)"
              >
                Edit
              </button>
            </div>
            <p v-if="groupsStore.groups.length === 0" class="m-0 py-2 text-[12.5px] text-fg3">
              No silos yet.
            </p>
          </section>

          <!-- Backup & updates -->
          <section
            aria-labelledby="h-backup"
            class="flex flex-col gap-3 rounded-2xl bg-card px-5 pt-[18px] pb-5 shadow-[0_0_0_1px_var(--card-line)]"
          >
            <h2 id="h-backup" class="m-0 font-display text-[17px] font-bold tracking-[-0.01em]">
              Backup &amp; updates
            </h2>
            <div class="flex flex-col gap-2 rounded-[10px] bg-field p-3">
              <span class="text-[13px] font-semibold">Configuration file</span>
              <span class="text-[12px] text-fg2">
                Silos, tabs and settings as a JSON file. Logins and cookies are never included.
              </span>
              <div class="flex flex-wrap gap-1.5">
                <button type="button" class="btn btn-outline btn-sm bg-card" @click="handleExport">
                  <AppIcon name="download" :size="13" :stroke="2" />
                  Export…
                </button>
                <button type="button" class="btn btn-outline btn-sm bg-card" @click="handleImport">
                  <AppIcon name="upload" :size="13" :stroke="2" />
                  Import…
                </button>
              </div>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="flex min-w-[150px] flex-1 flex-col gap-0.5">
                <span class="text-[12px] text-fg2">Silo v{{ appVersion }}</span>
                <span
                  v-if="uiStore.updaterUpToDate && !checkingForUpdates"
                  class="flex items-center gap-1.5 text-[12px] text-success"
                >
                  <AppIcon name="check" :size="12" :stroke="2.5" />
                  You’re on the latest version
                </span>
              </span>
              <button
                type="button"
                class="btn btn-outline btn-sm"
                :disabled="checkingForUpdates"
                @click="handleCheckForUpdates"
              >
                {{ checkingForUpdates ? 'Checking…' : 'Check for updates' }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                @click="openWebsite"
              >
                silo.dev
              </button>
            </div>
          </section>

          <!-- Shortcuts -->
          <section
            aria-labelledby="h-keys"
            class="col-span-full flex flex-col gap-1.5 rounded-2xl bg-card px-5 pt-[18px] pb-3.5 shadow-[0_0_0_1px_var(--card-line)]"
          >
            <h2 id="h-keys" class="m-0 mb-1 font-display text-[17px] font-bold tracking-[-0.01em]">
              Shortcuts
            </h2>
            <div class="grid gap-x-5 [grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))]">
              <div
                v-for="k in shortcuts"
                :key="k.label"
                class="flex h-[34px] items-center justify-between gap-2.5 border-b border-row-line"
              >
                <span class="text-[12.5px] text-fg2">{{ k.label }}</span>
                <kbd
                  class="inline-flex h-5 items-center rounded-[5px] bg-field px-1.5 text-[10.5px] text-fg1 shadow-[inset_0_0_0_1px_var(--field-line)]"
                >
                  {{ k.keys }}
                </kbd>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </main>
</template>
