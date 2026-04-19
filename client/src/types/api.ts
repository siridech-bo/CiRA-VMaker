export interface UploadResponse {
  id: string
  filename: string
  type: 'pdf' | 'pptx'
  status: 'processing' | 'completed' | 'error'
  slideCount: number | null
  error?: string
}

export interface SlideImageResponse {
  id: string
  index: number
  imageUrl: string
  thumbnailUrl: string
  width: number
  height: number
}

export interface ConversionStatusResponse {
  id: string
  status: 'processing' | 'completed' | 'error'
  progress: number
  slides?: SlideImageResponse[]
  error?: string
}

export interface ApiError {
  message: string
  code?: string
  details?: Record<string, unknown>
}
