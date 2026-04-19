import { ref, onUnmounted } from 'vue'
import { useTTSStore } from '@/stores/ttsStore'
import { useProjectStore } from '@/stores/projectStore'
import { blobStorage } from '@/services/blobStorage'
import { parsePointerMarkers } from '@/utils/pointerParser'
import { processAudio, PROCESSING_PRESETS } from '@/utils/audioProcessor'
import {
  initEspeakTTS,
  synthesize as espeakSynthesize,
  ESPEAK_THAI_VOICES,
  cleanup as cleanupEspeak
} from '@/services/espeakTTS'
import {
  checkServerAvailable,
  synthesizeWithEdgeTTS,
  EDGE_THAI_VOICES,
  isServerAvailable
} from '@/services/edgeTTS'
import type { TTSWorkerMessage, TTSWorkerResponse, TTSEngine, TTSLanguage } from '@/types'
import { ENGINE_FOR_LANGUAGE } from '@/types'

// Worker for Kokoro engine only
let kokoroWorker: Worker | null = null
let kokoroWorkerReady = false

// Track Thai TTS ready state
let thaiTTSReady = false
let useEdgeTTS = false // true = use server, false = use eSpeak

// Track pending generation promises
let pendingGeneration: {
  slideId: string
  resolve: () => void
  reject: (error: Error) => void
} | null = null

