<script setup lang="ts">
import type { RenderProgress } from '@/types'

interface Props {
  progress: RenderProgress
}

defineProps<Props>()

const emit = defineEmits<{
  cancel: []
}>()

function getStatusText(status: string): string {
  switch (status) {
    case 'preparing': return 'Preparing...'
    case 'rendering': return 'Rendering video...'
    case 'encoding': return 'Encoding...'
    default: return 'Processing...'
  }
}
</script>

<template>
  <div class="card">
    <div class="card-body space-y-6">
      <div class="flex items-center gap-4">
        <div class="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <div>
          <h3 class="font-medium text-white">{{ getStatusText(progress.status) }}</h3>
          <p class="text-sm text-dark-400">{{ progress.message }}</p>
        </div>
      </div>

      <div class="space-y-2">
        <div class="flex justify-between text-sm">
          <span class="text-dark-400">Progress</span>
          <span class="text-dark-200">{{ Math.round(progress.progress) }}%</span>
        </div>
        <div class="progress-bar h-3">
          <div
            class="progress-bar-fill"
            :style="{ width: `${progress.progress}%` }"
          />
        </div>
      </div>

      <div v-if="progress.totalSlides > 0" class="flex justify-between text-sm text-dark-400">
        <span>Slide {{ progress.currentSlide + 1 }} of {{ progress.totalSlides }}</span>
      </div>

      <div class="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
        <div class="flex items-start gap-2">
          <svg class="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p class="text-xs text-yellow-200">
            Keep this tab active and visible for best results. Background tabs may affect video quality.
          </p>
        </div>
      </div>

      <button
        class="btn btn-secondary w-full"
        @click="emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </div>
</template>
