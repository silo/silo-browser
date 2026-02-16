<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useGroupsStore } from '@renderer/stores/groups'
import type { ChildTab } from '@renderer/types'

const props = defineProps<{
  childTab: ChildTab
  isActive: boolean
}>()

const topbarStore = useTopbarTabsStore()
const groupsStore = useGroupsStore()
const webviewRef = ref<Electron.WebviewTag | null>(null)

const parentTab = computed(() => groupsStore.findTab(props.childTab.parentTabId))

const partition = computed(() => `persist:silo-group-${props.childTab.groupId}`)

const handleFaviconUpdated = ((e: Event) => {
  const evt = e as Event & { favicons: string[] }
  if (evt.favicons?.length > 0) {
    topbarStore.setChildIconUrl(props.childTab.id, evt.favicons[0])
  }
}) as EventListener

const handleDidNavigate = ((e: Event) => {
  const evt = e as Event & { url: string }
  topbarStore.setChildCurrentUrl(props.childTab.id, evt.url)
}) as EventListener

const handleDidNavigateInPage = ((e: Event) => {
  const evt = e as Event & { url: string }
  topbarStore.setChildCurrentUrl(props.childTab.id, evt.url)
}) as EventListener

const handleTitleUpdated = ((e: Event) => {
  const evt = e as Event & { title: string }
  topbarStore.setChildCurrentTitle(props.childTab.id, evt.title)
}) as EventListener

const handleDidFailLoad = ((e: Event) => {
  const evt = e as Event & { errorDescription: string }
  console.error(`Child webview failed to load:`, evt.errorDescription)
}) as EventListener

const handleMediaStartedPlaying = (() => {
  topbarStore.setChildAudioPlaying(props.childTab.id, true)
}) as EventListener

const handleMediaPaused = (() => {
  topbarStore.setChildAudioPlaying(props.childTab.id, false)
}) as EventListener

function setNotifEnabled(enabled: boolean): void {
  const wv = webviewRef.value
  if (!wv) return
  wv.executeJavaScript(`window.__siloNotifEnabled = ${enabled}`).catch(() => {})
}

const handleDomReady = (() => {
  const wv = webviewRef.value
  if (!wv) return
  const enabled = parentTab.value?.notificationsEnabled ?? true
  wv.executeJavaScript(`
    (() => {
      if (window.__siloNotifWrapped) return;
      window.__siloNotifEnabled = ${enabled};
      const OrigNotification = window.Notification;
      const SiloNotification = function(title, options) {
        if (!window.__siloNotifEnabled) return {};
        return new OrigNotification(title, options);
      };
      SiloNotification.requestPermission = () => {
        return OrigNotification.requestPermission.call(OrigNotification);
      };
      Object.defineProperty(SiloNotification, 'permission', {
        get: () => OrigNotification.permission
      });
      SiloNotification.prototype = OrigNotification.prototype;
      window.Notification = SiloNotification;
      const origShow = ServiceWorkerRegistration.prototype.showNotification;
      ServiceWorkerRegistration.prototype.showNotification = function(...args) {
        if (!window.__siloNotifEnabled) return Promise.resolve();
        return origShow.apply(this, args);
      };
      window.__siloNotifWrapped = true;
    })()
  `).catch(() => {})
}) as EventListener

watch(
  () => parentTab.value?.notificationsEnabled,
  (enabled) => {
    setNotifEnabled(enabled ?? true)
  }
)

onMounted(() => {
  const wv = webviewRef.value
  if (!wv) return

  wv.addEventListener('page-favicon-updated', handleFaviconUpdated)
  wv.addEventListener('did-navigate', handleDidNavigate)
  wv.addEventListener('did-navigate-in-page', handleDidNavigateInPage)
  wv.addEventListener('page-title-updated', handleTitleUpdated)
  wv.addEventListener('did-fail-load', handleDidFailLoad)
  wv.addEventListener('media-started-playing', handleMediaStartedPlaying)
  wv.addEventListener('media-paused', handleMediaPaused)
  wv.addEventListener('dom-ready', handleDomReady)
})

onUnmounted(() => {
  const wv = webviewRef.value
  if (!wv) return

  wv.removeEventListener('page-favicon-updated', handleFaviconUpdated)
  wv.removeEventListener('did-navigate', handleDidNavigate)
  wv.removeEventListener('did-navigate-in-page', handleDidNavigateInPage)
  wv.removeEventListener('page-title-updated', handleTitleUpdated)
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
      :src="childTab.url"
      :partition="partition"
      :data-child-tab-id="childTab.id"
      class="w-full h-full"
      allowpopups
    />
  </div>
</template>
