<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/projectStore'
import { useRenderStore } from '@/stores/renderStore'
import { useVideoRenderer } from '@/composables/useVideoRenderer'
import ExportProgress from '@/components/video/ExportProgress.vue'
import ExportSettings from '@/components/video/ExportSettings.vue'

const router = useRouter()
const projectStore = useProjectStore()
const renderStore = useRenderStore()
const { renderVideo, cancelRender } = useVideoRenderer()

const showSettings = ref(false)

const canExport = computed(() => {
  return projectStore.hasProject &&
    projectStore.allAudioGenerated &&
    !renderStore.isRendering
})

onMounted(() => {
  if (!projectStore.hasProject) {
    router.push('/')
    return
  }

  if (!projectStore.allAudioGenerated) {
    router.push('/editor')
  }
})

async function handleExport() {
  if (!canExport.value) return

  try {
    await renderVideo()
  } catch (error) {
    console.error('Export failed:', error)
  }
}

function handleCancel() {
  cancelRender()
}

function handleDownload() {
  const projectName = projectStore.project?.name ?? 'video'
  const filename = `${projectName.replace(/[^a-z0-9]/gi, '_')}.mp4`
  renderStore.downloadVideo(filename)
}

function handleBackToEditor() {
  router.push('/editor')
}

function handleNewExport() {
  renderStore.reset()
}
</script>

<template>
  <div class="h-full flex flex-col items-center justify-center p-8">
    <div class="max-w-xl w-full space-y-6">
      <div class="text-center space-y-2">
        <h1 class="text-2xl font-bold text-white">Export Video</h1>
        <p class="text-dark-400">
          {{ projectStore.project?.name }} - {{ projectStore.slides.length }} slides
        </p>
      </div>

      <template v-if="renderStore.status === 'idle'">
        <div class="card">
          <div class="card-body space-y-4">
            <div class="flex items-center justify-between">
              <span class="text-dark-200">Export Settings</span>
              <button
                class="btn btn-ghost btn-sm"
                @click="showSettings = !showSettings"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>

            <ExportSettings v-if="showSettings" />

            <div class="pt-4 border-t border-dark-700">
              <div class="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span class="text-dark-400">Resolution</span>
                  <p class="text-dark-200">{{ renderStore.settings.width }}x{{ renderStore.settings.height }}</p>
                </div>
                <div>
                  <span class="text-dark-400">Format</span>
                  <p class="text-dark-200 uppercase">{{ renderStore.settings.format }}</p>
                </div>
                <div>
                  <span class="text-dark-400">Total Slides</span>
                  <p class="text-dark-200">{{ projectStore.slides.length }}</p>
                </div>
                <div>
                  <span class="text-dark-400">Est. Duration</span>
                  <p class="text-dark-200">
                    {{ Math.floor(projectStore.totalDuration / 60) }}:{{ String(Math.floor(projectStore.totalDuration % 60)).padStart(2, '0') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-3">
          <button
            class="btn btn-secondary flex-1"
            @click="handleBackToEditor"
          >
            Back to Editor
          </button>
          <button
            class="btn btn-primary flex-1"
            :disabled="!canExport"
            @click="handleExport"
          >
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Start Export
          </button>
        </div>
      </template>

      <template v-else-if="renderStore.isRendering">
        <ExportProgress
          :progress="renderStore.renderProgress"
          @cancel="handleCancel"
        />
      </template>

      <template v-else-if="renderStore.status === 'completed'">
        <div class="card">
          <div class="card-body text-center space-y-4">
            <div class="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg class="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div>
              <h3 class="text-lg font-medium text-white">Export Complete!</h3>
              <p class="text-dark-400 text-sm">Your video is ready to download</p>
            </div>

            <div class="flex gap-3">
              <button
                class="btn btn-ghost flex-1"
                @click="handleBackToEditor"
              >
                <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Editor
              </button>
              <button
                class="btn btn-secondary flex-1"
                @click="handleNewExport"
              >
                Export Again
              </button>
              <button
                class="btn btn-primary flex-1"
                @click="handleDownload"
              >
                <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="renderStore.status === 'error'">
        <div class="card border-red-500/30">
          <div class="card-body text-center space-y-4">
            <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <svg class="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <div>
              <h3 class="text-lg font-medium text-white">Export Failed</h3>
              <p class="text-red-400 text-sm">{{ renderStore.error }}</p>
            </div>

            <div class="flex gap-3">
              <button
                class="btn btn-secondary flex-1"
                @click="handleBackToEditor"
              >
                Back to Editor
              </button>
              <button
                class="btn btn-primary flex-1"
                @click="handleNewExport"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>
