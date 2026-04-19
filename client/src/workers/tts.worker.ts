import type { TTSWorkerMessage, TTSWorkerResponse, Voice, TTSDeviceType, VoiceBlendConfig } from '@/types'

// WebGPU type declaration for workers
declare global {
  interface Navigator {
    gpu?: {
      requestAdapter(): Promise<unknown | null>
    }
  }
}

let kokoro: any = null
let currentDevice: TTSDeviceType = 'wasm'
let isGenerating = false
let shouldCancel = false

const AVAILABLE_VOICES: Voice[] = [
  { id: 'af_heart', name: 'Heart', language: 'en-US', gender: 'female' },
  { id: 'af_bella', name: 'Bella', language: 'en-US', gender: 'female' },
  { id: 'af_nicole', name: 'Nicole', language: 'en-US', gender: 'female' },
  { id: 'af_sarah', name: 'Sarah', language: 'en-US', gender: 'female' },
  { id: 'af_sky', name: 'Sky', language: 'en-US', gender: 'female' },
  { id: 'am_adam', name: 'Adam', language: 'en-US', gender: 'male' },
  { id: 'am_michael', name: 'Michael', language: 'en-US', gender: 'male' },
  { id: 'bf_emma', name: 'Emma', language: 'en-GB', gender: 'female' },
  { id: 'bf_isabella', name: 'Isabella', language: 'en-GB', gender: 'female' },
  { id: 'bm_george', name: 'George', language: 'en-GB', gender: 'male' },
  { id: 'bm_lewis', name: 'Lewis', language: 'en-GB', gender: 'male' }
]

// Maximum characters per chunk (Kokoro works best with shorter segments)
const MAX_CHUNK_LENGTH = 300

function sendMessage(message: TTSWorkerResponse) {
  self.postMessage(message)
}

async function checkWebGPUSupport(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false
    const adapter = await navigator.gpu.requestAdapter()
    return adapter !== null
  } catch {
    return false
  }
}

async function initializeKokoro(preferredDevice: TTSDeviceType): Promise<void> {
  try {
    sendMessage({ type: 'init-progress', progress: 0.1 })

    const hasWebGPU = preferredDevice === 'webgpu' && await checkWebGPUSupport()
    currentDevice = hasWebGPU ? 'webgpu' : 'wasm'

    sendMessage({ type: 'init-progress', progress: 0.2 })

    const { KokoroTTS } = await import('kokoro-js')

    sendMessage({ type: 'init-progress', progress: 0.4 })

    kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
      dtype: currentDevice === 'webgpu' ? 'fp32' : 'q8',
      device: currentDevice,
      progress_callback: (progress: any) => {
        const percent = 0.4 + (progress.progress || 0) * 0.5
        sendMessage({ type: 'init-progress', progress: percent })
      }
    })

    sendMessage({ type: 'init-progress', progress: 0.95 })

    sendMessage({
      type: 'init-complete',
      voices: AVAILABLE_VOICES,
      deviceType: currentDevice
    })
  } catch (error) {
    console.error('Failed to initialize Kokoro:', error)

    if (preferredDevice === 'webgpu') {
      console.log('WebGPU failed, falling back to WASM')
      await initializeKokoro('wasm')
    } else {
      sendMessage({
        type: 'error',
        message: `Failed to initialize TTS: ${error instanceof Error ? error.message : 'Unknown error'}`
      })
    }
  }
}

/**
 * Split text into sentences for better TTS processing
 * Kokoro TTS works better with shorter text segments
 */
