<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import { useUiStore } from '@renderer/stores/ui'
import TheNavigationBar from './TheNavigationBar.vue'
import PermissionBanner from './PermissionBanner.vue'
import FindBar from './FindBar.vue'
import WebviewContainer from './WebviewContainer.vue'
import ChildWebviewContainer from './ChildWebviewContainer.vue'
import EmptyState from './EmptyState.vue'
import LinkStatusBar from './LinkStatusBar.vue'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
const uiStore = useUiStore()
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0">
    <TheNavigationBar />
    <PermissionBanner />
    <FindBar v-if="uiStore.findBarOpen" />
    <main class="flex-1 relative bg-surface-chrome">
      <EmptyState v-if="!groupsStore.activeTab" />
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
        :is-active="child.id === topbarStore.activeTopbarTabId && child.parentTabId === groupsStore.activeTabId"
      />
      <LinkStatusBar />
    </main>
  </div>
</template>
