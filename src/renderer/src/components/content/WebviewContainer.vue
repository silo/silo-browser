<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { useWebviewRegistry } from '@renderer/composables/useWebviewRegistry'
import { getNotificationInjectionScript } from '@renderer/utils/notification-injection'
import type { TabItem } from '@renderer/types'

const props = defineProps<{
  tab: TabItem
  isActive: boolean
}>()

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const { registerMain, unregisterMain } = useWebviewRegistry()
const webviewRef = ref<Electron.WebviewTag | null>(null)

const partition = computed(() => `persist:silo-group-${props.tab.groupId}`)
const webviewPreload = window.api.webviewPreloadPath

const effectiveUserAgent = computed(() => {
  const group = groupsStore.findGroup(props.tab.groupId)
  return props.tab.userAgent || group?.userAgent || uiStore.defaultUserAgent || undefined
})

const handleFaviconUpdated = ((e: Event) => {
  const evt = e as Event & { favicons: string[] }
  if (evt.favicons?.length > 0) {
    const tab = groupsStore.findTab(props.tab.id)
    if (tab) {
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
  const evt = e as Event & { channel: string; args: unknown[] }
  if (evt.channel === 'notification') {
    groupsStore.incrementNotification(props.tab.id)
  } else if (evt.channel === 'notification-click') {
    groupsStore.activateTab(props.tab.id)
  } else if (evt.channel === 'zoom-change') {
    applyWebviewZoom(evt.args?.[0] as string, props.tab.id)
  } else if (evt.channel === 'silo:open-external' && evt.args?.[0]) {
    window.api.openExternal(evt.args[0] as string)
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

const handleUpdateTargetUrl = ((e: Event) => {
  const evt = e as Event & { url: string }
  if (evt.url) {
    uiStore.setHoveredLinkUrl(evt.url)
  } else {
    uiStore.clearHoveredLinkUrl()
  }
}) as EventListener

function applyWebviewZoom(direction: string, tabId: string): void {
  const wv = webviewRef.value
  if (!wv) return
  const newLevel = wv.getZoomLevel() + (direction === 'in' ? 0.5 : -0.5)
  wv.setZoomLevel(newLevel)
  groupsStore.setTabZoomLevel(tabId, newLevel)
}

function setNotifEnabled(enabled: boolean): void {
  const wv = webviewRef.value
  if (!wv) return
  wv.executeJavaScript(`window.__siloNotifEnabled = ${enabled}`).catch(() => {})
}

const handleDomReady = (() => {
  const wv = webviewRef.value
  if (!wv) return
  const enabled = props.tab.notificationsEnabled
  wv.executeJavaScript(getNotificationInjectionScript(enabled, props.tab.id)).catch(() => {})
  if (props.tab.isMuted) wv.setAudioMuted(true)
  wv.setZoomLevel(props.tab.zoomLevel ?? 0)
  if (effectiveUserAgent.value) wv.setUserAgent(effectiveUserAgent.value)
}) as EventListener

watch(
  () => props.tab.notificationsEnabled,
  (enabled) => {
    setNotifEnabled(enabled)
  }
)

watch(
  () => props.tab.isMuted,
  (muted) => {
    const wv = webviewRef.value
    if (wv) wv.setAudioMuted(muted)
  }
)

watch(effectiveUserAgent, (ua) => {
  const wv = webviewRef.value
  if (!wv) return
  try {
    wv.setUserAgent(ua ?? '')
  } catch {
    // setUserAgent throws if webContents is not yet attached — ignore, dom-ready will catch it
  }
})

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
  wv.addEventListener('update-target-url', handleUpdateTargetUrl)
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
  wv.removeEventListener('update-target-url', handleUpdateTargetUrl)
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
      :preload="webviewPreload"
      :data-tab-id="tab.id"
      :useragent="effectiveUserAgent"
      class="w-full h-full"
      allowpopups
      webpreferences="backgroundThrottling=no"
    />
  </div>
</template>
