/**
 * eSpeak-ng TTS Service for Thai language
 *
 * Uses eSpeak-ng compiled to WebAssembly for client-side Thai TTS.
 * No server required - runs entirely in the browser.
 */

import type { Voice } from '@/types'

// eSpeak-ng global class loaded from script
declare class eSpeakNG {
  constructor(workerPath: string, readyCb?: () => void)
  ready: boolean
  list_voices(callback: (voices: ESpeakVoice[]) => void): void
  set_voice(voice: string, callback?: () => void): void
  set_rate(rate: number, callback?: () => void): void
  set_pitch(pitch: number, callback?: () => void): void
  synthesize(text: string, callback: (samples: Int16Array, sampleRate: number, done: boolean) => void): void
}

interface ESpeakVoice {
  identifier: string
  name: string
  languages: string
}

// Singleton instance
let espeakInstance: eSpeakNG | null = null
let isReady = false
let initPromise: Promise<void> | null = null

const ESPEAK_WORKER_PATH = '/espeakng/espeakng.worker.js'

// Thai voice options (eSpeak voice variants)
export const ESPEAK_THAI_VOICES: Voice[] = [
  {
    id: 'th',
    name: 'Thai (Default)',
    language: 'th',
    gender: 'neutral'
  },
  {
    id: 'th+f1',
    name: 'Thai Female 1',
    language: 'th',
    gender: 'female'
  },
  {
    id: 'th+f2',
    name: 'Thai Female 2',
    language: 'th',
    gender: 'female'
  },
  {
    id: 'th+f3',
    name: 'Thai Female 3',
    language: 'th',
    gender: 'female'
  },
  {
    id: 'th+m1',
    name: 'Thai Male 1',
    language: 'th',
    gender: 'male'
  },
  {
    id: 'th+m2',
    name: 'Thai Male 2',
    language: 'th',
    gender: 'male'
  },
  {
    id: 'th+m3',
    name: 'Thai Male 3',
    language: 'th',
    gender: 'male'
  }
]

/**
 * Load eSpeak-ng script dynamically
 */
function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (typeof window !== 'undefined' && (window as any).eSpeakNG) {
      resolve()
      return
    }

    const script = document.createElement('script')
    script.src = '/espeakng/espeakng.min.js'
    script.async = true

    script.onload = () => {
      console.log('[eSpeak TTS] Script loaded')
      resolve()
    }

    script.onerror = () => {
      reject(new Error('Failed to load eSpeak-ng script'))
    }

    document.head.appendChild(script)
  })
}

/**
 * Initialize eSpeak-ng TTS
 */
export async function initEspeakTTS(onProgress?: (progress: number) => void): Promise<void> {
  if (isReady && espeakInstance) {
    return
  }

  if (initPromise) {
    return initPromise
  }

  onProgress?.(0.1)

  initPromise = (async () => {
    try {
      // Load the script
      await loadScript()
      onProgress?.(0.3)

      // Create eSpeak-ng instance
      const eSpeakNGClass = (window as any).eSpeakNG as typeof eSpeakNG

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('eSpeak-ng initialization timeout'))
        }, 30000)

        espeakInstance = new eSpeakNGClass(ESPEAK_WORKER_PATH, () => {
          clearTimeout(timeout)
          console.log('[eSpeak TTS] Ready')
          resolve()
        })
      })

      onProgress?.(0.9)

      // Set default voice to Thai
      await setVoice('th')

      isReady = true
      onProgress?.(1.0)
      console.log('[eSpeak TTS] Initialization complete')
    } catch (error) {
      console.error('[eSpeak TTS] Initialization failed:', error)
      espeakInstance = null
      initPromise = null
      throw error
    }
  })()

  return initPromise
}

/**
 * Check if eSpeak TTS is ready
 */
export function isEspeakReady(): boolean {
  return isReady && espeakInstance !== null
}

/**
 * Set voice
 */
