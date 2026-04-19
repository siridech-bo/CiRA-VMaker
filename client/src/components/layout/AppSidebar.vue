<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/projectStore'
import SlideThumbnail from '@/components/slides/SlideThumbnail.vue'
import ResourceMonitor from '@/components/common/ResourceMonitor.vue'

const projectStore = useProjectStore()

const isCollapsed = ref(false)

const sidebarWidth = computed(() => isCollapsed.value ? 'w-12' : 'w-64')

function toggleSidebar() {
  isCollapsed.value = !isCollapsed.value
}

function handleSlideClick(slideId: string) {
  projectStore.selectSlide(slideId)
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--:--'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
</script>

<template>
  <aside
    :class="[
      'h-full bg-dark-800 border-r border-dark-700 flex flex-col transition-all duration-200',
      sidebarWidth
    ]"
  >
    <div class="flex items-center justify-between p-2 border-b border-dark-700">
      <span v-if="!isCollapsed" class="text-sm font-medium text-dark-300 px-2">
        Slides ({{ projectStore.slides.length }})
      </span>
      <button
        class="btn btn-ghost btn-icon"
        @click="toggleSidebar"
        :title="isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'"
      >
        <svg
          class="w-4 h-4 transition-transform"
          :class="{ 'rotate-180': isCollapsed }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      <template v-if="!isCollapsed">
        <SlideThumbnail
          v-for="slide in projectStore.slides"
          :key="slide.id"
          :slide="slide"
          :is-selected="slide.id === projectStore.selectedSlideId"
          :duration="formatDuration(slide.audioDuration)"
          @click="handleSlideClick(slide.id)"
        />
      </template>

      <template v-else>
        <button
          v-for="slide in projectStore.slides"
          :key="slide.id"
          class="w-full aspect-video rounded bg-dark-700 flex items-center justify-center text-xs font-medium"
          :class="{
            'ring-2 ring-primary-500': slide.id === projectStore.selectedSlideId
          }"
          @click="handleSlideClick(slide.id)"
        >
          {{ slide.index + 1 }}
        </button>
      </template>
    </div>

    <div v-if="!isCollapsed" class="p-3 border-t border-dark-700 space-y-3">
      <div class="text-xs text-dark-400 space-y-1">
        <div class="flex justify-between">
          <span>Total Duration</span>
          <span class="font-medium text-dark-200">
            {{ formatDuration(projectStore.totalDuration) }}
          </span>
        </div>
        <div class="flex justify-between">
          <span>Audio Ready</span>
          <span
            class="font-medium"
            :class="projectStore.allAudioGenerated ? 'text-green-400' : 'text-yellow-400'"
          >
            {{ projectStore.slides.filter(s => s.audioGenerated).length }}/{{ projectStore.slides.length }}
          </span>
        </div>
      </div>

      <ResourceMonitor />
    </div>
  </aside>
</template>
