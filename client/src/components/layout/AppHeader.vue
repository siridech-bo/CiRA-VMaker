<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/projectStore'
import { useTTSStore } from '@/stores/ttsStore'
import { useRenderStore } from '@/stores/renderStore'

const router = useRouter()
const projectStore = useProjectStore()
const ttsStore = useTTSStore()
const renderStore = useRenderStore()

const projectName = computed(() => projectStore.project?.name ?? 'CiRA VMaker')

const canExport = computed(() => {
  return projectStore.hasProject && projectStore.allAudioGenerated && !renderStore.isRendering
})

function handleNewProject() {
  if (projectStore.hasProject) {
    if (confirm('Starting a new project will discard the current one. Continue?')) {
      projectStore.resetProject()
      ttsStore.reset()
      renderStore.reset()
      router.push('/')
    }
  } else {
    router.push('/')
  }
}

function handleExport() {
  if (canExport.value) {
    router.push('/export')
  }
}
</script>

<template>
  <header class="h-14 bg-dark-800 border-b border-dark-700 flex items-center px-4 shrink-0">
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <svg class="w-8 h-8 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
        <span class="text-lg font-semibold text-white">{{ projectName }}</span>
      </div>
    </div>

    <div class="flex-1" />

    <nav class="flex items-center gap-2">
      <button
        v-if="projectStore.hasProject"
        class="btn btn-ghost btn-sm"
        @click="handleNewProject"
      >
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        New
      </button>

      <div v-if="ttsStore.isModelLoading" class="flex items-center gap-2 text-sm text-dark-400">
        <div class="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <span>Loading TTS model ({{ Math.round(ttsStore.loadProgress * 100) }}%)</span>
      </div>

      <div v-else-if="ttsStore.isModelReady" class="flex items-center gap-1.5 text-sm text-green-400">
        <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>TTS Ready</span>
      </div>

      <button
        v-if="projectStore.hasProject"
        class="btn btn-primary btn-sm"
        :disabled="!canExport"
        @click="handleExport"
      >
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        Export Video
      </button>
    </nav>
  </header>
</template>
