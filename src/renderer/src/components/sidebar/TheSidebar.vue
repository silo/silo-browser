<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import SidebarFull from './SidebarFull.vue'
import SidebarCollapsed from './SidebarCollapsed.vue'
import SidebarRail from './SidebarRail.vue'
import SettingsRail from './SettingsRail.vue'
import SidebarTooltip from './SidebarTooltip.vue'

// Picks the sidebar for the current mode. Layout of the window grid lives in App.vue.
const groupsStore = useGroupsStore()
const uiStore = useUiStore()
</script>

<template>
  <!-- Nothing until the saved state is read, so the default layout never flashes on launch -->
  <template v-if="groupsStore.loaded">
    <SettingsRail v-if="uiStore.settingsPageOpen" />
    <SidebarCollapsed v-else-if="!uiStore.sidebarExpanded && groupsStore.groups.length > 0" />
    <SidebarRail v-else-if="uiStore.sidebarLayout === 'rail'" />
    <SidebarFull v-else />
  </template>
  <SidebarTooltip />
</template>