export function useTTS() {
  const ttsStore = useTTSStore()
  const projectStore = useProjectStore()
  const isInitializing = ref(false)

  function createKokoroWorker(): Worker {
    if (kokoroWorker) return kokoroWorker

    kokoroWorker = new Worker(
      new URL('@/workers/tts.worker.ts', import.meta.url),
      { type: 'module' }
    )

    kokoroWorker.onmessage = (event: MessageEvent<TTSWorkerResponse>) => {
      handleWorkerMessage(event.data, 'kokoro')
    }

    kokoroWorker.onerror = (error) => {
      console.error('Kokoro TTS Worker error:', error)
      if (ttsStore.engine === 'kokoro') {
        ttsStore.setError('TTS worker error: ' + error.message)
      }
      if (pendingGeneration) {
        pendingGeneration.reject(new Error('TTS worker error: ' + error.message))
        pendingGeneration = null
      }
    }

    return kokoroWorker
  }

  function handleWorkerMessage(data: TTSWorkerResponse, engine: TTSEngine) {
    switch (data.type) {
      case 'init-progress':
        if (ttsStore.engine === engine) {
          ttsStore.setLoadProgress(data.progress ?? 0)
        }
        break

      case 'init-complete':
        if (engine === 'kokoro') {
          kokoroWorkerReady = true
        }
        ttsStore.markEngineLoaded(engine)

        if (ttsStore.engine === engine) {
          ttsStore.setModelStatus('ready')
          ttsStore.setLoadProgress(1)
          if (data.voices) {
            ttsStore.setVoices(data.voices)
          }
          if (data.deviceType) {
            ttsStore.setDeviceType(data.deviceType)
          }
        }
        break

      case 'voices-list':
        if (ttsStore.engine === engine && data.voices) {
          ttsStore.setVoices(data.voices)
        }
        break

      case 'generate-progress':
        // Could update progress UI here
        break

      case 'generate-complete':
        if (data.slideId && data.audioBlob && data.duration !== undefined) {
          handleAudioGenerated(data.slideId, data.audioBlob, data.duration)
        }
        ttsStore.stopGenerating()
        if (pendingGeneration && pendingGeneration.slideId === data.slideId) {
          pendingGeneration.resolve()
          pendingGeneration = null
        }
        break

      case 'error':
        console.error(`${engine} TTS error:`, data.message)
        if (ttsStore.engine === engine) {
          ttsStore.setError(data.message ?? 'Unknown TTS error')
        }
        ttsStore.stopGenerating()
        if (pendingGeneration) {
          pendingGeneration.reject(new Error(data.message ?? 'Unknown TTS error'))
          pendingGeneration = null
        }
        break
    }
  }

  async function handleAudioGenerated(slideId: string, blob: Blob, duration: number) {
    const projectId = projectStore.project?.id ?? 'default'

    // Apply audio post-processing if enabled
    const presetName = ttsStore.audioProcessingPreset
    const processingSettings = PROCESSING_PRESETS[presetName]

    let processedBlob = blob
    if (processingSettings.enabled) {
      try {
        console.log(`Applying audio processing preset: ${presetName}`)
        processedBlob = await processAudio(blob, processingSettings)
      } catch (error) {
        console.error('Audio processing failed, using original:', error)
        // Fall back to original audio
      }
    }

    await blobStorage.storeAudio(slideId, processedBlob, duration, projectId)
    projectStore.markAudioGenerated(slideId, duration)
  }

  async function initTTS(preferredDevice: 'webgpu' | 'wasm' = 'webgpu'): Promise<void> {
    const engine = ttsStore.engine

    // Check if this engine is already loaded
    if (engine === 'kokoro' && kokoroWorkerReady) {
      ttsStore.setModelStatus('ready')
      return
    }
    if (engine === 'mms' && thaiTTSReady) {
      ttsStore.setModelStatus('ready')
      return
    }

    if (ttsStore.isModelLoading) return

    isInitializing.value = true
    ttsStore.setModelStatus('loading')
    ttsStore.setLoadProgress(0)

    try {
      if (engine === 'kokoro') {
        // Use worker for Kokoro
        const w = createKokoroWorker()
        const message: TTSWorkerMessage = {
          type: 'init',
          device: preferredDevice
        }
        w.postMessage(message)
      } else {
        // Thai TTS: Try Edge TTS server first, fall back to eSpeak
        ttsStore.setLoadProgress(0.1)
        console.log('[Thai TTS] Checking server availability...')

        const serverOk = await checkServerAvailable()

        if (serverOk) {
          // Use Edge TTS (server-side neural voices)
          useEdgeTTS = true
          thaiTTSReady = true
          ttsStore.markEngineLoaded('mms')
          ttsStore.setModelStatus('ready')
          ttsStore.setLoadProgress(1)
          ttsStore.setVoices(EDGE_THAI_VOICES)
          ttsStore.setDeviceType('server')
          console.log('[Thai TTS] Using Edge TTS (neural voices)')
        } else {
          // Fall back to eSpeak (client-side)
          console.log('[Thai TTS] Server unavailable, falling back to eSpeak...')
          await initEspeakTTS((progress) => {
            ttsStore.setLoadProgress(0.1 + progress * 0.9)
          })

          useEdgeTTS = false
          thaiTTSReady = true
          ttsStore.markEngineLoaded('mms')
          ttsStore.setModelStatus('ready')
          ttsStore.setLoadProgress(1)
          ttsStore.setVoices(ESPEAK_THAI_VOICES)
          ttsStore.setDeviceType('wasm')
          console.log('[Thai TTS] Using eSpeak (client-side)')
        }
      }
    } catch (error) {
      ttsStore.setError(error instanceof Error ? error.message : 'Failed to initialize TTS')
      isInitializing.value = false
    }
  }

  async function switchLanguage(lang: TTSLanguage): Promise<void> {
    const newEngine = ENGINE_FOR_LANGUAGE[lang]
    const currentEngine = ttsStore.engine

    // Update store
    ttsStore.setLanguage(lang)

    // If switching to a different engine, initialize it if needed
    if (newEngine !== currentEngine) {
      const engineReady = newEngine === 'kokoro' ? kokoroWorkerReady : thaiTTSReady
      if (!engineReady) {
        await initTTS()
      } else {
        ttsStore.setModelStatus('ready')
        // Set voices for the engine
        if (newEngine === 'mms') {
          ttsStore.setVoices(useEdgeTTS ? EDGE_THAI_VOICES : ESPEAK_THAI_VOICES)
        }
      }
    }
  }

  async function generateAudio(slideId: string, text: string): Promise<void> {
    const engine = ttsStore.engine

    // Check if engine is ready
    const engineReady = engine === 'kokoro' ? kokoroWorkerReady : thaiTTSReady
    if (!engineReady) {
      throw new Error('TTS model not ready')
    }

    if (ttsStore.isGenerating) {
      throw new Error('Already generating audio')
    }

    if (!text.trim()) {
      throw new Error('Text is empty')
    }

    // Parse and strip pointer markers before sending to TTS
    const { cleanText } = parsePointerMarkers(text)

    if (!cleanText.trim()) {
      throw new Error('Text is empty after removing pointer markers')
    }

    ttsStore.startGenerating(slideId)

    if (engine === 'kokoro') {
      // Use worker for Kokoro
      if (!kokoroWorker) {
        throw new Error('Kokoro worker not initialized')
      }

      const message: TTSWorkerMessage = {
        type: 'generate',
        slideId,
        text: cleanText,
        voice: ttsStore.selectedVoice ?? 'af_heart',
        speed: ttsStore.speed,
        blend: {
          enabled: ttsStore.blendEnabled,
          secondaryVoice: ttsStore.secondaryVoice,
          blendRatio: ttsStore.blendRatio
        }
      }

      return new Promise<void>((resolve, reject) => {
        pendingGeneration = { slideId, resolve, reject }
        kokoroWorker!.postMessage(message)
      })
    } else {
      // Thai TTS
      try {
        let result: { audioBlob: Blob; duration: number }

        if (useEdgeTTS && isServerAvailable()) {
          // Try Edge TTS first
          try {
            const voiceId = ttsStore.selectedVoice ?? 'th-TH-PremwadeeNeural'
            result = await synthesizeWithEdgeTTS(cleanText, voiceId, ttsStore.speed)
          } catch (edgeError) {
            console.warn('[Thai TTS] Edge TTS failed, trying eSpeak fallback:', edgeError)
            // Fall back to eSpeak
            const voiceId = 'th'
            result = await espeakSynthesize(cleanText, voiceId, ttsStore.speed)
          }
        } else {
          // Use eSpeak directly
          const voiceId = ttsStore.selectedVoice ?? 'th'
          result = await espeakSynthesize(cleanText, voiceId, ttsStore.speed)
        }

        await handleAudioGenerated(slideId, result.audioBlob, result.duration)
        ttsStore.stopGenerating()
      } catch (error) {
        ttsStore.setError(error instanceof Error ? error.message : 'Failed to generate Thai audio')
        ttsStore.stopGenerating()
        throw error
      }
    }
  }

  function cancelGeneration(): void {
    const engine = ttsStore.engine

    if (engine === 'kokoro' && kokoroWorker && ttsStore.isGenerating) {
      const message: TTSWorkerMessage = { type: 'cancel' }
      kokoroWorker.postMessage(message)
      ttsStore.stopGenerating()
      if (pendingGeneration) {
        pendingGeneration.reject(new Error('Generation cancelled'))
        pendingGeneration = null
      }
    } else if (engine === 'mms' && ttsStore.isGenerating) {
      // Just stop tracking - synthesis may continue but we ignore result
      ttsStore.stopGenerating()
    }
  }

  function listVoices(): void {
    const engine = ttsStore.engine

    if (engine === 'kokoro' && kokoroWorker && kokoroWorkerReady) {
      const message: TTSWorkerMessage = { type: 'list-voices' }
      kokoroWorker.postMessage(message)
    } else if (engine === 'mms' && thaiTTSReady) {
      ttsStore.setVoices(useEdgeTTS ? EDGE_THAI_VOICES : ESPEAK_THAI_VOICES)
    }
  }

  onUnmounted(() => {
    // Don't terminate workers on unmount - they're shared
  })

  return {
    isInitializing,
    initTTS,
    switchLanguage,
    generateAudio,
    cancelGeneration,
    listVoices
  }
}

export function terminateTTSWorkers(): void {
  if (kokoroWorker) {
    kokoroWorker.terminate()
    kokoroWorker = null
    kokoroWorkerReady = false
  }
  cleanupEspeak()
  thaiTTSReady = false
  useEdgeTTS = false
}

// Legacy export for backwards compatibility
export function terminateTTSWorker(): void {
  terminateTTSWorkers()
}
