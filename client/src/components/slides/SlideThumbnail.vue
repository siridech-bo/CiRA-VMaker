<script setup lang="ts">
import type { Slide } from '@/types'

interface Props {
  slide: Slide
  isSelected?: boolean
  duration?: string
}

withDefaults(defineProps<Props>(), {
  isSelected: false,
  duration: '--:--'
})

const emit = defineEmits<{
  click: []
}>()
</script>

<template>
  <div
    class="slide-thumbnail group"
    :class="{ active: isSelected }"
    @click="emit('click')"
  >
    <div class="relative">
      <img
        :src="slide.thumbnailUrl"
        :alt="`Slide ${slide.index + 1}`"
        class="slide-thumbnail-image"
      />

      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-white">
            {{ slide.index + 1 }}
          </span>
          <span class="text-xs text-white/80">
            {{ duration }}
          </span>
        </div>
      </div>

      <div
        v-if="slide.audioGenerated"
        class="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
      >
        <svg class="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="3" fill="none" />
        </svg>
      </div>

      <div
        v-else-if="slide.caption"
        class="absolute top-1 right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center"
      >
        <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3" />
        </svg>
      </div>
    </div>

    <div v-if="slide.caption" class="p-2 bg-dark-700/50">
      <p class="text-xs text-dark-300 line-clamp-2">
        {{ slide.caption }}
      </p>
    </div>
  </div>
</template>
