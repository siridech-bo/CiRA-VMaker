// Pointer animation types for video narration

export type PointerStyle = 'laser' | 'circle' | 'arrow' | 'spotlight' | 'hand' | 'hide'

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
  laser: 'Laser Pointer',
  circle: 'Circle Highlight',
  arrow: 'Arrow',
  spotlight: 'Spotlight',
  hand: 'Hand Cursor',
  hide: 'Hidden'
}
