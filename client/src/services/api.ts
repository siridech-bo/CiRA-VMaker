import axios from 'axios'
import type { UploadResponse, ConversionStatusResponse, Slide } from '@/types'

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 120000
})

export const api = {
  async uploadFile(
    file: File,
    onProgress?: (progress: number) => void
  ): Promise<UploadResponse> {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<UploadResponse>('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (event) => {
        if (event.total && onProgress) {
          onProgress(event.loaded / event.total)
        }
      }
    })

    return response.data
  },

  async getConversionStatus(id: string): Promise<ConversionStatusResponse> {
    const response = await apiClient.get<ConversionStatusResponse>(`/upload/${id}/status`)
    return response.data
  },

  async pollConversionStatus(
    id: string,
    onProgress?: (progress: number) => void,
    maxAttempts = 60,
    interval = 2000
  ): Promise<Slide[]> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.getConversionStatus(id)

      if (onProgress) {
        onProgress(status.progress)
      }

      if (status.status === 'completed' && status.slides) {
        return status.slides.map(s => ({
          id: s.id,
          index: s.index,
          imageUrl: s.imageUrl,
          thumbnailUrl: s.thumbnailUrl,
          width: s.width,
          height: s.height,
          caption: '',
          audioGenerated: false,
          audioDuration: null
        }))
      }

      if (status.status === 'error') {
        throw new Error(status.error || 'Conversion failed')
      }

      await new Promise(resolve => setTimeout(resolve, interval))
    }

    throw new Error('Conversion timed out')
  },

  async getSlideImage(slideId: string): Promise<Blob> {
    const response = await apiClient.get(`/slides/${slideId}/image`, {
      responseType: 'blob'
    })
    return response.data
  },

  async getSlideThumbnail(slideId: string): Promise<Blob> {
    const response = await apiClient.get(`/slides/${slideId}/thumbnail`, {
      responseType: 'blob'
    })
    return response.data
  },

  async cancelUpload(id: string): Promise<void> {
    await apiClient.delete(`/upload/${id}`)
  }
}

export default api
