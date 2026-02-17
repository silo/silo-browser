<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import { getNotificationInjectionScript } from '@renderer/utils/notification-injection'
import type { TabItem } from '@renderer/types'

const props = defineProps<{
  tab: TabItem
  isActive: boolean
}>()

const groupsStore = useGroupsStore()
const { registerMain, unregisterMain } = useWebviewRegistry()
const webviewRef = ref<Electron.WebviewTag | null>(null)

const partition = computed(() => `persist:silo-group-${props.tab.groupId}`)

const handleFaviconUpdated = ((e: Event) => {
  const evt = e as Event & { favicons: string[] }
  if (evt.favicons?.length > 0) {
    const tab = groupsStore.findTab(props.tab.id)
    if (tab && !tab.iconUrl) {
      tab.iconUrl = evt.favicons[0]
    }
  }
}) as EventListener

const handleDidNavigate = ((e: Event) => {
  const evt = e as Event & { url: string }
  groupsStore.setTabCurrentUrl(props.tab.id, evt.url)
}) as EventListener

const handleDidNavigateInPage = ((e: Event) => {
  const evt = e as Event & { url: string }
  groupsStore.setTabCurrentUrl(props.tab.id, evt.url)
}) as EventListener

const handleTitleUpdated = ((e: Event) => {
  const evt = e as Event & { title: string }
  groupsStore.setTabCurrentTitle(props.tab.id, evt.title)
}) as EventListener

const handleIpcMessage = ((e: Event) => {
  const evt = e as Event & { channel: string }
  if (evt.channel === 'notification') {
    groupsStore.incrementNotification(props.tab.id)
  }
}) as EventListener

const handleDidFailLoad = ((e: Event) => {
  const evt = e as Event & { errorDescription: string }
  console.error(`Webview failed to load [${props.tab.name}]:`, evt.errorDescription)
}) as EventListener

const handleMediaStartedPlaying = (() => {
  groupsStore.setTabAudioPlaying(props.tab.id, true)
}) as EventListener

const handleMediaPaused = (() => {
  groupsStore.setTabAudioPlaying(props.tab.id, false)
}) as EventListener

function setNotifEnabled(enabled: boolean): void {
  const wv = webviewRef.value
  if (!wv) return
  wv.executeJavaScript(`window.__siloNotifEnabled = ${enabled}`).catch(() => {})
}

const handleDomReady = (() => {
  const wv = webviewRef.value
  if (!wv) return
  const enabled = props.tab.notificationsEnabled
  wv.executeJavaScript(getNotificationInjectionScript(enabled)).catch(() => {})
}) as EventListener

watch(
  () => props.tab.notificationsEnabled,
  (enabled) => {
    setNotifEnabled(enabled)
  }
)

onMounted(() => {
  const wv = webviewRef.value
  if (!wv) return

  registerMain(props.tab.id, wv)

  wv.addEventListener('page-favicon-updated', handleFaviconUpdated)
  wv.addEventListener('did-navigate', handleDidNavigate)
  wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage)
  wv.addEventListener('page-title-updated', handleTitleUpdated)
  wv.addEventListener('ipc-message', handleIpcMessage)
  wv.addEventListener('did-fail-load', handleDidFailLoad)
  wv.addEventListener('media-started-playing', handleMediaStartedPlaying)
  wv.addEventListener('media-paused', handleMediaPaused)
  wv.addEventListener('dom-ready', handleDomReady)
})

onUnmounted(() => {
  unregisterMain(props.tab.id)
  const wv = webviewRef.value
  if (!wv) return

  wv.removeEventListener('page-favicon-updated', handleFaviconUpdated)
  wv.removeEventListener('did-navigate', handleDidNavigate)
  wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage)
  wv.removeEventListener('page-title-updated', handleTitleUpdated)
  wv.removeEventListener('ipc-message', handleIpcMessage)
  wv.removeEventListener('did-fail-load', handleDidFailLoad)
  wv.removeEventListener('media-started-playing', handleMediaStartedPlaying)
  wv.removeEventListener('media-paused', handleMediaPaused)
  wv.removeEventListener('dom-ready', handleDomReady)
})
</script>

<template>
  <div
    :class="['absolute inset-0', isActive ? 'z-10 visible' : 'z-0 invisible']"
  >
    <webview
      ref="webviewRef"
      :src="tab.url"
      :partition="partition"
      :data-tab-id="tab.id"
      class="w-full h-full"
      allowpopups
    />
  </div>
</template>
