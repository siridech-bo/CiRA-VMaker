/**
 * Animated Pointer Renderer using GSAP + Rough.js
 * Provides cartoon-style animated effects for pointers
 */

import gsap from 'gsap'
import rough from 'roughjs'
import type { AnimatedPointerStyle } from '@/types'
import { ANIMATED_STYLE_CONFIG } from '@/types/pointer'

// Animation state for tracking active animations
interface AnimationState {
  scale: number
  rotation: number
  opacity: number
  offsetX: number
  offsetY: number
  drawProgress: number  // For sketch animations (0-1)
  wigglePhase: number   // For wiggle animation
}

// Create initial animation state
function createInitialState(): AnimationState {
  return {
    scale: 0,
    rotation: 0,
    opacity: 0,
    offsetX: 0,
    offsetY: 0,
    drawProgress: 0,
    wigglePhase: 0
  }
}

// Active animation states per pointer ID
const animationStates: Map<string, AnimationState> = new Map()
const activeTimelines: Map<string, gsap.core.Timeline> = new Map()

/**
 * Get or create animation state for a pointer
 */
function getState(pointerId: string): AnimationState {
  if (!animationStates.has(pointerId)) {
    animationStates.set(pointerId, createInitialState())
  }
  return animationStates.get(pointerId)!
}

/**
 * Start entrance animation for animated pointer styles
 */
export function startPointerAnimation(
  pointerId: string,
  style: AnimatedPointerStyle,
  onUpdate: () => void
): void {
  // Kill any existing animation
  const existingTimeline = activeTimelines.get(pointerId)
  if (existingTimeline) {
    existingTimeline.kill()
  }

  const state = getState(pointerId)
  const config = ANIMATED_STYLE_CONFIG[style]

  // Reset state
  Object.assign(state, createInitialState())

  const tl = gsap.timeline({
    onUpdate,
    defaults: { ease: config.ease }
  })

  switch (style) {
    case 'bouncy':
      // Bouncy entrance with squash/stretch
      tl.to(state, {
        scale: 1.3,
        opacity: 1,
        duration: config.duration * 0.3 / 1000
      })
      .to(state, {
        scale: 0.8,
        duration: config.duration * 0.15 / 1000
      })
      .to(state, {
        scale: 1.1,
        duration: config.duration * 0.15 / 1000
      })
      .to(state, {
        scale: 1,
        duration: config.duration * 0.4 / 1000,
        ease: 'elastic.out(1, 0.3)'
      })
      break

    case 'sketch-circle':
    case 'sketch-arrow':
      // Draw animation - progress from 0 to 1
      tl.to(state, {
        opacity: 1,
        duration: 0.1
      })
      .to(state, {
        drawProgress: 1,
        duration: config.duration / 1000,
        ease: 'power2.out'
      })
      .to(state, {
        scale: 1,
        duration: 0.1
      }, 0)
      break

    case 'pop':
      // Pop-in with scale overshoot
      tl.fromTo(state,
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: config.duration / 1000,
          ease: 'back.out(2)'
        }
      )
      break

    case 'wiggle':
      // Wiggle/shake attention effect
      state.opacity = 1
      state.scale = 1
      tl.to(state, {
        wigglePhase: Math.PI * 6,  // 3 full wiggles
        duration: config.duration / 1000,
        ease: 'power1.inOut',
        onUpdate: () => {
          state.offsetX = Math.sin(state.wigglePhase) * 8
          state.rotation = Math.sin(state.wigglePhase) * 0.15
        }
      })
      .to(state, {
        offsetX: 0,
        rotation: 0,
        wigglePhase: 0,
        duration: 0.2
      })
      break
  }

  activeTimelines.set(pointerId, tl)
}

/**
 * Stop animation for a pointer
 */
