<script setup lang="ts">
import { ref, computed } from 'vue'
import { processSlideFile } from '@/services/slideProcessor'
import type { Slide, UploadStatus } from '@/types'

interface Props {
  isProcessing?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isProcessing: false
})

const emit = defineEmits<{
  slidesUploaded: [slides: Slide[]]
  error: [message: string]
}>()

const isDragging = ref(false)
const uploadStatus = ref<UploadStatus>('idle')
const uploadProgress = ref(0)
const statusMessage = ref('')

const isUploading = computed(() =>
  uploadStatus.value === 'uploading' || uploadStatus.value === 'processing' || props.isProcessing
)

const acceptedExtensions = '.pdf,.pptx'

function handleDragEnter(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const files = e.dataTransfer?.files
  if (files && files.length > 0) {
    processFile(files[0])
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    processFile(input.files[0])
  }
  // Reset input so same file can be selected again
  input.value = ''
}

async function processFile(file: File) {
  const extension = file.name.toLowerCase().split('.').pop()

  if (!['pdf', 'pptx'].includes(extension || '')) {
    emit('error', 'Please upload a PDF or PPTX file')
    return
  }

  if (file.size > 100 * 1024 * 1024) {
    emit('error', 'File size must be less than 100MB')
    return
  }

  uploadStatus.value = 'processing'
  uploadProgress.value = 0
  statusMessage.value = 'Reading file...'

  try {
    const slides = await processSlideFile(file, (progress) => {
      uploadProgress.value = (progress.current / progress.total) * 100
      statusMessage.value = progress.message
    })

    uploadStatus.value = 'completed'
    statusMessage.value = 'Done!'
    emit('slidesUploaded', slides)
  } catch (error) {
    uploadStatus.value = 'error'
    statusMessage.value = ''
    emit('error', error instanceof Error ? error.message : 'Processing failed')
  }
}

function triggerFileInput() {
  const input = document.getElementById('file-input') as HTMLInputElement
  input?.click()
}
</script>

<template>
  <div
    class="drop-zone min-h-[200px] p-8"
    :class="{ dragging: isDragging }"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
    @drop="handleDrop"
    @click="triggerFileInput"
  >
    <input
      id="file-input"
      type="file"
      :accept="acceptedExtensions"
      class="hidden"
      @change="handleFileSelect"
    />

    <template v-if="isUploading">
      <div class="flex flex-col items-center gap-4">
        <div class="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <div class="text-center">
          <p class="text-dark-200 font-medium">{{ statusMessage }}</p>
          <div class="progress-bar mt-3 w-48">
            <div
              class="progress-bar-fill"
              :style="{ width: `${uploadProgress}%` }"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-else>
      <div class="flex flex-col items-center gap-4 text-center">
        <div class="w-16 h-16 bg-dark-700 rounded-2xl flex items-center justify-center">
          <svg class="w-8 h-8 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>

        <div>
          <p class="text-dark-200 font-medium">
            Drop your presentation here
          </p>
          <p class="text-dark-400 text-sm mt-1">
            or click to browse
          </p>
        </div>

        <div class="flex items-center gap-2 text-xs text-dark-500">
          <span class="px-2 py-1 bg-dark-700 rounded">PDF</span>
          <span class="px-2 py-1 bg-dark-700 rounded">PPTX</span>
          <span class="text-dark-600">Processed in browser</span>
        </div>

        <p class="text-xs text-dark-500 max-w-xs">
          Files are processed locally in your browser. No server upload required.
        </p>
      </div>
    </template>
  </div>
</template>
