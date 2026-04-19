<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import type { Slide, PointerStyle } from '@/types'
import { parsePointerMarkers, calculateMarkerTimings, getPointerStateAtTime } from '@/utils/pointerParser'

interface PlaybackState {
  currentTime: number
  duration: number
  isPlaying: boolean
}

interface Props {
  slide: Slide
  playbackState?: PlaybackState | null
}

const props = withDefaults(defineProps<Props>(), {
  playbackState: null
})

const imageRef = ref<HTMLImageElement | null>(null)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const isLoading = ref(true)
const hasError = ref(false)

// Pointer animation state
const pointerState = ref({
  currentX: 50,
  currentY: 50,
  targetX: 50,
  targetY: 50,
  animStartTime: 0
})
const POINTER_TRANSITION_MS = 300

// Parse pointer markers from caption
const pointerTimeline = computed(() => {
  if (!props.slide.caption) return { markers: [], cleanText: '' }
  return parsePointerMarkers(props.slide.caption)
})

// Calculate timed markers based on audio duration
const timedMarkers = computed(() => {
  if (!props.playbackState?.duration || pointerTimeline.value.markers.length === 0) {
    return []
  }
  return calculateMarkerTimings(
    pointerTimeline.value.markers,
    pointerTimeline.value.cleanText,
    props.playbackState.duration
  )
})

// Get current pointer position based on playback time
const currentPointer = computed(() => {
  if (!props.playbackState || timedMarkers.value.length === 0) {
    return null
  }
  return getPointerStateAtTime(
    timedMarkers.value,
    props.playbackState.currentTime,
    POINTER_TRANSITION_MS
  )
})

function handleLoad() {
  isLoading.value = false
  hasError.value = false
  updateCanvasSize()
}

function handleError() {
  isLoading.value = false
  hasError.value = true
}

function updateCanvasSize() {
  if (!canvasRef.value || !imageRef.value || !containerRef.value) return

  const img = imageRef.value
  const canvas = canvasRef.value

  // Match canvas size to displayed image size
  canvas.width = img.clientWidth
  canvas.height = img.clientHeight
}

function drawPointer() {
  if (!canvasRef.value || !currentPointer.value || !currentPointer.value.visible) {
    // Clear canvas if no pointer
    if (canvasRef.value) {
      const ctx = canvasRef.value.getContext('2d')
      if (ctx) ctx.clearRect(0, 0, canvasRef.value.width, canvasRef.value.height)
    }
    return
  }

  const canvas = canvasRef.value
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Clear previous frame
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Smooth interpolation toward target
  const pointer = currentPointer.value
  const now = performance.now()

  if (pointerState.value.targetX !== pointer.x || pointerState.value.targetY !== pointer.y) {
    pointerState.value.animStartTime = now
    pointerState.value.targetX = pointer.x
    pointerState.value.targetY = pointer.y
  }

  const elapsed = now - pointerState.value.animStartTime
  const progress = Math.min(1, elapsed / POINTER_TRANSITION_MS)
  const easeProgress = 1 - Math.pow(1 - progress, 3) // easeOutCubic

  pointerState.value.currentX += (pointerState.value.targetX - pointerState.value.currentX) * easeProgress
  pointerState.value.currentY += (pointerState.value.targetY - pointerState.value.currentY) * easeProgress

  // Calculate position
  const x = (pointerState.value.currentX / 100) * canvas.width
  const y = (pointerState.value.currentY / 100) * canvas.height
  const baseSize = Math.min(canvas.width, canvas.height) * 0.025

  ctx.save()
  drawPointerStyle(ctx, x, y, pointer.style, baseSize, canvas.width, canvas.height)
  ctx.restore()
}

