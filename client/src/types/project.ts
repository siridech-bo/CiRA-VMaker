export interface Slide {
  id: string
  index: number
  imageUrl: string
  thumbnailUrl: string
  width: number
  height: number
  caption: string
  audioGenerated: boolean
  audioDuration: number | null
}

export interface VoiceBlendSettings {
  enabled: boolean
  secondaryVoice: string
  blendRatio: number  // 0-1, where 0 = 100% primary, 1 = 100% secondary
}

export type AudioProcessingPreset = 'none' | 'natural' | 'broadcast' | 'energetic' | 'warm'

export interface VoiceSettings {
  voice: string
  speed: number
  pitch: number
  language: 'en' | 'th'
  blend?: VoiceBlendSettings
  audioProcessing?: AudioProcessingPreset
}

export interface Project {
  id: string
  name: string
  slides: Slide[]
  voiceSettings: VoiceSettings
  createdAt: Date
  updatedAt: Date
}

export interface ProjectState {
  project: Project | null
  selectedSlideId: string | null
  isLoading: boolean
  error: string | null
}

export type UploadStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'error'

export interface UploadProgress {
  status: UploadStatus
  progress: number
  message: string
}
