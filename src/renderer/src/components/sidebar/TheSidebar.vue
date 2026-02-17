<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import SidebarGroup from './SidebarGroup.vue'
import AddGroupButton from './AddGroupButton.vue'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const isMac = window.api.platform === 'darwin'
</script>

<template>
  <aside
    :class="[
      'flex flex-col border-r border-gray-700 bg-gray-800 transition-all duration-200 shrink-0',
      uiStore.sidebarExpanded ? 'w-52' : 'w-14'
    ]"
  >
    <!-- macOS traffic light spacer -->
    <div v-if="isMac" class="h-9 shrink-0" style="-webkit-app-region: drag" />

    <div class="flex-1 overflow-y-auto overflow-x-hidden py-2">
      <TransitionGroup tag="div" name="group-list">
        <SidebarGroup
          v-for="group in groupsStore.sortedGroups"
          :key="group.id"
          :group="group"
        />
      </TransitionGroup>
      <div
        v-if="groupsStore.groups.length === 0"
        class="px-3 py-4 text-xs text-gray-500 text-center"
      >
        <span v-if="uiStore.sidebarExpanded">No groups yet</span>
      </div>
    </div>

    <div class="border-t border-gray-700 p-1">
      <div
        :class="
          uiStore.sidebarExpanded
            ? 'flex items-center'
            : 'flex flex-col items-center gap-0.5'
        "
      >
        <AddGroupButton />

        <!-- Settings -->
        <button
          @click="uiStore.openSettingsDialog()"
          :class="[
            'p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors',
            uiStore.sidebarExpanded ? 'ml-auto' : ''
          ]"
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-4 h-4"
          >
            <path
              fill-rule="evenodd"
              d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.206 1.25l-1.18 2.045a1 1 0 01-1.187.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.114a7.05 7.05 0 010-2.227L1.821 7.773a1 1 0 01-.206-1.25l1.18-2.045a1 1 0 011.187-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clip-rule="evenodd"
            />
          </svg>
        </button>

        <!-- Sidebar collapse toggle -->
        <button
          @click="uiStore.toggleSidebar"
          class="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors"
          :title="uiStore.sidebarExpanded ? 'Collapse sidebar' : 'Expand sidebar'"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            class="w-4 h-4 transition-transform duration-200"
            :class="uiStore.sidebarExpanded ? '' : 'rotate-180'"
          >
            <path
              fill-rule="evenodd"
              d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>
