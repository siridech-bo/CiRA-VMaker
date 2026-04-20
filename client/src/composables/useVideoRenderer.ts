import { useProjectStore } from '@/stores/projectStore'
import { useRenderStore } from '@/stores/renderStore'
import { blobStorage } from '@/services/blobStorage'
import { parsePointerMarkers, calculateMarkerTimings, getPointerStateAtTime } from '@/utils/pointerParser'
import type { PointerMarker, PointerStyle, WordTiming, AnimatedPointerStyle } from '@/types'
import { isAnimatedStyle, ANIMATED_STYLE_CONFIG } from '@/types/pointer'
import rough from 'roughjs'

let isRendering = false
let shouldCancel = false

// Pointer animation state
interface PointerAnimState {
  currentX: number
  currentY: number
  targetX: number
  targetY: number
  style: PointerStyle
  visible: boolean
  animStartTime: number
  // Animated style state
  animatedProgress: number     // 0-1 for animated entrance
  animatedStartTime: number    // When animation started
  wigglePhase: number          // For wiggle animation
  drawProgress: number         // For sketch drawing animation
}

export function useVideoRenderer() {
  const projectStore = useProjectStore()
  const renderStore = useRenderStore()

  async function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  }

  async function renderVideo(): Promise<void> {
    if (isRendering) {
      throw new Error('Already rendering')
    }

    const slides = projectStore.slides
    if (slides.length === 0) {
      throw new Error('No slides to render')
    }

    isRendering = true
    shouldCancel = false
    renderStore.startRender(slides.length)

    const { width, height, fps } = renderStore.settings

    try {
      renderStore.setStatus('preparing', 'Loading slide images...')

      const slideData: Array<{
        image: HTMLImageElement
        audioBlob: Blob
        duration: number
        startTime: number
        caption: string
        pointerMarkers: Array<PointerMarker & { startTime: number }>
        subtitleTimings: WordTiming[]
      }> = []

      for (let i = 0; i < slides.length; i++) {
        if (shouldCancel) throw new Error('Cancelled')

        const slide = slides[i]
        renderStore.updateProgress(i, (i / slides.length) * 20, `Loading slide ${i + 1}...`)

        const image = await loadImage(slide.imageUrl)
        const audioData = await blobStorage.getAudioWithDuration(slide.id)

        if (!audioData) {
          throw new Error(`Missing audio for slide ${i + 1}`)
        }

        slideData.push({
          image,
          audioBlob: audioData.blob,
          duration: audioData.duration,
          startTime: 0,
          caption: slide.caption || '',
          pointerMarkers: [],  // Will be calculated after we know the duration
          subtitleTimings: audioData.timings || []
        })
      }

      renderStore.setStatus('rendering', 'Creating video...')

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!

      const audioContext = new AudioContext()
      const audioBuffers: AudioBuffer[] = []

      for (let i = 0; i < slideData.length; i++) {
        const arrayBuffer = await slideData[i].audioBlob.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        audioBuffers.push(audioBuffer)
      }

      // Calculate actual durations from audio buffers and set start times
      let cumulativeTime = 0
      for (let i = 0; i < slideData.length; i++) {
        const actualDuration = audioBuffers[i].length / audioContext.sampleRate
        slideData[i].startTime = cumulativeTime
        slideData[i].duration = actualDuration

        // Calculate pointer marker timings for this slide
        const { markers, cleanText } = parsePointerMarkers(slideData[i].caption)
        const timedMarkers = calculateMarkerTimings(markers, cleanText, actualDuration)
        slideData[i].pointerMarkers = timedMarkers

        cumulativeTime += actualDuration
        console.log(`Slide ${i + 1}: starts at ${slideData[i].startTime.toFixed(2)}s, duration ${actualDuration.toFixed(2)}s, ${timedMarkers.length} pointer markers`)
      }

      const totalDuration = cumulativeTime
      const totalSamples = audioBuffers.reduce((sum, buffer) => sum + buffer.length, 0)

      console.log(`Total duration: ${totalDuration.toFixed(2)}s, Total samples: ${totalSamples}`)

      // Add small buffer at the end to ensure audio completes (0.5 seconds)
      const bufferSamples = Math.ceil(0.5 * audioContext.sampleRate)
      const combinedAudio = audioContext.createBuffer(
        1,
        totalSamples + bufferSamples,
        audioContext.sampleRate
      )
      const combinedChannel = combinedAudio.getChannelData(0)

      let sampleOffset = 0
      for (const buffer of audioBuffers) {
        const channelData = buffer.getChannelData(0)
        for (let i = 0; i < channelData.length; i++) {
          combinedChannel[sampleOffset + i] = channelData[i]
        }
        sampleOffset += buffer.length
      }

      const stream = canvas.captureStream(fps)

      const audioDestination = audioContext.createMediaStreamDestination()
      const audioSource = audioContext.createBufferSource()
      audioSource.buffer = combinedAudio
      audioSource.connect(audioDestination)

      for (const track of audioDestination.stream.getAudioTracks()) {
        stream.addTrack(track)
      }

      const mimeType = renderStore.settings.format === 'webm'
        ? 'video/webm;codecs=vp9,opus'
        : 'video/webm;codecs=vp8,opus'

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: renderStore.settings.videoBitrate,
        audioBitsPerSecond: renderStore.settings.audioBitrate
      })

      const chunks: Blob[] = []
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data)
        }
      }

      const recordingPromise = new Promise<Blob>((resolve, reject) => {
        mediaRecorder.onstop = () => {
          const blob = new Blob(chunks, { type: mimeType })
          resolve(blob)
        }
        mediaRecorder.onerror = (e) => reject(e)
      })

      // Draw first slide before starting
      drawSlideToCanvas(ctx, slideData[0].image, width, height)

      mediaRecorder.start(100)

      // Use audioContext.currentTime for timing - it's not throttled in background tabs
      const audioStartTime = audioContext.currentTime
      audioSource.start()

      const videoDuration = totalDuration + 0.5
      let lastSlideIndex = 0
      let frameCount = 0
      let isComplete = false

      // Pointer animation state
      const pointerState: PointerAnimState = {
        currentX: 50,
        currentY: 50,
        targetX: 50,
        targetY: 50,
        style: 'laser',
        visible: false,
        animStartTime: 0,
        animatedProgress: 0,
        animatedStartTime: 0,
        wigglePhase: 0,
        drawProgress: 0
      }
      const POINTER_TRANSITION_MS = 300

      const renderFrame = () => {
        if (shouldCancel || isComplete) {
          return
        }

        // Use audioContext.currentTime for accurate timing even when tab is throttled
        const elapsedTime = audioContext.currentTime - audioStartTime
        frameCount++

        // Stop recording when video duration is complete
        if (elapsedTime >= videoDuration) {
          if (!isComplete) {
            isComplete = true
            console.log(`Rendering complete at ${elapsedTime.toFixed(2)}s (${frameCount} frames)`)
            clearInterval(backupTimer)
            mediaRecorder.stop()
            audioSource.stop()
          }
          return
        }

        // Find which slide should be shown based on elapsed time
        let currentSlideIndex = 0
        for (let i = slideData.length - 1; i >= 0; i--) {
          if (elapsedTime >= slideData[i].startTime) {
            currentSlideIndex = i
            break
          }
        }

        // Log when slide changes
        if (currentSlideIndex !== lastSlideIndex) {
          console.log(`Switching to slide ${currentSlideIndex + 1} at ${elapsedTime.toFixed(2)}s (frame ${frameCount})`)
          lastSlideIndex = currentSlideIndex
          // Reset pointer visibility on slide change
          pointerState.visible = false
        }

        // Draw current slide
        const slide = slideData[currentSlideIndex]
        drawSlideToCanvas(ctx, slide.image, width, height)

        // Calculate time within current slide
        const slideElapsedTime = elapsedTime - slide.startTime

        // Find and draw pointer if markers exist
        if (slide.pointerMarkers.length > 0) {
          const pointerInfo = getPointerStateAtTime(
            slide.pointerMarkers,
            slideElapsedTime,
            POINTER_TRANSITION_MS
          )

          if (pointerInfo && pointerInfo.visible) {
            // Check if position or style changed
            const positionChanged = pointerState.targetX !== pointerInfo.x || pointerState.targetY !== pointerInfo.y
            const styleChanged = pointerState.style !== pointerInfo.style

            if (positionChanged || styleChanged) {
              pointerState.animStartTime = elapsedTime
              pointerState.targetX = pointerInfo.x
              pointerState.targetY = pointerInfo.y

              // Reset animated style state when marker changes
              if (styleChanged || positionChanged) {
                pointerState.animatedStartTime = elapsedTime
                pointerState.animatedProgress = 0
                pointerState.drawProgress = 0
                pointerState.wigglePhase = 0
              }
            }
            pointerState.style = pointerInfo.style
            pointerState.visible = true

            // Smooth interpolation for position
            const animProgress = Math.min(1, (elapsedTime - pointerState.animStartTime) * 1000 / POINTER_TRANSITION_MS)
            const easeProgress = easeOutCubic(animProgress)

            pointerState.currentX += (pointerState.targetX - pointerState.currentX) * easeProgress
            pointerState.currentY += (pointerState.targetY - pointerState.currentY) * easeProgress

            // Update animated style progress
            if (isAnimatedStyle(pointerState.style)) {
              const config = ANIMATED_STYLE_CONFIG[pointerState.style as AnimatedPointerStyle]
              const animElapsed = (elapsedTime - pointerState.animatedStartTime) * 1000
              pointerState.animatedProgress = Math.min(1, animElapsed / config.duration)
              pointerState.drawProgress = pointerState.animatedProgress

              // Update wiggle phase for wiggle style
              if (pointerState.style === 'wiggle') {
                pointerState.wigglePhase = pointerState.animatedProgress * Math.PI * 6
              }
            }

            // Draw pointer
            drawPointer(ctx, canvas, pointerState, width, height)
          } else if (pointerInfo && !pointerInfo.visible) {
            pointerState.visible = false
          }
        }

        // Draw subtitle if timing data is available
        if (slide.subtitleTimings.length > 0 && renderStore.settings.showSubtitles !== false) {
          const slideElapsedMs = slideElapsedTime * 1000
          const subtitleText = getCurrentSubtitle(slide.subtitleTimings, slideElapsedMs)
          if (subtitleText) {
            drawSubtitle(ctx, subtitleText, width, height)
          }
        }

        const progress = 20 + (elapsedTime / videoDuration) * 70
        renderStore.updateProgress(
          currentSlideIndex,
          progress,
          `Rendering slide ${currentSlideIndex + 1}...`
        )

        requestAnimationFrame(renderFrame)
      }

      // Use setInterval as backup - browsers throttle requestAnimationFrame in background tabs
      // but setInterval continues running (though may be throttled to 1s minimum)
      const backupTimer = setInterval(() => {
        if (!isComplete && !shouldCancel) {
          renderFrame()
        } else {
          clearInterval(backupTimer)
        }
      }, 100) // 100ms backup interval ensures we catch slide changes

      requestAnimationFrame(renderFrame)

      const videoBlob = await recordingPromise

      if (shouldCancel) {
        throw new Error('Cancelled')
      }

      renderStore.setStatus('encoding', 'Finalizing video...')
      renderStore.updateProgress(slides.length - 1, 95, 'Finalizing...')

      await audioContext.close()

      renderStore.completeRender(videoBlob)
    } catch (error) {
      if ((error as Error).message === 'Cancelled') {
        renderStore.reset()
      } else {
        renderStore.setError(error instanceof Error ? error.message : 'Render failed')
      }
    } finally {
      isRendering = false
    }
  }

  function drawSlideToCanvas(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    canvasWidth: number,
    canvasHeight: number
  ) {
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, canvasWidth, canvasHeight)

    const imageAspect = image.width / image.height
    const canvasAspect = canvasWidth / canvasHeight

    let drawWidth: number
    let drawHeight: number
    let drawX: number
    let drawY: number

    if (imageAspect > canvasAspect) {
      drawWidth = canvasWidth
      drawHeight = canvasWidth / imageAspect
      drawX = 0
      drawY = (canvasHeight - drawHeight) / 2
    } else {
      drawHeight = canvasHeight
      drawWidth = canvasHeight * imageAspect
      drawX = (canvasWidth - drawWidth) / 2
      drawY = 0
    }

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
  }

  function drawPointer(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    state: PointerAnimState,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const x = (state.currentX / 100) * canvasWidth
    const y = (state.currentY / 100) * canvasHeight
    const baseSize = Math.min(canvasWidth, canvasHeight) * 0.02
    const style = state.style

    ctx.save()

    // Handle animated styles
    if (isAnimatedStyle(style)) {
      drawAnimatedPointerStyle(ctx, canvas, x, y, style as AnimatedPointerStyle, baseSize, state)
      ctx.restore()
      return
    }

    // Basic styles
    switch (style) {
      case 'laser': {
        // Red laser dot with glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 2)
        gradient.addColorStop(0, 'rgba(255, 50, 50, 1)')
        gradient.addColorStop(0.3, 'rgba(255, 50, 50, 0.8)')
        gradient.addColorStop(0.6, 'rgba(255, 0, 0, 0.3)')
        gradient.addColorStop(1, 'rgba(255, 0, 0, 0)')

        ctx.beginPath()
        ctx.arc(x, y, baseSize * 2, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Inner bright dot
        ctx.beginPath()
        ctx.arc(x, y, baseSize * 0.5, 0, Math.PI * 2)
        ctx.fillStyle = '#ffffff'
        ctx.fill()
        break
      }

      case 'circle':
        // Pulsing circle outline
        ctx.beginPath()
        ctx.arc(x, y, baseSize * 3, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)' // blue-500
        ctx.lineWidth = baseSize * 0.4
        ctx.stroke()

        // Inner ring
        ctx.beginPath()
        ctx.arc(x, y, baseSize * 2, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
        ctx.lineWidth = baseSize * 0.2
        ctx.stroke()
        break

      case 'arrow':
        // Arrow pointing down-left at the target
        ctx.translate(x, y)
        ctx.rotate(-Math.PI / 4) // 45 degree angle

        ctx.beginPath()
        ctx.moveTo(0, -baseSize * 3)
        ctx.lineTo(baseSize * 1.2, baseSize)
        ctx.lineTo(baseSize * 0.4, baseSize)
        ctx.lineTo(baseSize * 0.4, baseSize * 3)
        ctx.lineTo(-baseSize * 0.4, baseSize * 3)
        ctx.lineTo(-baseSize * 0.4, baseSize)
        ctx.lineTo(-baseSize * 1.2, baseSize)
        ctx.closePath()

        ctx.fillStyle = 'rgba(239, 68, 68, 0.95)' // red-500
        ctx.fill()
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = baseSize * 0.15
        ctx.stroke()
        break

      case 'hand':
        // Simple hand cursor shape
        ctx.translate(x, y)

        // Hand shape (simplified pointing finger)
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

        ctx.fillStyle = '#fbbf24' // amber-400
        ctx.fill()
        ctx.strokeStyle = '#92400e' // amber-800
        ctx.lineWidth = baseSize * 0.15
        ctx.stroke()
        break

      case 'hide':
        // Don't draw anything
        break
    }

    ctx.restore()
  }

  /**
   * Draw animated pointer styles (GSAP-inspired easing + Rough.js for sketchy effects)
   */
  function drawAnimatedPointerStyle(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    x: number,
    y: number,
    style: AnimatedPointerStyle,
    baseSize: number,
    state: PointerAnimState
  ) {
    const progress = state.animatedProgress

    // Apply entrance animation scale
    let scale = 1
    let opacity = 1
    let offsetX = 0
    let rotation = 0

    switch (style) {
      case 'bouncy': {
        // Bouncy entrance with elastic easing
        if (progress < 1) {
          // Elastic out easing
          const p = progress
          scale = p === 0 ? 0 : p === 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1
          opacity = Math.min(1, progress * 2)
        }

        ctx.globalAlpha = opacity
        ctx.translate(x, y)
        ctx.scale(scale, scale)
        ctx.translate(-x, -y)

        // Cartoon hand with bounce
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + baseSize * 0.8, y + baseSize * 2)
        ctx.lineTo(x + baseSize * 1.8, y + baseSize * 2.2)
        ctx.quadraticCurveTo(x + baseSize * 2.2, y + baseSize * 3, x + baseSize * 1.5, y + baseSize * 3.5)
        ctx.lineTo(x + baseSize * 0.3, y + baseSize * 3.5)
        ctx.quadraticCurveTo(x - baseSize * 0.3, y + baseSize * 3, x - baseSize * 0.5, y + baseSize * 2.5)
        ctx.lineTo(x - baseSize * 0.3, y + baseSize * 2)
        ctx.closePath()

        ctx.fillStyle = '#fbbf24'
        ctx.fill()
        ctx.strokeStyle = '#b45309'
        ctx.lineWidth = baseSize * 0.12
        ctx.stroke()
        break
      }

      case 'sketch-circle': {
        // Hand-drawn circle using Rough.js
        opacity = Math.min(1, progress * 3)
        ctx.globalAlpha = opacity

        const rc = rough.canvas(canvas)
        const radius = baseSize * 3
        const drawRadius = radius * Math.min(1, progress * 1.2)

        // Draw sketchy circle
        rc.circle(x, y, drawRadius * 2, {
          stroke: '#3b82f6',
          strokeWidth: 3,
          roughness: 2.5 * progress,
          bowing: 1.5
        })
        break
      }

      case 'sketch-arrow': {
        // Hand-drawn arrow using Rough.js
        opacity = Math.min(1, progress * 3)
        ctx.globalAlpha = opacity

        const rc = rough.canvas(canvas)
        const arrowLength = baseSize * 4
        const headSize = baseSize * 1.5

        // Draw shaft
        const shaftEndY = y + arrowLength * Math.min(1, progress * 1.2)
        rc.line(x, y, x, shaftEndY, {
          stroke: '#ef4444',
          strokeWidth: 3,
          roughness: 2
        })

        // Draw arrowhead when mostly complete
        if (progress > 0.7) {
          const headProgress = (progress - 0.7) / 0.3
          rc.line(x, shaftEndY, x - headSize * headProgress, shaftEndY - headSize * headProgress, {
            stroke: '#ef4444',
            strokeWidth: 3,
            roughness: 2
          })
          rc.line(x, shaftEndY, x + headSize * headProgress, shaftEndY - headSize * headProgress, {
            stroke: '#ef4444',
            strokeWidth: 3,
            roughness: 2
          })
        }
        break
      }

      case 'pop': {
        // Pop-in with overshoot (back.out easing)
        if (progress < 1) {
          const c1 = 1.70158
          const c3 = c1 + 1
          scale = 1 + c3 * Math.pow(progress - 1, 3) + c1 * Math.pow(progress - 1, 2)
          opacity = Math.min(1, progress * 2)
        }

        ctx.globalAlpha = opacity
        ctx.translate(x, y)
        ctx.scale(scale, scale)
        ctx.translate(-x, -y)

        // Glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 4)
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)')
        gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.3)')
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0)')

        ctx.beginPath()
        ctx.arc(x, y, baseSize * 4, 0, Math.PI * 2)
        ctx.fillStyle = gradient
        ctx.fill()

        // Inner circle
        ctx.beginPath()
        ctx.arc(x, y, baseSize * 1.5, 0, Math.PI * 2)
        ctx.fillStyle = '#8b5cf6'
        ctx.fill()

        // Highlight
        ctx.beginPath()
        ctx.arc(x - baseSize * 0.3, y - baseSize * 0.3, baseSize * 0.4, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fill()
        break
      }

      case 'wiggle': {
        // Wiggle/shake effect
        offsetX = Math.sin(state.wigglePhase) * 8
        rotation = Math.sin(state.wigglePhase) * 0.15

        ctx.translate(x + offsetX, y)
        ctx.rotate(rotation)
        ctx.translate(-(x + offsetX), -y)

        const drawX = x + offsetX
        const size = baseSize * 2

        // Outer ring with glow
        ctx.beginPath()
        ctx.arc(drawX, y, size * 2, 0, Math.PI * 2)
        ctx.strokeStyle = '#f59e0b'
        ctx.lineWidth = size * 0.3
        ctx.stroke()

        // Inner fill
        ctx.beginPath()
        ctx.arc(drawX, y, size, 0, Math.PI * 2)
        ctx.fillStyle = '#fbbf24'
        ctx.fill()

        // Exclamation mark
        ctx.fillStyle = '#78350f'
        ctx.font = `bold ${size * 1.5}px sans-serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('!', drawX, y)
        break
      }
    }
  }

  /**
   * Draw subtitle text at bottom center of canvas
   * White text on semi-transparent dark background box
   */
  function drawSubtitle(
    ctx: CanvasRenderingContext2D,
    text: string,
    canvasWidth: number,
    canvasHeight: number
  ) {
    if (!text) return

    ctx.save()

    // Scale font size based on canvas resolution (~48px at 1080p)
    const fontSize = Math.round(canvasHeight * 0.045)
    ctx.font = `bold ${fontSize}px "Noto Sans Thai", "Sarabun", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const x = canvasWidth / 2
    const y = canvasHeight - Math.round(canvasHeight * 0.08) // Position for text center

    // Measure text for background box
    const textMetrics = ctx.measureText(text)
    const textWidth = textMetrics.width
    const textHeight = fontSize * 1.2
    const paddingX = fontSize * 0.5
    const paddingY = fontSize * 0.3
    const boxWidth = textWidth + paddingX * 2
    const boxHeight = textHeight + paddingY * 2
    const boxX = x - boxWidth / 2
    const boxY = y - boxHeight / 2
    const borderRadius = fontSize * 0.3

    // Draw rounded background box
    ctx.beginPath()
    ctx.roundRect(boxX, boxY, boxWidth, boxHeight, borderRadius)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)'
    ctx.fill()

    // Draw white text
    ctx.fillStyle = 'white'
    ctx.fillText(text, x, y)

    ctx.restore()
  }

  /**
   * Find the current subtitle text based on elapsed time
   */
  function getCurrentSubtitle(timings: WordTiming[], elapsedTimeMs: number): string {
    for (const timing of timings) {
      if (elapsedTimeMs >= timing.startTime && elapsedTimeMs < timing.endTime) {
        return timing.text
      }
    }
    return ''
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function cancelRender() {
    shouldCancel = true
  }

  return {
    renderVideo,
    cancelRender
  }
}
