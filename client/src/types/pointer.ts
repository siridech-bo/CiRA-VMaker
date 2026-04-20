// Pointer animation types for video narration

// Basic pointer styles (static)
export type BasicPointerStyle = 'laser' | 'circle' | 'arrow' | 'hand' | 'hide'

// Animated pointer styles (GSAP + Rough.js)
export type AnimatedPointerStyle = 'bouncy' | 'sketch-circle' | 'sketch-arrow' | 'pop' | 'wiggle'

// All pointer styles
export type PointerStyle = BasicPointerStyle | AnimatedPointerStyle

// Check if a style is animated
export function isAnimatedStyle(style: PointerStyle): style is AnimatedPointerStyle {
  return ['bouncy', 'sketch-circle', 'sketch-arrow', 'pop', 'wiggle'].includes(style)
}

export interface PointerMarker {
  x: number              // 0-100 percentage
  y: number              // 0-100 percentage
  style: PointerStyle
  charIndex: number      // Position in original text (before marker removal)
  cleanCharIndex: number // Position in clean text (after marker removal)
  wordIndex: number      // Estimated word index for timing
}

export interface PointerTimeline {
  markers: PointerMarker[]
  cleanText: string      // Text with markers removed (for TTS)
  originalText: string   // Original text with markers
}

export interface PointerState {
  x: number
  y: number
  style: PointerStyle
  visible: boolean
  progress: number       // 0-1 animation progress for transitions
}

export interface PointerConfig {
  enabled: boolean
  defaultStyle: PointerStyle
  transitionDuration: number  // ms for pointer movement
  size: number               // pointer size multiplier (1 = default)
  color: string              // primary color for pointer
}

export const DEFAULT_POINTER_CONFIG: PointerConfig = {
  enabled: true,
  defaultStyle: 'laser',
  transitionDuration: 300,
  size: 1,
  color: '#ef4444'  // red-500
}

export const POINTER_STYLE_LABELS: Record<PointerStyle, string> = {
  // Basic styles
  laser: 'Laser Pointer',
  circle: 'Circle Highlight',
  arrow: 'Arrow',
  hand: 'Hand Cursor',
  hide: 'Hidden',
  // Animated styles (GSAP + Rough.js)
  bouncy: 'Bouncy Pointer',
  'sketch-circle': 'Hand-Drawn Circle',
  'sketch-arrow': 'Sketchy Arrow',
  pop: 'Pop Effect',
  wiggle: 'Wiggle Attention'
}

// Animation configuration for animated styles
export interface AnimationConfig {
  duration: number      // Animation duration in ms
  ease: string          // GSAP easing function
  bounce?: number       // Bounce intensity (0-1)
  roughness?: number    // Rough.js roughness (0-3)
  strokeWidth?: number  // Stroke width for sketch styles
}

export const ANIMATED_STYLE_CONFIG: Record<AnimatedPointerStyle, AnimationConfig> = {
  bouncy: {
    duration: 600,
    ease: 'elastic.out(1, 0.3)',
    bounce: 0.8
  },
  'sketch-circle': {
    duration: 400,
    ease: 'power2.out',
    roughness: 2.5,
    strokeWidth: 3
  },
  'sketch-arrow': {
    duration: 500,
    ease: 'back.out(1.7)',
    roughness: 2,
    strokeWidth: 3
  },
  pop: {
    duration: 300,
    ease: 'back.out(2)',
    bounce: 0.6
  },
  wiggle: {
    duration: 800,
    ease: 'power1.inOut',
    bounce: 0.3
  }
}