function splitIntoChunks(text: string): string[] {
  // First, split by sentence boundaries
  const sentenceRegex = /[.!?]+[\s]+|[.!?]+$/g
  const sentences: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentence = text.slice(lastIndex, match.index + match[0].length).trim()
    if (sentence) {
      sentences.push(sentence)
    }
    lastIndex = match.index + match[0].length
  }

  // Add remaining text if any
  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    sentences.push(remaining)
  }

  // If no sentences found, just use the whole text
  if (sentences.length === 0 && text.trim()) {
    sentences.push(text.trim())
  }

  // Now combine short sentences and split long ones
  const chunks: string[] = []
  let currentChunk = ''

  for (const sentence of sentences) {
    // If sentence itself is too long, split it further
    if (sentence.length > MAX_CHUNK_LENGTH) {
      // Save current chunk first
      if (currentChunk) {
        chunks.push(currentChunk.trim())
        currentChunk = ''
      }

      // Split long sentence by commas, semicolons, or other natural breaks
      const parts = sentence.split(/[,;:]\s+/)
      for (const part of parts) {
        if (part.length > MAX_CHUNK_LENGTH) {
          // If still too long, split by words
          const words = part.split(/\s+/)
          let wordChunk = ''
          for (const word of words) {
            if ((wordChunk + ' ' + word).length > MAX_CHUNK_LENGTH) {
              if (wordChunk) {
                chunks.push(wordChunk.trim())
              }
              wordChunk = word
            } else {
              wordChunk = wordChunk ? wordChunk + ' ' + word : word
            }
          }
          if (wordChunk) {
            chunks.push(wordChunk.trim())
          }
        } else if ((currentChunk + ' ' + part).length > MAX_CHUNK_LENGTH) {
          if (currentChunk) {
            chunks.push(currentChunk.trim())
          }
          currentChunk = part
        } else {
          currentChunk = currentChunk ? currentChunk + ' ' + part : part
        }
      }
    } else if ((currentChunk + ' ' + sentence).length > MAX_CHUNK_LENGTH) {
      // Current chunk would be too long, save it and start new one
      if (currentChunk) {
        chunks.push(currentChunk.trim())
      }
      currentChunk = sentence
    } else {
      // Add sentence to current chunk
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence
    }
  }

  // Don't forget the last chunk
  if (currentChunk) {
    chunks.push(currentChunk.trim())
  }

  return chunks.filter(c => c.length > 0)
}

/**
 * Concatenate multiple Float32Arrays into one
 */
function concatenateAudioData(arrays: Float32Array[]): Float32Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0)
  const result = new Float32Array(totalLength)
  let offset = 0
  for (const arr of arrays) {
    result.set(arr, offset)
    offset += arr.length
  }
  return result
}

/**
 * Voice segment for alternating voices
 */
interface VoiceSegment {
  text: string
  voiceIndex: 1 | 2  // 1 = primary voice, 2 = secondary voice
}

/**
 * Parse text with voice markers [1] and [2] to split into voice segments
 * If no markers found, returns single segment with primary voice
 * Example: "[1]Hello there![2]How are you?[1]I'm fine."
 */
function parseVoiceSegments(text: string): VoiceSegment[] {
  const segments: VoiceSegment[] = []

  // Check if text has voice markers
  const hasMarkers = /\[1\]|\[2\]/.test(text)

  if (!hasMarkers) {
    // No markers - return whole text as primary voice
    return [{ text: text.trim(), voiceIndex: 1 }]
  }

  // Split by voice markers, keeping track of which voice
  const pattern = /\[([12])\]/g
  let lastIndex = 0
  let currentVoice: 1 | 2 = 1  // Default to voice 1
  let match: RegExpExecArray | null

  // Check if text starts with a marker
  const startsWithMarker = text.match(/^\[([12])\]/)
  if (startsWithMarker) {
    currentVoice = parseInt(startsWithMarker[1]) as 1 | 2
  }

  while ((match = pattern.exec(text)) !== null) {
    // Get text before this marker
    const textBefore = text.slice(lastIndex, match.index).trim()
    if (textBefore) {
      segments.push({ text: textBefore, voiceIndex: currentVoice })
    }

    // Update voice for next segment
    currentVoice = parseInt(match[1]) as 1 | 2
    lastIndex = match.index + match[0].length
  }

  // Get remaining text after last marker
  const remaining = text.slice(lastIndex).trim()
  if (remaining) {
    segments.push({ text: remaining, voiceIndex: currentVoice })
  }

  return segments
}

