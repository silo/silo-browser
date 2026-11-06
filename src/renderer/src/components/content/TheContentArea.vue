<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import PermissionBanner from './PermissionBanner.vue'
import FindBar from './FindBar.vue'
import WebviewContainer from './WebviewContainer.vue'
import ChildWebviewContainer from './ChildWebviewContainer.vue'
import EmptyState from './EmptyState.vue'
import WelcomeScreen from './WelcomeScreen.vue'
import LinkStatusBar from './LinkStatusBar.vue'

// The rounded "page" card inset into the window chrome. Webviews stay mounted here
// (toggled visible/invisible) so switching tabs never reloads them.
const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
</script>

<template>
  <section
    aria-label="Web content"
    class="relative mr-2 mb-2 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl bg-page shadow-card"
  >
    <PermissionBanner />
    <div class="relative min-h-0 flex-1">
      <template v-if="groupsStore.loaded">
        <WelcomeScreen v-if="groupsStore.groups.length === 0" />
        <EmptyState v-else-if="!groupsStore.activeTab" />
      </template>
      <WebviewContainer
        v-for="tab in groupsStore.allLoadedTabs"
        :key="tab.id + '-' + tab.groupId"
        :tab="tab"
        :is-active="tab.id === groupsStore.activeTabId && !topbarStore.isChildActive"
      />
      <ChildWebviewContainer
        v-for="child in topbarStore.childTabs"
        :key="child.id"
        :child-tab="child"
        :is-active="
          child.id === topbarStore.activeTopbarTabId &&
          child.parentTabId === groupsStore.activeTabId
        "
      />
      <FindBar v-if="uiStore.findBarOpen" />
      <LinkStatusBar />
    </div>
  </section>
</template>
