<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Slide } from '@/types'
import { blobStorage } from '@/services/blobStorage'

interface Props {
  slide: Slide
  isGenerating?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isGenerating: false
})

const emit = defineEmits<{
  generate: []
  'playback-update': [{ currentTime: number; duration: number; isPlaying: boolean }]
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const audioUrl = ref<string | null>(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)

const canGenerate = computed(() => {
  return props.slide.caption.trim().length > 0 && !props.isGenerating
})

const progress = computed(() => {
  if (duration.value === 0) return 0
  return (currentTime.value / duration.value) * 100
})

async function loadAudio() {
  if (!props.slide.audioGenerated) {
    audioUrl.value = null
    return
  }

  try {
    const blob = await blobStorage.getAudio(props.slide.id)
    if (blob) {
      if (audioUrl.value) {
        URL.revokeObjectURL(audioUrl.value)
      }
      audioUrl.value = URL.createObjectURL(blob)
    }
  } catch (error) {
    console.error('Failed to load audio:', error)
  }
}

watch(() => props.slide.id, loadAudio, { immediate: true })
watch(() => props.slide.audioGenerated, loadAudio)

function togglePlayback() {
  if (!audioRef.value) return

  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

function emitPlaybackState() {
  emit('playback-update', {
    currentTime: currentTime.value,
    duration: duration.value,
    isPlaying: isPlaying.value
  })
}

function handlePlay() {
  isPlaying.value = true
  emitPlaybackState()
}

function handlePause() {
  isPlaying.value = false
  emitPlaybackState()
}

function handleTimeUpdate() {
  if (audioRef.value) {
    currentTime.value = audioRef.value.currentTime
    emitPlaybackState()
  }
}

function handleLoadedMetadata() {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
    emitPlaybackState()
  }
}

function handleEnded() {
  isPlaying.value = false
  currentTime.value = 0
  emitPlaybackState()
}

function handleSeek(e: MouseEvent) {
  if (!audioRef.value || !duration.value) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const percent = (e.clientX - rect.left) / rect.width
  audioRef.value.currentTime = percent * duration.value
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

onUnmounted(() => {
  if (audioUrl.value) {
    URL.revokeObjectURL(audioUrl.value)
  }
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="slide.audioGenerated && audioUrl" class="space-y-2">
      <audio
        ref="audioRef"
        :src="audioUrl"
        @play="handlePlay"
        @pause="handlePause"
        @timeupdate="handleTimeUpdate"
        @loadedmetadata="handleLoadedMetadata"
        @ended="handleEnded"
      />

      <div class="flex items-center gap-3">
        <button
          class="btn btn-icon btn-secondary"
          @click="togglePlayback"
        >
          <svg v-if="!isPlaying" class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
          <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        </button>

        <div class="flex-1">
          <div
            class="progress-bar cursor-pointer"
            @click="handleSeek"
          >
            <div
              class="progress-bar-fill"
              :style="{ width: `${progress}%` }"
            />
          </div>
        </div>

        <span class="text-xs text-dark-400 font-mono w-20 text-right">
          {{ formatTime(currentTime) }} / {{ formatTime(duration) }}
        </span>
      </div>

      <button
        class="btn btn-ghost btn-sm w-full"
        :disabled="isGenerating"
        @click="emit('generate')"
      >
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        Regenerate
      </button>
    </div>

    <div v-else-if="isGenerating" class="p-4 bg-dark-700 rounded-lg">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <div>
          <p class="text-sm text-dark-200">Generating audio...</p>
          <p class="text-xs text-dark-400">This may take a moment</p>
        </div>
      </div>
    </div>

    <div v-else class="space-y-3">
      <div class="p-4 bg-dark-700 rounded-lg text-center">
        <svg class="w-8 h-8 text-dark-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        <p class="text-sm text-dark-400">No audio generated yet</p>
      </div>

      <button
        class="btn btn-primary w-full"
        :disabled="!canGenerate"
        @click="emit('generate')"
      >
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
        </svg>
        Generate Audio
      </button>

      <p v-if="!slide.caption.trim()" class="text-xs text-dark-500 text-center">
        Add narration text to generate audio
      </p>
    </div>
  </div>
</template>