function drawPointerStyle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  style: PointerStyle,
  baseSize: number,
  canvasWidth: number,
  canvasHeight: number
) {
  switch (style) {
    case 'laser': {
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 2)
      gradient.addColorStop(0, 'rgba(255, 50, 50, 1)')
      gradient.addColorStop(0.3, 'rgba(255, 50, 50, 0.8)')
      gradient.addColorStop(0.6, 'rgba(255, 0, 0, 0.3)')
      gradient.addColorStop(1, 'rgba(255, 0, 0, 0)')
      ctx.beginPath()
      ctx.arc(x, y, baseSize * 2, 0, Math.PI * 2)
      ctx.fillStyle = gradient
      ctx.fill()
      ctx.beginPath()
      ctx.arc(x, y, baseSize * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = '#ffffff'
      ctx.fill()
      break
    }
    case 'circle': {
      ctx.beginPath()
      ctx.arc(x, y, baseSize * 3, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)'
      ctx.lineWidth = baseSize * 0.4
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(x, y, baseSize * 2, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
      ctx.lineWidth = baseSize * 0.2
      ctx.stroke()
      break
    }
    case 'arrow': {
      ctx.translate(x, y)
      ctx.rotate(-Math.PI / 4)
      ctx.beginPath()
      ctx.moveTo(0, -baseSize * 3)
      ctx.lineTo(baseSize * 1.2, baseSize)
      ctx.lineTo(baseSize * 0.4, baseSize)
      ctx.lineTo(baseSize * 0.4, baseSize * 3)
      ctx.lineTo(-baseSize * 0.4, baseSize * 3)
      ctx.lineTo(-baseSize * 0.4, baseSize)
      ctx.lineTo(-baseSize * 1.2, baseSize)
      ctx.closePath()
      ctx.fillStyle = 'rgba(239, 68, 68, 0.95)'
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = baseSize * 0.15
      ctx.stroke()
      break
    }
    case 'spotlight': {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)'
      ctx.fillRect(0, 0, canvasWidth, canvasHeight)
      ctx.globalCompositeOperation = 'destination-out'
      const spotGradient = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 8)
      spotGradient.addColorStop(0, 'rgba(0, 0, 0, 1)')
      spotGradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.8)')
      spotGradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.beginPath()
      ctx.arc(x, y, baseSize * 8, 0, Math.PI * 2)
      ctx.fillStyle = spotGradient
      ctx.fill()
      ctx.globalCompositeOperation = 'source-over'
      break
    }
    case 'hand': {
      ctx.translate(x, y)
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.lineTo(baseSize * 0.5, baseSize * 2)
      ctx.lineTo(baseSize * 1.5, baseSize * 2.5)
      ctx.lineTo(baseSize * 2, baseSize * 3.5)
      ctx.lineTo(baseSize * 0.5, baseSize * 3.5)
      ctx.lineTo(0, baseSize * 2.5)
      ctx.lineTo(-baseSize * 0.5, baseSize * 3)
      ctx.lineTo(-baseSize * 0.5, baseSize * 2)
      ctx.closePath()
      ctx.fillStyle = '#fbbf24'
      ctx.fill()
      ctx.strokeStyle = '#92400e'
      ctx.lineWidth = baseSize * 0.15
      ctx.stroke()
      break
    }
  }
}

// Animation frame for smooth pointer movement
let animationFrameId: number | null = null

function animate() {
  drawPointer()
  if (props.playbackState?.isPlaying) {
    animationFrameId = requestAnimationFrame(animate)
  }
}

watch(() => props.playbackState?.isPlaying, (isPlaying) => {
  if (isPlaying) {
    animate()
  } else if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
    animationFrameId = null
    drawPointer() // Draw final state
  }
})

watch(() => props.playbackState?.currentTime, () => {
  if (!props.playbackState?.isPlaying) {
    drawPointer()
  }
})

watch(() => props.slide.imageUrl, () => {
  isLoading.value = true
  hasError.value = false
})

// Reset pointer state when slide changes
watch(() => props.slide.id, () => {
  pointerState.value = {
    currentX: 50,
    currentY: 50,
    targetX: 50,
    targetY: 50,
    animStartTime: 0
  }
})

onMounted(() => {
  window.addEventListener('resize', updateCanvasSize)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateCanvasSize)
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId)
  }
})
</script>

<template>
  <div ref="containerRef" class="relative w-full h-full flex items-center justify-center">
    <div
      v-if="isLoading"
      class="absolute inset-0 flex items-center justify-center bg-dark-800"
    >
      <div class="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
    </div>

    <div
      v-if="hasError"
      class="absolute inset-0 flex flex-col items-center justify-center bg-dark-800"
    >
      <svg class="w-16 h-16 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p class="text-dark-400 mt-2">Failed to load image</p>
    </div>

    <!-- Image with pointer overlay -->
    <div class="relative">
      <img
        ref="imageRef"
        :src="slide.imageUrl"
        :alt="`Slide ${slide.index + 1}`"
        class="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        :class="{ 'opacity-0': isLoading || hasError }"
        @load="handleLoad"
        @error="handleError"
      />

      <!-- Pointer canvas overlay -->
      <canvas
        ref="canvasRef"
        class="absolute top-0 left-0 pointer-events-none rounded-lg"
        :class="{ 'opacity-0': isLoading || hasError }"
      />
    </div>

    <div class="absolute top-4 left-4 px-3 py-1.5 bg-black/50 rounded-lg backdrop-blur-sm">
      <span class="text-sm font-medium text-white">
        Slide {{ slide.index + 1 }}
      </span>
    </div>

    <div
      v-if="slide.audioGenerated"
      class="absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg"
    >
      <svg class="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="text-sm text-green-400">Audio Ready</span>
    </div>

    <!-- Pointer marker indicator -->
    <div
      v-if="timedMarkers.length > 0"
      class="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-primary-500/20 border border-primary-500/30 rounded-lg"
    >
      <svg class="w-4 h-4 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
      </svg>
      <span class="text-sm text-primary-400">{{ timedMarkers.length }} pointer(s)</span>
    </div>
  </div>
</template>
