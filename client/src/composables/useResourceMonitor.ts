import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useProjectStore } from '@/stores/projectStore'
import { blobStorage } from '@/services/blobStorage'

export interface ResourceStats {
  // Memory info (Chrome only via performance.memory)
  usedJSHeapSize: number | null
  totalJSHeapSize: number | null
  jsHeapSizeLimit: number | null

  // Estimated usage
  estimatedSlideMemoryMB: number
  estimatedAudioMemoryMB: number
  estimatedTotalMB: number

  // Counts
  slideCount: number
  audioCount: number

  // Status
  level: 'normal' | 'warning' | 'critical'
  warningMessage: string | null
}

// Estimate average sizes
const AVG_SLIDE_IMAGE_MB = 2.5  // Average 2.5MB per slide (data URL at 2x scale)
const AVG_THUMBNAIL_MB = 0.1    // Average 100KB per thumbnail
const AVG_AUDIO_MB = 0.5        // Average 500KB per audio (WAV)
const TTS_MODEL_MB = 150        // Kokoro model ~150MB when loaded

// Warning thresholds
const WARNING_THRESHOLD_MB = 500
const CRITICAL_THRESHOLD_MB = 800

export function useResourceMonitor() {
  const projectStore = useProjectStore()

  const stats = ref<ResourceStats>({
    usedJSHeapSize: null,
    totalJSHeapSize: null,
    jsHeapSizeLimit: null,
    estimatedSlideMemoryMB: 0,
    estimatedAudioMemoryMB: 0,
    estimatedTotalMB: 0,
    slideCount: 0,
    audioCount: 0,
    level: 'normal',
    warningMessage: null
  })

  const isSupported = ref(false)
  let updateInterval: ReturnType<typeof setInterval> | null = null

  // Check if performance.memory is available (Chrome only)
  function checkSupport() {
    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
      }
    }
    isSupported.value = !!perf.memory
  }

  async function updateStats() {
    const slides = projectStore.slides
    const slideCount = slides.length
    const audioCount = slides.filter(s => s.audioGenerated).length

    // Calculate estimated memory
    let estimatedSlideMemoryMB = 0

    // More accurate calculation based on actual data URL lengths
    for (const slide of slides) {
      // Data URLs are base64 encoded, so actual size is ~75% of string length
      if (slide.imageUrl) {
        estimatedSlideMemoryMB += (slide.imageUrl.length * 0.75) / (1024 * 1024)
      }
      if (slide.thumbnailUrl) {
        estimatedSlideMemoryMB += (slide.thumbnailUrl.length * 0.75) / (1024 * 1024)
      }
    }

    // If no actual data, use estimates
    if (estimatedSlideMemoryMB === 0 && slideCount > 0) {
      estimatedSlideMemoryMB = slideCount * (AVG_SLIDE_IMAGE_MB + AVG_THUMBNAIL_MB)
    }

    const estimatedAudioMemoryMB = audioCount * AVG_AUDIO_MB

    // Add TTS model memory if loaded
    const ttsModelLoaded = document.querySelector('[data-tts-ready]') !== null ||
      localStorage.getItem('tts-model-loaded') === 'true'
    const ttsMemory = ttsModelLoaded ? TTS_MODEL_MB : 0

    const estimatedTotalMB = estimatedSlideMemoryMB + estimatedAudioMemoryMB + ttsMemory

    // Try to get actual memory usage from Chrome
    let usedJSHeapSize: number | null = null
    let totalJSHeapSize: number | null = null
    let jsHeapSizeLimit: number | null = null

    const perf = performance as Performance & {
      memory?: {
        usedJSHeapSize: number
        totalJSHeapSize: number
        jsHeapSizeLimit: number
      }
    }

    if (perf.memory) {
      usedJSHeapSize = perf.memory.usedJSHeapSize
      totalJSHeapSize = perf.memory.totalJSHeapSize
      jsHeapSizeLimit = perf.memory.jsHeapSizeLimit
    }

    // Determine warning level
    let level: 'normal' | 'warning' | 'critical' = 'normal'
    let warningMessage: string | null = null

    const checkMemory = usedJSHeapSize
      ? usedJSHeapSize / (1024 * 1024)
      : estimatedTotalMB

    if (checkMemory >= CRITICAL_THRESHOLD_MB) {
      level = 'critical'
      warningMessage = 'Memory usage is very high. Consider exporting and starting a new project, or removing some slides.'
    } else if (checkMemory >= WARNING_THRESHOLD_MB) {
      level = 'warning'
      warningMessage = 'Memory usage is elevated. Performance may be affected with more slides.'
    } else if (slideCount >= 50) {
      level = 'warning'
      warningMessage = 'Large number of slides. Consider splitting into multiple projects for better performance.'
    }

    stats.value = {
      usedJSHeapSize,
      totalJSHeapSize,
      jsHeapSizeLimit,
      estimatedSlideMemoryMB,
      estimatedAudioMemoryMB,
      estimatedTotalMB,
      slideCount,
      audioCount,
      level,
      warningMessage
    }
  }

  function formatBytes(bytes: number | null): string {
    if (bytes === null) return 'N/A'

    const mb = bytes / (1024 * 1024)
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  function formatMB(mb: number): string {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(2)} GB`
    }
    return `${mb.toFixed(1)} MB`
  }

  const usedMemoryFormatted = computed(() => {
    if (stats.value.usedJSHeapSize !== null) {
      return formatBytes(stats.value.usedJSHeapSize)
    }
    return formatMB(stats.value.estimatedTotalMB)
  })

  const memoryLimitFormatted = computed(() => {
    if (stats.value.jsHeapSizeLimit !== null) {
      return formatBytes(stats.value.jsHeapSizeLimit)
    }
    return 'Unknown'
  })

  const memoryPercentage = computed(() => {
    if (stats.value.usedJSHeapSize !== null && stats.value.jsHeapSizeLimit !== null) {
      return Math.round((stats.value.usedJSHeapSize / stats.value.jsHeapSizeLimit) * 100)
    }
    // Estimate based on typical browser limit (~4GB for 64-bit browsers)
    const estimatedLimit = 4 * 1024 // 4GB in MB
    return Math.round((stats.value.estimatedTotalMB / estimatedLimit) * 100)
  })

  async function clearAllAudio() {
    if (!projectStore.project) return

    const projectId = projectStore.project.id

    // Clear from IndexedDB
    await blobStorage.clearProjectAudio(projectId)

    // Reset audio status in store
    projectStore.slides.forEach(slide => {
      slide.audioGenerated = false
      slide.audioDuration = null
    })

    await updateStats()
  }

  async function getStorageUsage(): Promise<number> {
    return await blobStorage.getStorageUsage()
  }

  function startMonitoring() {
    checkSupport()
    updateStats()

    // Update every 5 seconds
    updateInterval = setInterval(updateStats, 5000)
  }

  function stopMonitoring() {
    if (updateInterval) {
      clearInterval(updateInterval)
      updateInterval = null
    }
  }

  onMounted(() => {
    startMonitoring()
  })

  onUnmounted(() => {
    stopMonitoring()
  })

  return {
    stats,
    isSupported,
    usedMemoryFormatted,
    memoryLimitFormatted,
    memoryPercentage,
    formatMB,
    updateStats,
    clearAllAudio,
    getStorageUsage
  }
}
