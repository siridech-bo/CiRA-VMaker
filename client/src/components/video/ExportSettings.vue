<script setup lang="ts">
import { computed } from 'vue'
import { useRenderStore } from '@/stores/renderStore'

const renderStore = useRenderStore()

const resolutions = [
  { label: '720p (HD)', width: 1280, height: 720 },
  { label: '1080p (Full HD)', width: 1920, height: 1080 },
  { label: '1440p (2K)', width: 2560, height: 1440 },
  { label: '4K (Ultra HD)', width: 3840, height: 2160 }
]

const selectedResolution = computed({
  get: () => {
    const current = renderStore.settings
    const found = resolutions.find(r => r.width === current.width && r.height === current.height)
    return found ? `${found.width}x${found.height}` : '1920x1080'
  },
  set: (value: string) => {
    const [width, height] = value.split('x').map(Number)
    renderStore.updateSettings({ width, height })
  }
})

const fps = computed({
  get: () => renderStore.settings.fps,
  set: (value: number) => renderStore.updateSettings({ fps: value })
})

const format = computed({
  get: () => renderStore.settings.format,
  set: (value: 'mp4' | 'webm') => renderStore.updateSettings({ format: value })
})

const showSubtitles = computed({
  get: () => renderStore.settings.showSubtitles,
  set: (value: boolean) => renderStore.updateSettings({ showSubtitles: value })
})
</script>

<template>
  <div class="space-y-4 py-4 border-t border-b border-dark-700">
    <div>
      <label class="label">Resolution</label>
      <select v-model="selectedResolution" class="input">
        <option
          v-for="res in resolutions"
          :key="res.label"
          :value="`${res.width}x${res.height}`"
        >
          {{ res.label }}
        </option>
      </select>
    </div>

    <div>
      <label class="label">Frame Rate</label>
      <select v-model="fps" class="input">
        <option :value="24">24 fps (Cinema)</option>
        <option :value="30">30 fps (Standard)</option>
        <option :value="60">60 fps (Smooth)</option>
      </select>
    </div>

    <div>
      <label class="label">Format</label>
      <div class="flex gap-2">
        <button
          class="btn flex-1"
          :class="format === 'mp4' ? 'btn-primary' : 'btn-secondary'"
          @click="format = 'mp4'"
        >
          MP4
        </button>
        <button
          class="btn flex-1"
          :class="format === 'webm' ? 'btn-primary' : 'btn-secondary'"
          @click="format = 'webm'"
        >
          WebM
        </button>
      </div>
      <p class="text-xs text-dark-500 mt-1">
        MP4 recommended for wider compatibility
      </p>
    </div>

    <div>
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          v-model="showSubtitles"
          class="w-5 h-5 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500 focus:ring-offset-dark-800"
        />
        <div>
          <span class="text-sm font-medium text-dark-200">Show Subtitles</span>
          <p class="text-xs text-dark-500">
            Display word-by-word text synchronized with speech
          </p>
        </div>
      </label>
    </div>
  </div>
</template>
