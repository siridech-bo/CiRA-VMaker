<script setup lang="ts">
import { RouterView } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useProjectStore } from '@/stores/projectStore'

const projectStore = useProjectStore()
</script>

<template>
  <div class="app-container h-screen flex flex-col bg-gray-900 text-white overflow-hidden">
    <AppHeader />

    <div class="flex flex-1 overflow-hidden">
      <AppSidebar v-if="projectStore.hasProject" />

      <main class="flex-1 overflow-auto">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  min-height: 100vh;
  min-height: 100dvh;
}
</style>