export function stopPointerAnimation(pointerId: string): void {
  const timeline = activeTimelines.get(pointerId)
  if (timeline) {
    timeline.kill()
    activeTimelines.delete(pointerId)
  }
  animationStates.delete(pointerId)
}

/**
 * Draw animated pointer on canvas
 */
export function drawAnimatedPointer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  style: AnimatedPointerStyle,
  baseSize: number,
  pointerId: string
): void {
  const state = getState(pointerId)

  if (state.opacity <= 0) return

  ctx.save()
  ctx.globalAlpha = state.opacity

  // Apply transformations
  const drawX = x + state.offsetX
  const drawY = y

  ctx.translate(drawX, drawY)
  ctx.rotate(state.rotation)
  ctx.scale(state.scale || 1, state.scale || 1)
  ctx.translate(-drawX, -drawY)

  switch (style) {
    case 'bouncy':
      drawBouncyPointer(ctx, drawX, drawY, baseSize, state)
      break
    case 'sketch-circle':
      drawSketchCircle(ctx, canvas, drawX, drawY, baseSize, state)
      break
    case 'sketch-arrow':
      drawSketchArrow(ctx, canvas, drawX, drawY, baseSize, state)
      break
    case 'pop':
      drawPopPointer(ctx, drawX, drawY, baseSize, state)
      break
    case 'wiggle':
      drawWigglePointer(ctx, drawX, drawY, baseSize, state)
      break
  }

  ctx.restore()
}

/**
 * Bouncy pointer - cartoon hand with bounce effect
 */
function drawBouncyPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseSize: number,
  state: AnimationState
): void {
  // Draw cartoon pointing hand with squash/stretch
  const squash = 1 + (state.scale - 1) * 0.3

  ctx.save()
  ctx.translate(x, y)
  ctx.scale(1 / squash, squash)  // Squash horizontally, stretch vertically
  ctx.translate(-x, -y)

  // Hand shape (improved cartoon style)
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x + baseSize * 0.8, y + baseSize * 2)
  ctx.lineTo(x + baseSize * 1.8, y + baseSize * 2.2)
  ctx.quadraticCurveTo(x + baseSize * 2.2, y + baseSize * 3, x + baseSize * 1.5, y + baseSize * 3.5)
  ctx.lineTo(x + baseSize * 0.3, y + baseSize * 3.5)
  ctx.quadraticCurveTo(x - baseSize * 0.3, y + baseSize * 3, x - baseSize * 0.5, y + baseSize * 2.5)
  ctx.lineTo(x - baseSize * 0.3, y + baseSize * 2)
  ctx.closePath()

  // Yellow hand with orange outline
  ctx.fillStyle = '#fbbf24'
  ctx.fill()
  ctx.strokeStyle = '#b45309'
  ctx.lineWidth = baseSize * 0.12
  ctx.stroke()

  ctx.restore()
}

/**
 * Hand-drawn sketchy circle using Rough.js
 */
function drawSketchCircle(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  baseSize: number,
  state: AnimationState
): void {
  const config = ANIMATED_STYLE_CONFIG['sketch-circle']
  const rc = rough.canvas(canvas)

  // Calculate partial circle based on draw progress
  const radius = baseSize * 3
  const circumference = 2 * Math.PI * radius
  const dashLength = circumference * state.drawProgress

  if (state.drawProgress < 1) {
    // Animated drawing - use dashed line
    ctx.save()
    ctx.setLineDash([dashLength, circumference])
    ctx.lineDashOffset = 0
  }

  // Draw hand-drawn circle
  const generator = rc.generator
  const circle = generator.circle(x, y, radius * 2, {
    stroke: '#3b82f6',  // blue-500
    strokeWidth: config.strokeWidth || 3,
    roughness: (config.roughness || 2.5) * state.drawProgress,
    bowing: 1.5
  })

  // Render to context
  rc.draw(circle)

  if (state.drawProgress < 1) {
    ctx.restore()
  }
}

