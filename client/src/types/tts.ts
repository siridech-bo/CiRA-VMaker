export interface Voice {
  id: string
  name: string
  language: string
  gender: 'male' | 'female' | 'neutral'
}

export type TTSModelStatus = 'unloaded' | 'loading' | 'ready' | 'error'
export type TTSDeviceType = 'webgpu' | 'wasm' | 'cpu' | 'server'
export type TTSLanguage = 'en' | 'th'
export type TTSEngine = 'kokoro' | 'mms'

export interface TTSState {
  modelStatus: TTSModelStatus
  deviceType: TTSDeviceType | null
  loadProgress: number
  availableVoices: Voice[]
  selectedVoice: string | null
  speed: number
  language: TTSLanguage
  engine: TTSEngine
  isGenerating: boolean
  generatingSlideId: string | null
  error: string | null
}

export const LANGUAGE_LABELS: Record<TTSLanguage, string> = {
  en: 'English',
  th: 'ภาษาไทย'
}

export const ENGINE_FOR_LANGUAGE: Record<TTSLanguage, TTSEngine> = {
  en: 'kokoro',
  th: 'mms'
}

export interface VoiceBlendConfig {
  enabled: boolean
  secondaryVoice: string
  blendRatio: number  // 0-1, where 0 = 100% primary, 1 = 100% secondary
}

export interface TTSWorkerMessage {
  type: 'init' | 'generate' | 'list-voices' | 'cancel'
  device?: TTSDeviceType
  text?: string
  voice?: string
  speed?: number
  slideId?: string
  blend?: VoiceBlendConfig
}

export interface TTSWorkerResponse {
  type: 'init-progress' | 'init-complete' | 'generate-progress' | 'generate-complete' | 'voices-list' | 'error'
  progress?: number
  voices?: Voice[]
  audioBlob?: Blob
  duration?: number
  slideId?: string
  message?: string
  deviceType?: TTSDeviceType
}
