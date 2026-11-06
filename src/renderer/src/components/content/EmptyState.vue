<script setup lang="ts">
import { computed } from 'vue'
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import { shortcut } from '@renderer/utils/platform'
import SiloTile from '@renderer/components/common/SiloTile.vue'
import AppIcon from '@renderer/components/common/AppIcon.vue'

// Shown when silos exist but no tab is open (e.g. after closing the last tab).
const groupsStore = useGroupsStore()
const uiStore = useUiStore()

const silo = computed(
  () =>
    (uiStore.railSiloId && groupsStore.findGroup(uiStore.railSiloId)) ||
    groupsStore.sortedGroups[0] ||
    null
)
const otherSilos = computed(() =>
  groupsStore.sortedGroups.filter((g) => g.id !== silo.value?.id).map((g) => g.name)
)
const hasAnyTabs = computed(() => groupsStore.allTabsFlat.length > 0)
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center p-10">
    <div v-if="silo" class="flex max-w-[420px] flex-col items-center gap-4 text-center">
      <SiloTile :silo="silo" :size="56" :radius="16" />
      <div class="flex flex-col gap-2">
        <h2 class="m-0 font-display text-[24px] font-bold tracking-[-0.02em]">
          {{ hasAnyTabs ? 'Pick a tab to get going' : `Add your first tab to ${silo.name}` }}
        </h2>
        <p class="m-0 text-[13.5px] leading-[1.5] text-fg2">
          <template v-if="hasAnyTabs">Choose one in the sidebar, or add a new one.</template>
          <template v-else>
            Tabs in {{ silo.name }} share its logins.
            <template v-if="otherSilos.length">
              Nothing crosses over to {{ otherSilos.join(', ') }}.
            </template>
          </template>
        </p>
      </div>
      <button
        type="button"
        class="flex h-9 items-center gap-2 rounded-[9px] bg-accent px-4 text-[13px] font-semibold text-on-accent transition-[filter] hover:brightness-110"
        @click="uiStore.openAddTabDialog(silo.id)"
      >
        <AppIcon name="plus" :size="13" :stroke="2.4" />
        Add tab to {{ silo.name }}
        <kbd class="text-[10.5px] opacity-80">{{ shortcut('T') }}</kbd>
      </button>
    </div>
  </div>
</template>
