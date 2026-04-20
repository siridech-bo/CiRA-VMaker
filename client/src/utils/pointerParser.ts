import type { PointerMarker, PointerTimeline, PointerStyle } from '@/types'

/**
 * Regex to match pointer markers in text
 * Formats supported:
 * - {@x,y} - basic pointer at x%, y%
 * - {@x,y:style} - pointer with specific style (supports hyphenated styles like sketch-circle)
 * - {@center} - center of slide
 * - {@hide} - hide pointer
 */
const POINTER_MARKER_REGEX = /\{@(\d+),(\d+)(?::([\w-]+))?\}|\{@(center|hide)\}/gi

/**
 * Parse pointer markers from text and return clean text + marker data
 */
export function parsePointerMarkers(text: string): PointerTimeline {
  const markers: PointerMarker[] = []
  let cleanText = ''
  let lastIndex = 0
  let wordCount = 0

  // Reset regex
  POINTER_MARKER_REGEX.lastIndex = 0

  let match: RegExpExecArray | null
  while ((match = POINTER_MARKER_REGEX.exec(text)) !== null) {
    // Add text before this marker to clean text
    const textBefore = text.slice(lastIndex, match.index)
    cleanText += textBefore

    // Count words in text before marker for timing estimation
    const wordsInBefore = textBefore.trim().split(/\s+/).filter(w => w.length > 0).length
    wordCount += wordsInBefore

    const charIndex = match.index
    const cleanCharIndex = cleanText.length

    // Parse marker type
    if (match[4]) {
      // Special markers: {@center} or {@hide}
      const special = match[4].toLowerCase()
      if (special === 'center') {
        markers.push({
          x: 50,
          y: 50,
          style: 'laser',
          charIndex,
          cleanCharIndex,
          wordIndex: wordCount
        })
      } else if (special === 'hide') {
        markers.push({
          x: -1,
          y: -1,
          style: 'hide',
          charIndex,
          cleanCharIndex,
          wordIndex: wordCount
        })
      }
    } else {
      // Coordinate markers: {@x,y} or {@x,y:style}
      const x = parseInt(match[1], 10)
      const y = parseInt(match[2], 10)
      const rawStyle = match[3]?.toLowerCase() || 'laser'

      // Validate coordinates
      if (x >= 0 && x <= 100 && y >= 0 && y <= 100) {
        markers.push({
          x,
          y,
          style: normalizeStyle(rawStyle),
          charIndex,
          cleanCharIndex,
          wordIndex: wordCount
        })
      }
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  cleanText += text.slice(lastIndex)

  return {
    markers,
    cleanText: cleanText.trim(),
    originalText: text
  }
}

// All valid pointer styles (basic + animated)
const VALID_STYLES = [
  // Basic styles
  'laser', 'circle', 'arrow', 'hand', 'hide',
  // Animated styles (GSAP + Rough.js)
  'bouncy', 'sketch-circle', 'sketch-arrow', 'pop', 'wiggle'
]

/**
 * Check if a style string is valid
 * Note: 'spotlight' is converted to 'laser' for backwards compatibility
 */
function isValidStyle(style: string): style is PointerStyle {
  return VALID_STYLES.includes(style)
}

/**
 * Normalize style - converts deprecated styles to valid ones
 */
function normalizeStyle(style: string): PointerStyle {
  // Convert spotlight to laser (spotlight was removed as it made video too dark)
  if (style === 'spotlight') {
    return 'laser'
  }
  return isValidStyle(style) ? style : 'laser'
}

/**
 * Calculate timing for each marker based on word positions and audio duration
 */
export function calculateMarkerTimings(
  markers: PointerMarker[],
  cleanText: string,
  audioDuration: number
): Array<PointerMarker & { startTime: number }> {
  // Count total words
  const totalWords = cleanText.trim().split(/\s+/).filter(w => w.length > 0).length

  if (totalWords === 0) {
    return markers.map(m => ({ ...m, startTime: 0 }))
  }

  // Calculate time per word (assuming even distribution)
  const timePerWord = audioDuration / totalWords

  return markers.map(marker => ({
    ...marker,
    startTime: marker.wordIndex * timePerWord
  }))
}

/**
 * Get current pointer state based on elapsed time
 */
export function getPointerStateAtTime(
  markers: Array<PointerMarker & { startTime: number }>,
  elapsedTime: number,
  transitionDuration: number = 300
): { x: number; y: number; style: PointerStyle; visible: boolean; progress: number } | null {
  if (markers.length === 0) {
    return null
  }

  // Find active marker
  let activeMarker: (PointerMarker & { startTime: number }) | null = null

  for (let i = markers.length - 1; i >= 0; i--) {
    if (elapsedTime >= markers[i].startTime) {
      activeMarker = markers[i]
      break
    }
  }

  if (!activeMarker) {
    // Before first marker
    return null
  }

  if (activeMarker.style === 'hide') {
    return { x: 0, y: 0, style: 'hide', visible: false, progress: 1 }
  }

  // Calculate transition progress if we're moving to this marker
  const timeSinceMarker = (elapsedTime - activeMarker.startTime) * 1000 // convert to ms
  const progress = Math.min(1, timeSinceMarker / transitionDuration)

  return {
    x: activeMarker.x,
    y: activeMarker.y,
    style: activeMarker.style,
    visible: true,
    progress
  }
}

/**
 * Check if text contains any pointer markers
 */
export function hasPointerMarkers(text: string): boolean {
  POINTER_MARKER_REGEX.lastIndex = 0
  return POINTER_MARKER_REGEX.test(text)
}

/**
 * Format a pointer marker for insertion into text
 */
export function formatPointerMarker(x: number, y: number, style?: PointerStyle): string {
  if (style && style !== 'laser') {
    return `{@${x},${y}:${style}}`
  }
  return `{@${x},${y}}`
}

/**
 * Generate example pointer markers for documentation
 */
export function getPointerSyntaxHelp(): string {
  return `
Pointer Marker Syntax:
  {@x,y}         - Point at position (x,y are percentages 0-100)
  {@x,y:style}   - Point with specific style
  {@center}      - Point at center of slide
  {@hide}        - Hide pointer

Basic styles:
  laser     - Red laser dot (default)
  circle    - Pulsing circle highlight
  arrow     - Arrow pointing at position
  hand      - Cartoon hand cursor

Animated styles (cartoon effects):
  bouncy        - Bouncy entrance with squash/stretch
  sketch-circle - Hand-drawn sketchy circle
  sketch-arrow  - Squiggly hand-drawn arrow
  pop           - Pop-in with scale overshoot
  wiggle        - Shaking attention effect

Examples:
  {@75,25}This is the title area.
  {@30,60:circle}Look at this important diagram.
  {@50,80:bouncy}Check out this feature!
  {@40,50:sketch-circle}This is the key concept.
  {@hide}Now let me explain the concept.
`.trim()
}