async function generateAudio(
  slideId: string,
  text: string,
  voice: string,
  speed: number,
  blend?: VoiceBlendConfig
): Promise<void> {
  if (!kokoro) {
    sendMessage({ type: 'error', message: 'TTS model not initialized' })
    return
  }

  if (isGenerating) {
    sendMessage({ type: 'error', message: 'Already generating audio' })
    return
  }

  isGenerating = true
  shouldCancel = false

  try {
    sendMessage({ type: 'generate-progress', progress: 0.05, slideId })

    // Check if voice alternation is enabled (blend enabled with secondary voice)
    const useVoiceAlternation = blend?.enabled && blend.secondaryVoice

    if (useVoiceAlternation && blend) {
      // Parse text for voice markers [1] and [2]
      const voiceSegments = parseVoiceSegments(text)

      console.log(`Voice alternation: ${voiceSegments.length} segments`)

      const audioChunks: Float32Array[] = []
      let sampleRate = 24000
      let totalChunks = 0

      // Count total chunks for progress
      for (const segment of voiceSegments) {
        totalChunks += splitIntoChunks(segment.text).length
      }

      let processedChunks = 0

      for (const segment of voiceSegments) {
        if (shouldCancel) {
          isGenerating = false
          return
        }

        const segmentVoice = segment.voiceIndex === 1 ? voice : blend.secondaryVoice
        const chunks = splitIntoChunks(segment.text)

        console.log(`Segment (voice ${segment.voiceIndex}): "${segment.text.substring(0, 40)}..." - ${chunks.length} chunks`)

        for (const chunk of chunks) {
          if (shouldCancel) {
            isGenerating = false
            return
          }

          const progress = 0.1 + (processedChunks / totalChunks) * 0.75
          sendMessage({ type: 'generate-progress', progress, slideId })

          const audio = await kokoro.generate(chunk, {
            voice: segmentVoice,
            speed
          })

          sampleRate = audio.sampling_rate || 24000
          audioChunks.push(audio.audio)
          processedChunks++
        }
      }

      if (shouldCancel) {
        isGenerating = false
        return
      }

      sendMessage({ type: 'generate-progress', progress: 0.9, slideId })

      const combinedAudio = concatenateAudioData(audioChunks)
      const wavBlob = createWavBlob(combinedAudio, sampleRate)
      const duration = combinedAudio.length / sampleRate

      console.log(`Generated alternating voice audio: ${duration.toFixed(2)}s`)

      sendMessage({
        type: 'generate-complete',
        slideId,
        audioBlob: wavBlob,
        duration
      })
    } else {
      // Standard single-voice generation
      const chunks = splitIntoChunks(text)
      const audioChunks: Float32Array[] = []
      let sampleRate = 24000

      console.log(`Generating audio for ${chunks.length} chunks (single voice)`)

      for (let i = 0; i < chunks.length; i++) {
        if (shouldCancel) {
          isGenerating = false
          return
        }

        const chunk = chunks[i]
        const progress = 0.1 + (i / chunks.length) * 0.75

        sendMessage({
          type: 'generate-progress',
          progress,
          slideId
        })

        console.log(`Generating chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 50)}..."`)

        const audio = await kokoro.generate(chunk, {
          voice,
          speed
        })

        sampleRate = audio.sampling_rate || 24000
        audioChunks.push(audio.audio)
      }

      if (shouldCancel) {
        isGenerating = false
        return
      }

      sendMessage({ type: 'generate-progress', progress: 0.9, slideId })

      const combinedAudio = concatenateAudioData(audioChunks)
      const wavBlob = createWavBlob(combinedAudio, sampleRate)
      const duration = combinedAudio.length / sampleRate

      console.log(`Generated audio: ${duration.toFixed(2)}s from ${chunks.length} chunks`)

      sendMessage({
        type: 'generate-complete',
        slideId,
        audioBlob: wavBlob,
        duration
      })
    }
  } catch (error) {
    console.error('Audio generation failed:', error)
    sendMessage({
      type: 'error',
      message: `Failed to generate audio: ${error instanceof Error ? error.message : 'Unknown error'}`,
      slideId
    })
  } finally {
    isGenerating = false
  }
}

function createWavBlob(audioData: Float32Array, sampleRate: number): Blob {
  const numChannels = 1
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = audioData.length * bytesPerSample
  const bufferSize = 44 + dataSize

  const buffer = new ArrayBuffer(bufferSize)
  const view = new DataView(buffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  writeString(0, 'RIFF')
  view.setUint32(4, bufferSize - 8, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  let offset = 44
  for (let i = 0; i < audioData.length; i++) {
    const sample = Math.max(-1, Math.min(1, audioData[i]))
    const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
    view.setInt16(offset, intSample, true)
    offset += 2
  }

  return new Blob([buffer], { type: 'audio/wav' })
}

self.onmessage = async (event: MessageEvent<TTSWorkerMessage>) => {
  const { type } = event.data

  switch (type) {
    case 'init':
      await initializeKokoro(event.data.device || 'webgpu')
      break

    case 'generate':
      if (event.data.slideId && event.data.text) {
        await generateAudio(
          event.data.slideId,
          event.data.text,
          event.data.voice || 'af_heart',
          event.data.speed || 1.0,
          event.data.blend
        )
      }
      break

    case 'list-voices':
      sendMessage({ type: 'voices-list', voices: AVAILABLE_VOICES })
      break

    case 'cancel':
      shouldCancel = true
      break
  }
}

export {}
