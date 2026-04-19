import { useProjectStore } from '@/stores/projectStore'
import { useRenderStore } from '@/stores/renderStore'
import { blobStorage } from '@/services/blobStorage'
import { parsePointerMarkers, calculateMarkerTimings, getPointerStateAtTime } from '@/utils/pointerParser'
import type { PointerMarker, PointerStyle, WordTiming } from '@/types'

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
        animStartTime: 0
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
            // Update pointer target
            if (pointerState.targetX !== pointerInfo.x || pointerState.targetY !== pointerInfo.y) {
              pointerState.animStartTime = elapsedTime
              pointerState.targetX = pointerInfo.x
              pointerState.targetY = pointerInfo.y
            }
            pointerState.style = pointerInfo.style
            pointerState.visible = true

            // Smooth interpolation
            const animProgress = Math.min(1, (elapsedTime - pointerState.animStartTime) * 1000 / POINTER_TRANSITION_MS)
            const easeProgress = easeOutCubic(animProgress)

            pointerState.currentX += (pointerState.targetX - pointerState.currentX) * easeProgress
            pointerState.currentY += (pointerState.targetY - pointerState.currentY) * easeProgress

            // Draw pointer
            drawPointer(ctx, pointerState.currentX, pointerState.currentY, pointerState.style, width, height)
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
    xPercent: number,
    yPercent: number,
    style: PointerStyle,
    canvasWidth: number,
    canvasHeight: number
  ) {
    const x = (xPercent / 100) * canvasWidth
    const y = (yPercent / 100) * canvasHeight
    const baseSize = Math.min(canvasWidth, canvasHeight) * 0.02

    ctx.save()

    switch (style) {
      case 'laser':
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
