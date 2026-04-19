import type { WordTiming } from '@/types'

/**
 * Estimates word timings by distributing the duration proportionally across word chunks.
 * Used for TTS engines that don't provide native timing data (like Kokoro).
 */
export function estimateWordTimings(text: string, durationMs: number): WordTiming[] {
  if (!text.trim() || durationMs <= 0) {
    return []
  }

  // Split into words
  const words = text.trim().split(/\s+/).filter(w => w.length > 0)

  if (words.length === 0) {
    return []
  }

  // Group into 1-2 word chunks for subtitle display
  const chunks = splitIntoWordChunks(words)

  if (chunks.length === 0) {
    return []
  }

  // Calculate total "weight" based on character count
  // Longer words take more time to speak
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0)

  // Distribute time proportionally by character count
  const timings: WordTiming[] = []
  let currentTime = 0

  for (const chunk of chunks) {
    const proportion = chunk.length / totalChars
    const chunkDuration = durationMs * proportion

    timings.push({
      text: chunk,
      startTime: Math.round(currentTime),
      endTime: Math.round(currentTime + chunkDuration)
    })

    currentTime += chunkDuration
  }

  // Ensure last timing ends at exactly the duration
  if (timings.length > 0) {
    timings[timings.length - 1].endTime = durationMs
  }

  return timings
}

/**
 * Splits an array of words into 1-2 word chunks for subtitle display.
 */
function splitIntoWordChunks(words: string[]): string[] {
  const chunks: string[] = []
  let i = 0

  while (i < words.length) {
    const word1 = words[i]
    const word2 = words[i + 1]

    // If there's a next word and combining them isn't too long
    if (word2 && (word1.length + word2.length) <= 20) {
      chunks.push(`${word1} ${word2}`)
      i += 2
    } else {
      chunks.push(word1)
      i += 1
    }
  }

  return chunks
}
