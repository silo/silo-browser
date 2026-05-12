<script setup lang="ts">
import { useGroupsStore } from '@renderer/stores/groups'
import { useUiStore } from '@renderer/stores/ui'
import SidebarGroup from './SidebarGroup.vue'
import AddGroupButton from './AddGroupButton.vue'
import SidebarTooltip from './SidebarTooltip.vue'

const groupsStore = useGroupsStore()
const uiStore = useUiStore()
const isMac = window.api.platform === 'darwin'
</script>

<template>
  <aside
    :class="[
      'flex flex-col bg-surface-chrome transition-all duration-200 shrink-0',
      uiStore.sidebarExpanded ? 'w-52' : 'w-14'
    ]"
  >
    <!-- macOS traffic light spacer -->
    <div v-if="isMac" class="h-10 shrink-0" style="-webkit-app-region: drag" />

    <div class="sidebar-scroll flex-1 overflow-y-auto overflow-x-hidden py-2 border-r border-chrome-border">
      <TransitionGroup tag="div" name="group-list">
        <SidebarGroup
          v-for="group in groupsStore.sortedGroups"
          :key="group.id"
          :group="group"
        />
      </TransitionGroup>
      <div
        v-if="groupsStore.groups.length === 0"
        class="px-3 py-4 text-xs text-chrome-fg-faint text-center"
      >
        <span v-if="uiStore.sidebarExpanded">No groups yet</span>
      </div>
    </div>

    <div class="border-t border-r border-chrome-border p-1">
      <div
        :class="
          uiStore.sidebarExpanded
            ? 'flex items-center'
            : 'flex flex-col items-center gap-0.5'
        "
      >
        <AddGroupButton />

        <!-- Extensions -->
        <button
          @click="uiStore.extensionsPageOpen ? uiStore.closeExtensionsPage() : uiStore.openExtensionsPage()"
          :class="[
            'p-1.5 rounded transition-colors',
            uiStore.extensionsPageOpen
              ? 'bg-chrome-active text-chrome-fg-primary'
              : 'text-chrome-fg-secondary hover:bg-chrome-hover/50',
            uiStore.sidebarExpanded ? 'ml-auto' : ''
          ]"
          title="Extensions"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            class="w-4 h-4"
          >
            <path
              d="M11.25 5.337c0-.355-.186-.676-.401-.959a1.647 1.647 0 0 1-.349-1.003c0-1.035 1.007-1.875 2.25-1.875s2.25.84 2.25 1.875c0 .369-.128.713-.349 1.003-.215.283-.401.604-.401.959 0 .332.278.598.61.578 1.91-.114 3.79-.342 5.632-.676a.75.75 0 0 1 .878.645 49.17 49.17 0 0 1 .376 5.452.657.657 0 0 1-.66.664c-.354 0-.675-.186-.958-.401a1.647 1.647 0 0 0-1.003-.349c-1.035 0-1.875 1.007-1.875 2.25s.84 2.25 1.875 2.25c.369 0 .713-.128 1.003-.349.283-.215.604-.401.959-.401.31 0 .557.262.534.571a48.774 48.774 0 0 1-.595 4.845.75.75 0 0 1-.61.61c-1.82.317-3.673.533-5.555.642a.58.58 0 0 1-.611-.581c0-.355.186-.676.401-.959.221-.29.349-.634.349-1.003 0-1.035-1.007-1.875-2.25-1.875s-2.25.84-2.25 1.875c0 .369.128.713.349 1.003.215.283.401.604.401.959a.641.641 0 0 1-.658.643 49.118 49.118 0 0 1-4.708-.36.75.75 0 0 1-.645-.878c.293-1.614.504-3.257.629-4.924A.53.53 0 0 0 5.337 15c-.355 0-.676.186-.959.401-.29.221-.634.349-1.003.349-1.035 0-1.875-1.007-1.875-2.25s.84-2.25 1.875-2.25c.369 0 .713.128 1.003.349.283.215.604.401.959.401a.656.656 0 0 0 .659-.663 47.703 47.703 0 0 0-.31-4.82.75.75 0 0 1 .83-.832c1.343.155 2.703.254 4.077.294a.64.64 0 0 0 .657-.642Z"
            />
          </svg>
        </button>

        <!-- Settings -->
        <button
          @click="uiStore.settingsPageOpen ? uiStore.closeSettingsPage() : uiStore.openSettingsPage()"
          :class="[
            'p-1.5 rounded transition-colors',
            uiStore.settingsPageOpen
              ? 'bg-chrome-active text-chrome-fg-primary'
              : 'text-chrome-fg-secondary hover:bg-chrome-hover/50'
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
          class="p-1.5 text-chrome-fg-secondary rounded hover:bg-chrome-hover/50 transition-colors"
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
              d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  </aside>
  <SidebarTooltip />
</template>
