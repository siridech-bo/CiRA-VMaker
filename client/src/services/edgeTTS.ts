/**
 * Edge TTS Service for Thai language (Server-side)
 *
 * Uses Microsoft Edge TTS via server proxy for high-quality neural Thai voices.
 * Falls back to client-side eSpeak if server is unavailable.
 */

import type { Voice } from '@/types'

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
 * Check if server is known to be available
 */
export function isServerAvailable(): boolean {
  return serverAvailable === true
}
