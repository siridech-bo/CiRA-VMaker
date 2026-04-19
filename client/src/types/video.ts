export type RenderStatus = 'idle' | 'preparing' | 'rendering' | 'encoding' | 'completed' | 'error'

export interface RenderSettings {
  width: number
  height: number
  fps: number
  videoBitrate: number
  audioBitrate: number
  format: 'mp4' | 'webm'
}

export interface RenderProgress {
  status: RenderStatus
  currentSlide: number
  totalSlides: number
  progress: number
  message: string
}

export interface RenderState {
  isRendering: boolean
  progress: RenderProgress
  settings: RenderSettings
  outputBlob: Blob | null
  error: string | null
}

export const DEFAULT_RENDER_SETTINGS: RenderSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  videoBitrate: 5000000,
  audioBitrate: 128000,
  format: 'mp4'
}