/**
 * Hand-drawn sketchy arrow using Rough.js
 */
function drawSketchArrow(
  _ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  baseSize: number,
  state: AnimationState
): void {
  const config = ANIMATED_STYLE_CONFIG['sketch-arrow']
  const rc = rough.canvas(canvas)

  const arrowLength = baseSize * 4
  const headSize = baseSize * 1.5

  // Arrow shaft
  const shaftEnd = y + arrowLength * state.drawProgress

  const generator = rc.generator

  // Draw shaft
  const line = generator.line(x, y, x, shaftEnd, {
    stroke: '#ef4444',  // red-500
    strokeWidth: config.strokeWidth || 3,
    roughness: config.roughness || 2
  })
  rc.draw(line)

  // Draw arrowhead when mostly complete
  if (state.drawProgress > 0.7) {
    const headProgress = (state.drawProgress - 0.7) / 0.3
    const headY = shaftEnd

    const leftHead = generator.line(
      x, headY,
      x - headSize * headProgress, headY - headSize * headProgress,
      {
        stroke: '#ef4444',
        strokeWidth: config.strokeWidth || 3,
        roughness: config.roughness || 2
      }
    )

    const rightHead = generator.line(
      x, headY,
      x + headSize * headProgress, headY - headSize * headProgress,
      {
        stroke: '#ef4444',
        strokeWidth: config.strokeWidth || 3,
        roughness: config.roughness || 2
      }
    )

    rc.draw(leftHead)
    rc.draw(rightHead)
  }
}

/**
 * Pop pointer - circle that pops in with overshoot
 */
function drawPopPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseSize: number,
  _state: AnimationState
): void {
  // Outer glow
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, baseSize * 4)
  gradient.addColorStop(0, 'rgba(139, 92, 246, 0.8)')  // purple-500
  gradient.addColorStop(0.5, 'rgba(139, 92, 246, 0.3)')
  gradient.addColorStop(1, 'rgba(139, 92, 246, 0)')

  ctx.beginPath()
  ctx.arc(x, y, baseSize * 4, 0, Math.PI * 2)
  ctx.fillStyle = gradient
  ctx.fill()

  // Inner solid circle
  ctx.beginPath()
  ctx.arc(x, y, baseSize * 1.5, 0, Math.PI * 2)
  ctx.fillStyle = '#8b5cf6'
  ctx.fill()

  // White highlight
  ctx.beginPath()
  ctx.arc(x - baseSize * 0.3, y - baseSize * 0.3, baseSize * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
  ctx.fill()
}

/**
 * Wiggle pointer - attention-getting shake effect
 */
function drawWigglePointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseSize: number,
  _state: AnimationState
): void {
  // Exclamation-style attention indicator
  const size = baseSize * 2

  // Outer ring with glow
  ctx.beginPath()
  ctx.arc(x, y, size * 2, 0, Math.PI * 2)
  ctx.strokeStyle = '#f59e0b'  // amber-500
  ctx.lineWidth = size * 0.3
  ctx.stroke()

  // Inner fill
  ctx.beginPath()
  ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fillStyle = '#fbbf24'  // amber-400
  ctx.fill()

  // Exclamation mark
  ctx.fillStyle = '#78350f'  // amber-900
  ctx.font = `bold ${size * 1.5}px sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('!', x, y)
}

/**
 * Check if animation is complete for a pointer
 */
export function isAnimationComplete(pointerId: string): boolean {
  const timeline = activeTimelines.get(pointerId)
  if (!timeline) return true
  return timeline.progress() >= 1
}

/**
 * Get current animation state for a pointer
 */
export function getAnimationState(pointerId: string): AnimationState | null {
  return animationStates.get(pointerId) || null
}

/**
 * Clean up all animations
 */
export function cleanupAllAnimations(): void {
  activeTimelines.forEach(tl => tl.kill())
  activeTimelines.clear()
  animationStates.clear()
}
