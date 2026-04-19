import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Voice, TTSModelStatus, TTSDeviceType, TTSLanguage, TTSEngine, VoiceBlendSettings, AudioProcessingPreset } from '@/types'
import { ENGINE_FOR_LANGUAGE } from '@/types'

export const useTTSStore = defineStore('tts', () => {
  // State
  const modelStatus = ref<TTSModelStatus>('unloaded')
  const deviceType = ref<TTSDeviceType | null>(null)
  const loadProgress = ref(0)
  const availableVoices = ref<Voice[]>([])
  const selectedVoice = ref<string>('af_heart')
  const speed = ref(1.0)
  const language = ref<TTSLanguage>('en')
  const engine = ref<TTSEngine>('kokoro')
  const isGenerating = ref(false)
  const generatingSlideId = ref<string | null>(null)
  const error = ref<string | null>(null)

  // Voice blending settings
  const blendEnabled = ref(false)
  const secondaryVoice = ref<string>('af_bella')
  const blendRatio = ref(0.3) // 30% secondary voice by default

  // Audio post-processing preset
  const audioProcessingPreset = ref<AudioProcessingPreset>('broadcast')

  // Track which engines are loaded
  const loadedEngines = ref<Set<TTSEngine>>(new Set())

  // Getters
  const isModelReady = computed(() => modelStatus.value === 'ready')
  const isModelLoading = computed(() => modelStatus.value === 'loading')

  const currentVoice = computed(() => {
    return availableVoices.value.find(v => v.id === selectedVoice.value)
  })

  const currentEngine = computed(() => ENGINE_FOR_LANGUAGE[language.value])

  const isEngineLoaded = computed(() => loadedEngines.value.has(engine.value))

  // Actions
  function setModelStatus(status: TTSModelStatus) {
    modelStatus.value = status
  }

  function setDeviceType(device: TTSDeviceType) {
    deviceType.value = device
  }

  function setLoadProgress(progress: number) {
    loadProgress.value = progress
  }

  function setVoices(voices: Voice[]) {
    availableVoices.value = voices
    if (voices.length > 0 && !voices.find(v => v.id === selectedVoice.value)) {
      selectedVoice.value = voices[0].id
    }
  }

  function selectVoice(voiceId: string) {
    if (availableVoices.value.some(v => v.id === voiceId)) {
      selectedVoice.value = voiceId
    }
  }

  function setSpeed(newSpeed: number) {
    speed.value = Math.max(0.5, Math.min(2.0, newSpeed))
  }

  // Voice blending functions
  function setBlendEnabled(enabled: boolean) {
    blendEnabled.value = enabled
  }

  function setSecondaryVoice(voiceId: string) {
    if (availableVoices.value.some(v => v.id === voiceId)) {
      secondaryVoice.value = voiceId
    }
  }

  function setBlendRatio(ratio: number) {
    blendRatio.value = Math.max(0, Math.min(1, ratio))
  }

  function setAudioProcessingPreset(preset: AudioProcessingPreset) {
    audioProcessingPreset.value = preset
  }

  const blendSettings = computed((): VoiceBlendSettings => ({
    enabled: blendEnabled.value,
    secondaryVoice: secondaryVoice.value,
    blendRatio: blendRatio.value
  }))

  // Get the effective voice string for TTS generation (with blend if enabled)
  const effectiveVoice = computed(() => {
    if (!blendEnabled.value || language.value !== 'en') {
      return selectedVoice.value
    }
    // For Kokoro, we'll pass blend info separately to the worker
    return selectedVoice.value
  })

  function setLanguage(lang: TTSLanguage) {
    language.value = lang
    engine.value = ENGINE_FOR_LANGUAGE[lang]

    // Set default voice for language
    if (lang === 'th') {
      selectedVoice.value = 'mms-tts-tha'
    } else {
      selectedVoice.value = 'af_heart'
    }
  }

  function markEngineLoaded(eng: TTSEngine) {
    loadedEngines.value.add(eng)
  }

  function startGenerating(slideId: string) {
    isGenerating.value = true
    generatingSlideId.value = slideId
    error.value = null
  }

  function stopGenerating() {
    isGenerating.value = false
    generatingSlideId.value = null
  }

  function setError(errorMessage: string | null) {
    error.value = errorMessage
    if (errorMessage) {
      modelStatus.value = 'error'
      isGenerating.value = false
      generatingSlideId.value = null
    }
  }

  function reset() {
    modelStatus.value = 'unloaded'
    deviceType.value = null
    loadProgress.value = 0
    isGenerating.value = false
    generatingSlideId.value = null
    error.value = null
    // Don't reset loadedEngines - we want to keep track of what's loaded
  }

  function resetAll() {
    reset()
    loadedEngines.value.clear()
    language.value = 'en'
    engine.value = 'kokoro'
  }

  return {
    // State
    modelStatus,
    deviceType,
    loadProgress,
    availableVoices,
    selectedVoice,
    speed,
    language,
    engine,
    isGenerating,
    generatingSlideId,
    error,
    loadedEngines,
    // Blend state
    blendEnabled,
    secondaryVoice,
    blendRatio,
    // Audio processing
    audioProcessingPreset,
    // Getters
    isModelReady,
    isModelLoading,
    currentVoice,
    currentEngine,
    isEngineLoaded,
    blendSettings,
    effectiveVoice,
    // Actions
    setModelStatus,
    setDeviceType,
    setLoadProgress,
    setVoices,
    selectVoice,
    setSpeed,
    setBlendEnabled,
    setSecondaryVoice,
    setBlendRatio,
    setAudioProcessingPreset,
    setLanguage,
    markEngineLoaded,
    startGenerating,
    stopGenerating,
    setError,
    reset,
    resetAll
  }
})