export function setVoice(voiceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!espeakInstance) {
      reject(new Error('eSpeak not initialized'))
      return
    }

    espeakInstance.set_voice(voiceId, () => {
      console.log(`[eSpeak TTS] Voice set to: ${voiceId}`)
      resolve()
    })
  })
}

/**
 * Set speech rate
 * @param rate Words per minute (80-450, default 175)
 */
export function setRate(rate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!espeakInstance) {
      reject(new Error('eSpeak not initialized'))
      return
    }

    const clampedRate = Math.max(80, Math.min(450, rate))
    espeakInstance.set_rate(clampedRate, () => {
      resolve()
    })
  })
}

/**
 * Set pitch
 * @param pitch Pitch value (0-99, default 50)
 */
export function setPitch(pitch: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!espeakInstance) {
      reject(new Error('eSpeak not initialized'))
      return
    }

    const clampedPitch = Math.max(0, Math.min(99, pitch))
    espeakInstance.set_pitch(clampedPitch, () => {
      resolve()
    })
  })
}

/**
 * Synthesize text to audio
 * @param text Text to synthesize
 * @param voiceId Voice ID (e.g., 'th', 'th+f1')
 * @param speed Speed multiplier (0.5-2.0)
 * @returns Audio blob and duration
 */
export async function synthesize(
  text: string,
  voiceId: string = 'th',
  speed: number = 1.0
): Promise<{ audioBlob: Blob; duration: number }> {
  if (!espeakInstance) {
    throw new Error('eSpeak not initialized')
  }

  // Set voice
  await setVoice(voiceId)

  // Convert speed (0.5-2.0) to eSpeak rate (80-450, default 175)
  const rate = Math.round(175 * speed)
  await setRate(rate)

  return new Promise((resolve, reject) => {
    const audioChunks: Int16Array[] = []
    let sampleRate = 22050 // Default eSpeak sample rate

    espeakInstance!.synthesize(text, (samples: Int16Array, sr: number, done: boolean) => {
      sampleRate = sr

      if (samples && samples.length > 0) {
        // Make a copy since the buffer might be reused
        audioChunks.push(new Int16Array(samples))
      }

      if (done) {
        try {
          // Combine all chunks
          const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)

          if (totalLength === 0) {
            reject(new Error('No audio generated'))
            return
          }

          const combined = new Int16Array(totalLength)
          let offset = 0
          for (const chunk of audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }

          // Convert to WAV
          const wavBlob = int16ToWav(combined, sampleRate)
          const duration = totalLength / sampleRate

          console.log(`[eSpeak TTS] Generated ${duration.toFixed(2)}s of audio`)
          resolve({ audioBlob: wavBlob, duration })
        } catch (error) {
          reject(error)
        }
      }
    })
  })
}

/**
 * List available voices
 */
export function listVoices(): Promise<ESpeakVoice[]> {
  return new Promise((resolve, reject) => {
    if (!espeakInstance) {
      reject(new Error('eSpeak not initialized'))
      return
    }

    espeakInstance.list_voices((voices) => {
      resolve(voices)
    })
  })
}

/**
 * Convert Int16Array audio data to WAV Blob
 */
function int16ToWav(audioData: Int16Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = audioData.length * bytesPerSample
  const headerSize = 44
  const totalSize = headerSize + dataSize

  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  // RIFF header
  writeString(view, 0, 'RIFF')
  view.setUint32(4, totalSize - 8, true)
  writeString(view, 8, 'WAVE')

  // fmt chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true) // chunk size
  view.setUint16(20, 1, true) // audio format (PCM)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)

  // data chunk
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  // Write audio data
  const int16View = new Int16Array(buffer, 44)
  int16View.set(audioData)

  return new Blob([buffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i))
  }
}

/**
 * Cleanup eSpeak instance
 */
export function cleanup(): void {
  espeakInstance = null
  isReady = false
  initPromise = null
}
