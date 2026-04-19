<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/projectStore'
import SlideUploader from '@/components/slides/SlideUploader.vue'
import type { Slide } from '@/types'

const router = useRouter()
const projectStore = useProjectStore()

const projectName = ref('My Presentation')
const isProcessing = ref(false)
const uploadError = ref<string | null>(null)

async function handleSlidesUploaded(slides: Slide[]) {
  isProcessing.value = true
  uploadError.value = null

  try {
    projectStore.createProject(projectName.value, slides)
    router.push('/editor')
  } catch (error) {
    uploadError.value = error instanceof Error ? error.message : 'Failed to create project'
  } finally {
    isProcessing.value = false
  }
}

function handleUploadError(error: string) {
  uploadError.value = error
}
</script>

<template>
  <div class="min-h-full flex flex-col items-center justify-center p-8">
    <div class="max-w-2xl w-full space-y-8">
      <div class="text-center space-y-4">
        <div class="flex justify-center">
          <div class="w-20 h-20 bg-primary-500/20 rounded-2xl flex items-center justify-center">
            <svg class="w-10 h-10 text-primary-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </div>
        </div>

        <h1 class="text-3xl font-bold text-white">
          Create AI-Narrated Videos
        </h1>
        <p class="text-dark-400 max-w-md mx-auto">
          Upload your PDF or PowerPoint presentation, add narration text, and generate a professional video with AI voice.
        </p>
      </div>

      <div class="space-y-4">
        <div>
          <label for="project-name" class="label">Project Name</label>
          <input
            id="project-name"
            v-model="projectName"
            type="text"
            class="input"
            placeholder="Enter project name"
          />
        </div>

        <SlideUploader
          :is-processing="isProcessing"
          @slides-uploaded="handleSlidesUploaded"
          @error="handleUploadError"
        />

        <div v-if="uploadError" class="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p class="text-sm text-red-400">{{ uploadError }}</p>
        </div>
      </div>

      <div class="grid grid-cols-3 gap-4 pt-8 border-t border-dark-700">
        <div class="text-center">
          <div class="w-12 h-12 bg-dark-700 rounded-xl flex items-center justify-center mx-auto mb-2">
            <svg class="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 class="font-medium text-dark-200">Upload</h3>
          <p class="text-xs text-dark-400 mt-1">PDF or PPTX files</p>
        </div>

        <div class="text-center">
          <div class="w-12 h-12 bg-dark-700 rounded-xl flex items-center justify-center mx-auto mb-2">
            <svg class="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
          <h3 class="font-medium text-dark-200">Write</h3>
          <p class="text-xs text-dark-400 mt-1">Add narration text</p>
        </div>

        <div class="text-center">
          <div class="w-12 h-12 bg-dark-700 rounded-xl flex items-center justify-center mx-auto mb-2">
            <svg class="w-6 h-6 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 class="font-medium text-dark-200">Export</h3>
          <p class="text-xs text-dark-400 mt-1">Download MP4 video</p>
        </div>
      </div>

      <div class="text-center pt-4">
        <p class="text-xs text-dark-500">
          All processing happens in your browser. No files are uploaded to any server.
        </p>
      </div>
    </div>
  </div>
</template>
