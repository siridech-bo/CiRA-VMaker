/**
 * Edge TTS Service for Thai language (Server-side)
 *
 * Uses Microsoft Edge TTS via server proxy for high-quality neural Thai voices.
 * Falls back to client-side eSpeak if server is unavailable.
 */

import type { Voice, WordTiming } from '@/types'

const API_BASE = '/api/tts'

// Thai neural voices from Edge TTS
export const EDGE_THAI_VOICES: Voice[] = [
  {
    id: 'th-TH-PremwadeeNeural',
    name: 'Premwadee (Female)',
    language: 'th-TH',
    gender: 'female'
  },
  {
    id: 'th-TH-NiwatNeural',
    name: 'Niwat (Male)',
    language: 'th-TH',
    gender: 'male'
  }
]

let serverAvailable: boolean | null = null // null = not checked yet

/**
 * Check if Edge TTS server is available
 */
export async function checkServerAvailable(): Promise<boolean> {
  if (serverAvailable !== null) {
    return serverAvailable
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout

    const response = await fetch(`${API_BASE}/voices`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    })

    clearTimeout(timeout)
    serverAvailable = response.ok
    console.log(`[Edge TTS] Server ${serverAvailable ? 'available' : 'unavailable'}`)
    return serverAvailable
  } catch {
    serverAvailable = false
    console.log('[Edge TTS] Server unavailable (connection failed)')
    return false
  }
}

/**
 * Reset server availability check (for retry)
 */
export function resetServerCheck(): void {
  serverAvailable = null
}

/**
 * Synthesize text using Edge TTS server
 */
export async function synthesizeWithEdgeTTS(
  text: string,
  voiceId: string = 'th-TH-PremwadeeNeural',
  speed: number = 1.0
): Promise<{ audioBlob: Blob; duration: number }> {
  console.log(`[Edge TTS] Generating: "${text.substring(0, 50)}..."`)

  const response = await fetch(`${API_BASE}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      voice: voiceId,
      speed
    })
  })

  if (!response.ok) {
    // Try to get error message from JSON response
    const errorText = await response.text()
    let errorMessage = `Server error: ${response.status}`
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.message || errorMessage
    } catch {
      // Response wasn't JSON
    }
    throw new Error(errorMessage)
  }

  // Server returns raw audio bytes
  const audioBlob = await response.blob()
  const duration = audioBlob.size / 6000 // Estimate: ~48kbps MP3

  console.log(`[Edge TTS] Generated ${duration.toFixed(2)}s of audio (${audioBlob.size} bytes)`)

  return {
    audioBlob,
    duration
  }
}

/**
 * Synthesize text for a slide using Edge TTS server (with word timing for subtitles)
 */
export async function synthesizeSlideWithEdgeTTS(
  slideId: string,
  text: string,
  voiceId: string = 'th-TH-PremwadeeNeural',
  speed: number = 1.0
): Promise<{ audioBlob: Blob; duration: number; timings: WordTiming[] }> {
  console.log(`[Edge TTS] Generating slide ${slideId}: "${text.substring(0, 50)}..."`)

  const response = await fetch(`${API_BASE}/generate-slide`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      slideId,
      text,
      voice: voiceId,
      speed
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    let errorMessage = `Server error: ${response.status}`
    try {
      const errorData = JSON.parse(errorText)
      errorMessage = errorData.message || errorMessage
    } catch {
      // Response wasn't JSON
    }
    throw new Error(errorMessage)
  }

  const data = await response.json()

  // Convert base64 audio to blob
  const audioBytes = Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))
  const audioBlob = new Blob([audioBytes], { type: data.mimeType || 'audio/mpeg' })

  console.log(`[Edge TTS] Slide ${slideId}: ${data.duration.toFixed(2)}s, ${data.timings?.length || 0} timing entries`)

  return {
    audioBlob,
    duration: data.duration,
    timings: data.timings || []
  }
}

/**
 * Check if server is known to be available
 */
export function isServerAvailable(): boolean {
  return serverAvailable === true
}
