<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { shortcut } from '@renderer/utils/platform'
import UserAgentSelector from '@renderer/components/inputs/UserAgentSelector.vue'
import ShortcutRecorder from '@renderer/components/inputs/ShortcutRecorder.vue'
import DialogShell from '@renderer/components/common/DialogShell.vue'
import TabIcon from '@renderer/components/common/TabIcon.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const name = ref('')
const url = ref('')
const iconEmoji = ref('')
const notificationsEnabled = ref(true)
const sleepAfterMinutes = ref(0)
const userAgent = ref('')
const isMuted = ref(false)
const tabShortcut = ref('')

// Without a custom shortcut the tab keeps its position one (⌘1–8, ⌘9 = last) in its silo
const positionHint = computed(() => {
  const tab = uiStore.editTabTargetId ? groupsStore.findTab(uiStore.editTabTargetId) : null
  const digit = tab ? groupsStore.positionDigitOf(tab) : null
  return digit ? `${shortcut(String(digit))} · by position` : 'None'
})

watch(
  () => uiStore.editTabTargetId,
  (id) => {
    if (!id) return
    const tab = groupsStore.findTab(id)
    if (tab) {
      name.value = tab.name
      url.value = tab.url
      iconEmoji.value = tab.iconEmoji ?? ''
      notificationsEnabled.value = tab.notificationsEnabled
      sleepAfterMinutes.value = tab.sleepAfterMinutes ?? 0
      userAgent.value = tab.userAgent ?? ''
      isMuted.value = tab.isMuted
      tabShortcut.value = tab.shortcut ?? ''
    }
  },
  { immediate: true }
)

function submit(): void {
  const trimmedName = name.value.trim()
  const trimmedUrl = url.value.trim()
  if (!trimmedUrl || !uiStore.editTabTargetId) return

  let finalUrl = trimmedUrl
  if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
    finalUrl = `https://${finalUrl}`
  }

  groupsStore.updateTab(uiStore.editTabTargetId, {
    name: trimmedName || trimmedUrl,
    url: finalUrl,
    iconEmoji: iconEmoji.value.trim() || undefined,
    notificationsEnabled: notificationsEnabled.value,
    sleepAfterMinutes: sleepAfterMinutes.value,
    isMuted: isMuted.value,
    userAgent: userAgent.value.trim() || undefined,
    shortcut: tabShortcut.value || undefined
  })
  close()
}

function close(): void {
  uiStore.closeEditTabDialog()
}
</script>

<template>
  <DialogShell title="Edit tab" :width="440" @close="close" @submit="submit">
    <div class="flex flex-col gap-1.5">
      <label for="edit-tab-url" class="text-[12.5px] font-semibold text-fg2">URL</label>
      <div class="field-input flex items-center gap-2">
        <AppIcon name="globe" :size="14" class="text-fg3" />
        <input
          id="edit-tab-url"
          v-model="url"
          type="text"
          autofocus
          spellcheck="false"
          class="h-full min-w-0 flex-1 border-0 bg-transparent text-[13.5px] text-fg1 outline-none"
        />
      </div>
    </div>

    <div class="flex gap-2.5">
      <div class="flex flex-col gap-1.5">
        <label for="edit-tab-emoji" class="text-[12.5px] font-semibold text-fg2">Icon</label>
        <div class="field-input flex w-[76px] items-center gap-1.5 pl-2">
          <TabIcon :name="name || url" :url="url" :icon-emoji="iconEmoji.trim() || undefined" :size="18" />
          <input
            id="edit-tab-emoji"
            v-model="iconEmoji"
            type="text"
            maxlength="2"
            placeholder="🙂"
            title="Optional emoji instead of the site icon"
            class="h-full w-full min-w-0 border-0 bg-transparent text-center text-[14px] outline-none placeholder:opacity-40"
          />
        </div>
      </div>
      <div class="flex flex-1 flex-col gap-1.5">
        <label for="edit-tab-name" class="text-[12.5px] font-semibold text-fg2">Name</label>
        <input id="edit-tab-name" v-model="name" type="text" class="field-input" />
      </div>
    </div>

    <div class="flex flex-col">
      <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
        <span id="edit-tab-notif" class="flex-1 text-[13px] font-semibold">Notifications</span>
        <button
          type="button"
          role="switch"
          class="switch"
          aria-labelledby="edit-tab-notif"
          :aria-checked="notificationsEnabled"
          @click="notificationsEnabled = !notificationsEnabled"
        />
      </div>
      <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
        <span id="edit-tab-mute" class="flex-1 text-[13px] font-semibold">Mute audio</span>
        <button
          type="button"
          role="switch"
          class="switch"
          aria-labelledby="edit-tab-mute"
          :aria-checked="isMuted"
          @click="isMuted = !isMuted"
        />
      </div>
      <div class="flex items-center gap-3.5 border-b border-row-line py-2.5">
        <span class="flex flex-1 flex-col gap-0.5">
          <label for="edit-tab-sleep" class="text-[13px] font-semibold">Put to sleep when idle</label>
          <span class="text-[12px] text-fg3">Asleep tabs don't get notifications</span>
        </span>
        <select id="edit-tab-sleep" v-model.number="sleepAfterMinutes" class="select-field">
          <option :value="0">Never</option>
          <option :value="30">After 30 min</option>
          <option :value="60">After 1 hour</option>
          <option :value="120">After 2 hours</option>
          <option :value="240">After 4 hours</option>
        </select>
      </div>
      <div class="flex items-start gap-3.5 border-b border-row-line py-2.5">
        <span class="flex flex-1 flex-col gap-0.5 pt-1">
          <span class="text-[13px] font-semibold">Keyboard shortcut</span>
          <span class="text-[12px] text-fg3">Opens this tab from any silo</span>
        </span>
        <ShortcutRecorder
          v-if="uiStore.editTabTargetId"
          v-model="tabShortcut"
          :tab-id="uiStore.editTabTargetId"
          :placeholder="positionHint"
          label="Keyboard shortcut"
        />
      </div>
      <div class="flex items-start gap-3.5 pt-2.5">
        <span class="flex flex-1 flex-col gap-0.5 pt-1">
          <span class="text-[13px] font-semibold">User agent</span>
          <span class="text-[12px] text-fg3">Overrides the silo's setting</span>
        </span>
        <UserAgentSelector v-model="userAgent" default-label="Same as silo" />
      </div>
    </div>

    <template #footer>
      <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
      <button type="submit" class="btn btn-primary" :disabled="!url.trim()">Save</button>
    </template>
  </DialogShell>
</template>
