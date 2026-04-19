/**
 * Thai TTS Worker - DEPRECATED
 *
 * Thai TTS is now handled directly by the eSpeak-ng.js service
 * in the main thread. This worker file is kept for backwards
 * compatibility but is no longer used.
 *
 * See: src/services/espeakTTS.ts
 */

import type { TTSWorkerMessage, TTSWorkerResponse, Voice } from '@/types'

const THAI_VOICES: Voice[] = [
  {
    id: 'th',
    name: 'Thai (eSpeak)',
    language: 'th',
    gender: 'neutral'
  }
]

function sendMessage(message: TTSWorkerResponse) {
  self.postMessage(message)
}

self.onmessage = async (event: MessageEvent<TTSWorkerMessage>) => {
  const { type } = event.data

  switch (type) {
    case 'init':
      // Thai TTS is now handled by eSpeak-ng in main thread
      sendMessage({
        type: 'error',
        message: 'Thai TTS is now handled in main thread via eSpeak-ng'
      })
      break

    case 'generate':
      sendMessage({
        type: 'error',
        message: 'Thai TTS is now handled in main thread via eSpeak-ng',
        slideId: event.data.slideId
      })
      break

    case 'list-voices':
      sendMessage({
        type: 'voices-list',
        voices: THAI_VOICES
      })
      break

    case 'cancel':
      break
  }
}

export {}
