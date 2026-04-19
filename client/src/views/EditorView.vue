<script setup lang="ts">
import { computed, onMounted, watch, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useProjectStore } from '@/stores/projectStore'
import { useTTSStore } from '@/stores/ttsStore'
import SlidePreview from '@/components/slides/SlidePreview.vue'
import CaptionEditor from '@/components/captions/CaptionEditor.vue'
import NarrativeManager from '@/components/captions/NarrativeManager.vue'
import VoiceSettings from '@/components/tts/VoiceSettings.vue'
import AudioPreview from '@/components/tts/AudioPreview.vue'
import { useTTS } from '@/composables/useTTS'

const router = useRouter()
const projectStore = useProjectStore()
const ttsStore = useTTSStore()
const { initTTS, generateAudio } = useTTS()

const currentSlide = computed(() => projectStore.selectedSlide)

// Track audio playback state for pointer preview
const playbackState = ref<{ currentTime: number; duration: number; isPlaying: boolean } | null>(null)

function handlePlaybackUpdate(state: { currentTime: number; duration: number; isPlaying: boolean }) {
  playbackState.value = state
}

// Reset playback state when slide changes
watch(() => projectStore.selectedSlideId, () => {
  playbackState.value = null
})

onMounted(async () => {
  if (!projectStore.hasProject) {
    router.push('/')
    return
  }

  if (!ttsStore.isModelReady && !ttsStore.isModelLoading) {
    await initTTS()
  }
})

watch(() => projectStore.hasProject, (hasProject) => {
  if (!hasProject) {
    router.push('/')
  }
})

function handleCaptionChange(caption: string) {
  if (currentSlide.value) {
    projectStore.updateCaption(currentSlide.value.id, caption)
  }
}

async function handleGenerateAudio() {
  if (!currentSlide.value || !currentSlide.value.caption.trim()) return

  await generateAudio(currentSlide.value.id, currentSlide.value.caption)
}

async function handleGenerateAllAudio() {
  const slidesToGenerate = projectStore.slides.filter(
    slide => slide.caption.trim() && !slide.audioGenerated
  )

  for (const slide of slidesToGenerate) {
    try {
      // Select the slide being generated so user can see progress
      projectStore.selectSlide(slide.id)
      await generateAudio(slide.id, slide.caption)
    } catch (error) {
      console.error(`Failed to generate audio for slide ${slide.index + 1}:`, error)
      // Continue with next slide even if one fails
    }
  }
}

function handlePreviousSlide() {
  projectStore.selectPreviousSlide()
}

function handleNextSlide() {
  projectStore.selectNextSlide()
}
</script>

<template>
  <div class="h-full flex flex-col" v-if="currentSlide">
    <div class="flex-1 flex overflow-hidden">
      <div class="flex-1 flex flex-col p-4 overflow-hidden">
        <div class="flex-1 flex items-center justify-center min-h-0">
          <SlidePreview :slide="currentSlide" :playback-state="playbackState" />
        </div>

        <div class="flex items-center justify-between mt-4">
          <button
            class="btn btn-ghost"
            :disabled="projectStore.selectedSlideIndex === 0"
            @click="handlePreviousSlide"
          >
            <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Previous
          </button>

          <span class="text-dark-400">
            Slide {{ projectStore.selectedSlideIndex + 1 }} of {{ projectStore.slides.length }}
          </span>

          <button
            class="btn btn-ghost"
            :disabled="projectStore.selectedSlideIndex === projectStore.slides.length - 1"
            @click="handleNextSlide"
          >
            Next
            <svg class="w-5 h-5 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>

      <div class="w-96 border-l border-dark-700 flex flex-col bg-dark-800/50">
        <div class="flex-1 overflow-y-auto">
          <div class="p-4 border-b border-dark-700">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-sm font-medium text-dark-200">Narration Text</h3>
              <NarrativeManager />
            </div>
            <CaptionEditor
              :caption="currentSlide.caption"
              :slide-index="currentSlide.index"
              @update:caption="handleCaptionChange"
            />
          </div>

          <div class="p-4 border-b border-dark-700">
            <h3 class="text-sm font-medium text-dark-200 mb-3">Voice Settings</h3>
            <VoiceSettings />
          </div>

          <div class="p-4">
            <h3 class="text-sm font-medium text-dark-200 mb-3">Audio Preview</h3>
            <AudioPreview
              :slide="currentSlide"
              :is-generating="ttsStore.generatingSlideId === currentSlide.id"
              @generate="handleGenerateAudio"
              @playback-update="handlePlaybackUpdate"
            />
          </div>
        </div>

        <div class="p-4 border-t border-dark-700">
          <button
            class="btn btn-primary w-full"
            :disabled="!ttsStore.isModelReady || ttsStore.isGenerating"
            @click="handleGenerateAllAudio"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            Generate All Audio
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-else class="h-full flex items-center justify-center">
    <p class="text-dark-400">No slide selected</p>
  </div>
</template>
