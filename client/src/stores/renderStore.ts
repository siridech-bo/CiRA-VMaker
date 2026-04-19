import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RenderStatus, RenderProgress, RenderSettings } from '@/types'
import { DEFAULT_RENDER_SETTINGS } from '@/types'

export const useRenderStore = defineStore('render', () => {
  // State
  const isRendering = ref(false)
  const status = ref<RenderStatus>('idle')
  const currentSlide = ref(0)
  const totalSlides = ref(0)
  const progress = ref(0)
  const message = ref('')
  const settings = ref<RenderSettings>({ ...DEFAULT_RENDER_SETTINGS })
  const outputBlob = ref<Blob | null>(null)
  const error = ref<string | null>(null)

  // Getters
  const renderProgress = computed<RenderProgress>(() => ({
    status: status.value,
    currentSlide: currentSlide.value,
    totalSlides: totalSlides.value,
    progress: progress.value,
    message: message.value
  }))

  const canRender = computed(() => !isRendering.value && status.value !== 'rendering')

  const hasOutput = computed(() => outputBlob.value !== null)

  // Actions
  function startRender(slideCount: number) {
    isRendering.value = true
    status.value = 'preparing'
    currentSlide.value = 0
    totalSlides.value = slideCount
    progress.value = 0
    message.value = 'Preparing to render...'
    outputBlob.value = null
    error.value = null
  }

  function updateProgress(slideIndex: number, progressPercent: number, statusMessage?: string) {
    currentSlide.value = slideIndex
    progress.value = progressPercent
    if (statusMessage) {
      message.value = statusMessage
    }
  }

  function setStatus(newStatus: RenderStatus, statusMessage?: string) {
    status.value = newStatus
    if (statusMessage) {
      message.value = statusMessage
    }
  }

  function completeRender(blob: Blob) {
    isRendering.value = false
    status.value = 'completed'
    progress.value = 100
    message.value = 'Video ready for download'
    outputBlob.value = blob
  }

  function setError(errorMessage: string) {
    isRendering.value = false
    status.value = 'error'
    message.value = errorMessage
    error.value = errorMessage
  }

  function updateSettings(newSettings: Partial<RenderSettings>) {
    settings.value = {
      ...settings.value,
      ...newSettings
    }
  }

  function reset() {
    isRendering.value = false
    status.value = 'idle'
    currentSlide.value = 0
    totalSlides.value = 0
    progress.value = 0
    message.value = ''
    outputBlob.value = null
    error.value = null
  }

  function downloadVideo(filename = 'video.mp4') {
    if (!outputBlob.value) return

    const url = URL.createObjectURL(outputBlob.value)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return {
    // State
    isRendering,
    status,
    currentSlide,
    totalSlides,
    progress,
    message,
    settings,
    outputBlob,
    error,
    // Getters
    renderProgress,
    canRender,
    hasOutput,
    // Actions
    startRender,
    updateProgress,
    setStatus,
    completeRender,
    setError,
    updateSettings,
    reset,
    downloadVideo
  }
})
