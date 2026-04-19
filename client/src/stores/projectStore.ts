import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Project, Slide, VoiceSettings } from '@/types'

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voice: 'af_heart',
  speed: 1.0,
  pitch: 1.0,
  language: 'en'
}

export const useProjectStore = defineStore('project', () => {
  // State
  const project = ref<Project | null>(null)
  const selectedSlideId = ref<string | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const hasProject = computed(() => project.value !== null)

  const slides = computed(() => project.value?.slides ?? [])

  const selectedSlide = computed(() => {
    if (!selectedSlideId.value || !project.value) return null
    return project.value.slides.find(s => s.id === selectedSlideId.value) ?? null
  })

  const selectedSlideIndex = computed(() => {
    if (!selectedSlide.value) return -1
    return slides.value.findIndex(s => s.id === selectedSlide.value?.id)
  })

  const voiceSettings = computed(() => project.value?.voiceSettings ?? DEFAULT_VOICE_SETTINGS)

  const totalDuration = computed(() => {
    return slides.value.reduce((sum, slide) => sum + (slide.audioDuration ?? 0), 0)
  })

  const allAudioGenerated = computed(() => {
    return slides.value.length > 0 && slides.value.every(s => s.audioGenerated)
  })

  // Actions
  function createProject(name: string, initialSlides: Slide[]) {
    const now = new Date()
    project.value = {
      id: crypto.randomUUID(),
      name,
      slides: initialSlides,
      voiceSettings: { ...DEFAULT_VOICE_SETTINGS },
      createdAt: now,
      updatedAt: now
    }

    if (initialSlides.length > 0) {
      selectedSlideId.value = initialSlides[0].id
    }
  }

  function selectSlide(slideId: string) {
    if (project.value?.slides.some(s => s.id === slideId)) {
      selectedSlideId.value = slideId
    }
  }

  function selectNextSlide() {
    const currentIndex = selectedSlideIndex.value
    if (currentIndex < slides.value.length - 1) {
      selectedSlideId.value = slides.value[currentIndex + 1].id
    }
  }

  function selectPreviousSlide() {
    const currentIndex = selectedSlideIndex.value
    if (currentIndex > 0) {
      selectedSlideId.value = slides.value[currentIndex - 1].id
    }
  }

  function updateCaption(slideId: string, caption: string) {
    if (!project.value) return

    const slide = project.value.slides.find(s => s.id === slideId)
    if (slide) {
      slide.caption = caption
      slide.audioGenerated = false
      slide.audioDuration = null
      project.value.updatedAt = new Date()
    }
  }

  function markAudioGenerated(slideId: string, duration: number) {
    if (!project.value) return

    const slide = project.value.slides.find(s => s.id === slideId)
    if (slide) {
      slide.audioGenerated = true
      slide.audioDuration = duration
      project.value.updatedAt = new Date()
    }
  }

  function updateVoiceSettings(settings: Partial<VoiceSettings>) {
    if (!project.value) return

    project.value.voiceSettings = {
      ...project.value.voiceSettings,
      ...settings
    }
    project.value.updatedAt = new Date()

    // Reset audio generation status when voice settings change
    project.value.slides.forEach(slide => {
      slide.audioGenerated = false
      slide.audioDuration = null
    })
  }

  function reorderSlides(fromIndex: number, toIndex: number) {
    if (!project.value) return

    const slides = [...project.value.slides]
    const [removed] = slides.splice(fromIndex, 1)
    slides.splice(toIndex, 0, removed)

    // Update indices
    slides.forEach((slide, index) => {
      slide.index = index
    })

    project.value.slides = slides
    project.value.updatedAt = new Date()
  }

  function deleteSlide(slideId: string) {
    if (!project.value) return

    const index = project.value.slides.findIndex(s => s.id === slideId)
    if (index === -1) return

    project.value.slides.splice(index, 1)

    // Update indices
    project.value.slides.forEach((slide, i) => {
      slide.index = i
    })

    // Update selection
    if (selectedSlideId.value === slideId) {
      if (project.value.slides.length > 0) {
        const newIndex = Math.min(index, project.value.slides.length - 1)
        selectedSlideId.value = project.value.slides[newIndex].id
      } else {
        selectedSlideId.value = null
      }
    }

    project.value.updatedAt = new Date()
  }

  function setLoading(loading: boolean) {
    isLoading.value = loading
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage
  }

  function resetProject() {
    project.value = null
    selectedSlideId.value = null
    error.value = null
  }

  return {
    // State
    project,
    selectedSlideId,
    isLoading,
    error,
    // Getters
    hasProject,
    slides,
    selectedSlide,
    selectedSlideIndex,
    voiceSettings,
    totalDuration,
    allAudioGenerated,
    // Actions
    createProject,
    selectSlide,
    selectNextSlide,
    selectPreviousSlide,
    updateCaption,
    markAudioGenerated,
    updateVoiceSettings,
    reorderSlides,
    deleteSlide,
    setLoading,
    setError,
    resetProject
  }
})
