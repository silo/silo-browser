<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useTopbarTabsStore } from '@renderer/stores/topbar-tabs'
import TheNavigationBar from './TheNavigationBar.vue'
import WebviewContainer from './WebviewContainer.vue'
import ChildWebviewContainer from './ChildWebviewContainer.vue'
import EmptyState from './EmptyState.vue'

const groupsStore = useGroupsStore()
const topbarStore = useTopbarTabsStore()
</script>

<template>
  <div class="flex-1 flex flex-col min-w-0">
    <TheNavigationBar />
    <main class="flex-1 relative bg-gray-900">
      <EmptyState v-if="!groupsStore.activeTabId" />
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
    </main>
  </div>
</template>
