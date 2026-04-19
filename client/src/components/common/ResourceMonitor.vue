<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useResourceMonitor } from '@/composables/useResourceMonitor'

const {
  stats,
  isSupported,
  usedMemoryFormatted,
  memoryPercentage,
  formatMB,
  clearAllAudio,
  getStorageUsage
} = useResourceMonitor()

const isExpanded = ref(false)
const isClearing = ref(false)
const storageUsageMB = ref(0)

const statusColor = computed(() => {
  switch (stats.value.level) {
    case 'critical': return 'text-red-400'
    case 'warning': return 'text-yellow-400'
    default: return 'text-green-400'
  }
})

const statusBgColor = computed(() => {
  switch (stats.value.level) {
    case 'critical': return 'bg-red-500/20 border-red-500/30'
    case 'warning': return 'bg-yellow-500/20 border-yellow-500/30'
    default: return 'bg-dark-700/50 border-dark-600'
  }
})

const progressBarColor = computed(() => {
  switch (stats.value.level) {
    case 'critical': return 'bg-red-500'
    case 'warning': return 'bg-yellow-500'
    default: return 'bg-green-500'
  }
})

const statusIcon = computed(() => {
  switch (stats.value.level) {
    case 'critical': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
    case 'warning': return 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z'
    default: return 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z'
  }
})

async function handleClearAudio() {
  if (isClearing.value) return

  isClearing.value = true
  try {
    await clearAllAudio()
    await updateStorageUsage()
  } finally {
    isClearing.value = false
  }
}

async function updateStorageUsage() {
  const bytes = await getStorageUsage()
  storageUsageMB.value = bytes / (1024 * 1024)
}

onMounted(() => {
  updateStorageUsage()
})
</script>

<template>
  <div
    class="border rounded-lg transition-all duration-200"
    :class="statusBgColor"
  >
    <button
      class="w-full flex items-center justify-between p-3 text-left"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2">
        <svg
          class="w-4 h-4"
          :class="statusColor"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            :d="statusIcon"
          />
        </svg>
        <span class="text-sm font-medium text-dark-200">Resources</span>
        <span class="text-xs" :class="statusColor">
          {{ usedMemoryFormatted }}
        </span>
      </div>

      <svg
        class="w-4 h-4 text-dark-400 transition-transform"
        :class="{ 'rotate-180': isExpanded }"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    <div v-if="isExpanded" class="px-3 pb-3 space-y-3">
      <div class="space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-dark-400">Memory Usage</span>
          <span class="text-dark-200">{{ memoryPercentage }}%</span>
        </div>
        <div class="h-2 bg-dark-600 rounded-full overflow-hidden">
          <div
            class="h-full transition-all duration-300 rounded-full"
            :class="progressBarColor"
            :style="{ width: `${Math.min(memoryPercentage, 100)}%` }"
          />
        </div>
      </div>

      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-dark-700/50 rounded p-2">
          <div class="text-dark-400">Slides</div>
          <div class="text-dark-200 font-medium">{{ stats.slideCount }}</div>
          <div class="text-dark-500 text-[10px]">
            ~{{ formatMB(stats.estimatedSlideMemoryMB) }}
          </div>
        </div>

        <div class="bg-dark-700/50 rounded p-2">
          <div class="text-dark-400">Audio Files</div>
          <div class="text-dark-200 font-medium">{{ stats.audioCount }}</div>
          <div class="text-dark-500 text-[10px]">
            ~{{ formatMB(stats.estimatedAudioMemoryMB) }}
          </div>
        </div>
      </div>

      <div v-if="storageUsageMB > 0" class="text-xs">
        <div class="flex items-center justify-between text-dark-400">
          <span>IndexedDB Storage</span>
          <span class="text-dark-200">{{ formatMB(storageUsageMB) }}</span>
        </div>
      </div>

      <div v-if="!isSupported" class="text-[10px] text-dark-500">
        Memory values are estimates. Use Chrome for precise metrics.
      </div>

      <div
        v-if="stats.warningMessage"
        class="p-2 rounded text-xs"
        :class="{
          'bg-red-500/10 text-red-400': stats.level === 'critical',
          'bg-yellow-500/10 text-yellow-400': stats.level === 'warning'
        }"
      >
        {{ stats.warningMessage }}
      </div>

      <div v-if="stats.audioCount > 0" class="pt-2 border-t border-dark-600">
        <button
          class="w-full text-xs py-2 px-3 rounded bg-dark-600 hover:bg-dark-500 text-dark-200 transition-colors flex items-center justify-center gap-2"
          :disabled="isClearing"
          @click="handleClearAudio"
        >
          <svg
            v-if="isClearing"
            class="w-3 h-3 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <circle cx="12" cy="12" r="10" stroke-width="4" class="opacity-25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          {{ isClearing ? 'Clearing...' : 'Clear All Audio' }}
        </button>
        <p class="text-[10px] text-dark-500 mt-1 text-center">
          Frees memory. Audio can be regenerated.
        </p>
      </div>

      <div class="pt-2 border-t border-dark-600">
        <h4 class="text-xs font-medium text-dark-300 mb-2">Tips for Large Projects</h4>
        <ul class="text-[10px] text-dark-400 space-y-1 list-disc list-inside">
          <li>Use PDF instead of PPTX for better performance</li>
          <li>Split large presentations into smaller parts</li>
          <li>Clear audio after exporting video</li>
          <li>Close other browser tabs to free memory</li>
        </ul>
      </div>
    </div>
  </div>
</template>
