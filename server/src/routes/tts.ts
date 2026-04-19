import { Router, Request, Response } from 'express'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

const router = Router()

/**
 * Word timing for subtitle synchronization
 */
interface WordTiming {
  text: string      // The word(s) to display
  startTime: number // Start time in milliseconds
  endTime: number   // End time in milliseconds
}

/**
 * TTS generation result with audio and timing
 */
interface TTSResult {
  audio: Buffer
  timings: WordTiming[]
}

// Available Thai voices from Edge TTS
const THAI_VOICES = [
  {
    Name: 'Microsoft Server Speech Text to Speech Voice (th-TH, PremwadeeNeural)',
    ShortName: 'th-TH-PremwadeeNeural',
    Gender: 'Female',
    Locale: 'th-TH',
    FriendlyName: 'Thai Female (Premwadee)'
  },
  {
    Name: 'Microsoft Server Speech Text to Speech Voice (th-TH, NiwatNeural)',
    ShortName: 'th-TH-NiwatNeural',
    Gender: 'Male',
    Locale: 'th-TH',
    FriendlyName: 'Thai Male (Niwat)'
  }
]

/**
 * GET /api/tts/voices
 * Get available Thai voices
 */
router.get('/voices', (_req: Request, res: Response) => {
  res.json({ voices: THAI_VOICES })
})

/**
 * Parse VTT timestamp to milliseconds
 * Format: HH:MM:SS.mmm or MM:SS.mmm
 */
function parseVTTTimestamp(timestamp: string): number {
  const parts = timestamp.trim().split(':')
  let hours = 0, minutes = 0, seconds = 0

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10)
    minutes = parseInt(parts[1], 10)
    seconds = parseFloat(parts[2])
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10)
    seconds = parseFloat(parts[1])
  }

  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000)
}

/**
 * Check if text is primarily Thai (contains Thai characters)
 */
function isThaiText(text: string): boolean {
  const thaiPattern = /[\u0E00-\u0E7F]/
  return thaiPattern.test(text)
}

/**
 * Split Thai text into word-like chunks (2-4 characters each)
 * Thai doesn't have spaces, so we approximate word boundaries
 */
function splitThaiText(text: string): string[] {
  const words: string[] = []
  let currentWord = ''

  for (const char of text) {
    currentWord += char

    // Split after 2-4 characters, preferring to split after certain characters
    // Thai vowels that typically end syllables: ะ า ิ ี ึ ื ุ ู เ แ โ ใ ไ
    const isVowelEnding = /[ะาิีึืุูเแโใไ]/.test(char)
    const isToneOrSpecial = /[่้๊๋์]/.test(char)

    if (currentWord.length >= 4 || (currentWord.length >= 2 && isVowelEnding && !isToneOrSpecial)) {
      words.push(currentWord)
      currentWord = ''
    }
  }

  if (currentWord) {
    words.push(currentWord)
  }

  return words
}

/**
 * Split text into 1-2 word chunks with interpolated timing
 */
function splitIntoWordChunks(text: string, startTime: number, endTime: number): WordTiming[] {
  const duration = endTime - startTime
  const chunks: WordTiming[] = []

  let words: string[]

  if (isThaiText(text)) {
    // For Thai text, use character-based splitting
    words = splitThaiText(text.trim())
  } else {
    // For other languages, split on whitespace
    words = text.trim().split(/\s+/).filter(w => w.length > 0)
  }

  if (words.length === 0) return []

  // Group into 1-2 word chunks
  const wordChunks: string[] = []
  for (let i = 0; i < words.length; i += 2) {
    if (i + 1 < words.length) {
      wordChunks.push(words[i] + (isThaiText(text) ? '' : ' ') + words[i + 1])
    } else {
      wordChunks.push(words[i])
    }
  }

  // Distribute timing evenly across chunks
  const timePerChunk = duration / wordChunks.length

  for (let i = 0; i < wordChunks.length; i++) {
    chunks.push({
      text: wordChunks[i],
      startTime: Math.round(startTime + i * timePerChunk),
      endTime: Math.round(startTime + (i + 1) * timePerChunk)
    })
  }

  return chunks
}

/**
 * Parse VTT subtitle file content into word timings
 */
function parseVTT(vttContent: string): WordTiming[] {
  const timings: WordTiming[] = []
  const lines = vttContent.split('\n')

  let i = 0
  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes('-->')) {
    i++
  }

  while (i < lines.length) {
    const line = lines[i].trim()

    // Look for timestamp line (contains -->)
    if (line.includes('-->')) {
      const [startStr, endStr] = line.split('-->')
      const startTime = parseVTTTimestamp(startStr)
      const endTime = parseVTTTimestamp(endStr)

      // Collect all text lines until empty line or next timestamp
      const textLines: string[] = []
      i++
      while (i < lines.length && lines[i].trim() && !lines[i].includes('-->')) {
        // Skip cue numbers
        if (!/^\d+$/.test(lines[i].trim())) {
          textLines.push(lines[i].trim())
        }
        i++
      }

      const text = textLines.join(' ')
      if (text) {
        // Split this phrase into word chunks
        const chunks = splitIntoWordChunks(text, startTime, endTime)
        timings.push(...chunks)
      }
    } else {
      i++
    }
  }

  return timings
}

/**
 * Generate audio using Python edge-tts CLI with subtitle timing
 * Uses file-based text input to avoid Unicode encoding issues
 */
async function generateWithEdgeTTS(
  text: string,
  voice: string,
  rate: string
): Promise<TTSResult> {
  const uuid = randomUUID()
  const tempTextFile = join(tmpdir(), `tts-text-${uuid}.txt`)
  const tempAudioFile = join(tmpdir(), `tts-audio-${uuid}.mp3`)
  const tempSubtitleFile = join(tmpdir(), `tts-subs-${uuid}.vtt`)

  // Write text to temp file to avoid command line encoding issues
  await fs.writeFile(tempTextFile, text, 'utf-8')

  return new Promise((resolve, reject) => {
    // Use --rate=VALUE format to avoid issues with negative values like -10%
    // Add --write-subtitles to get timing information
    const args = [
      '--voice', voice,
      `--rate=${rate}`,
      '--file', tempTextFile,
      '--write-media', tempAudioFile,
      '--write-subtitles', tempSubtitleFile
    ]

    console.log(`[TTS] Running edge-tts: voice=${voice}, rate=${rate}, text="${text.substring(0, 30)}..."`)

    const proc = spawn('edge-tts', args, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let stderr = ''

    proc.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', async (code) => {
      // Clean up temp text file
      await fs.unlink(tempTextFile).catch(() => {})

      if (code !== 0) {
        await fs.unlink(tempAudioFile).catch(() => {})
        await fs.unlink(tempSubtitleFile).catch(() => {})
        reject(new Error(`edge-tts failed with code ${code}: ${stderr}`))
        return
      }

      try {
        const audioBuffer = await fs.readFile(tempAudioFile)

        // Try to read and parse subtitles
        let timings: WordTiming[] = []
        try {
          const vttContent = await fs.readFile(tempSubtitleFile, 'utf-8')
          timings = parseVTT(vttContent)
          console.log(`[TTS] Parsed ${timings.length} word timing entries`)
        } catch (subErr) {
          console.warn(`[TTS] Could not parse subtitles: ${subErr}`)
        }

        // Clean up files
        await fs.unlink(tempAudioFile).catch(() => {})
        await fs.unlink(tempSubtitleFile).catch(() => {})

        resolve({ audio: audioBuffer, timings })
      } catch (err) {
        reject(new Error(`Failed to read audio file: ${err}`))
      }
    })

    proc.on('error', async (err) => {
      await fs.unlink(tempTextFile).catch(() => {})
      reject(new Error(`Failed to spawn edge-tts: ${err.message}. Make sure Python edge-tts is installed: pip install edge-tts`))
    })
  })
}

/**
 * POST /api/tts/generate
 * Generate audio from text using Edge TTS
 * Returns audio as binary stream (legacy endpoint)
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { text, voice, speed = 1.0 } = req.body

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required' })
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 characters)' })
    }

    const voiceName = voice || 'th-TH-PremwadeeNeural'

    // Convert speed (0.5-2.0) to edge-tts rate format (+X% or -X%)
    const speedPercent = Math.round((speed - 1) * 100)
    const rateStr = speedPercent >= 0 ? `+${speedPercent}%` : `${speedPercent}%`

    console.log(`[TTS] Generating: "${text.substring(0, 50)}..." voice=${voiceName}`)

    const result = await generateWithEdgeTTS(text, voiceName, rateStr)

    console.log(`[TTS] Generated ${result.audio.length} bytes, ${result.timings.length} timing entries`)

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': result.audio.length,
      'Cache-Control': 'no-cache'
    })
    res.send(result.audio)
  } catch (error) {
    console.error('[TTS] Generation failed:', error)
    res.status(500).json({
      error: 'Failed to generate audio',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * POST /api/tts/generate-slide
 * Generate audio for a slide (with slide ID tracking and word timings)
 */
router.post('/generate-slide', async (req: Request, res: Response) => {
  try {
    const { slideId, text, voice, speed = 1.0 } = req.body

    if (!slideId || !text) {
      return res.status(400).json({ error: 'slideId and text are required' })
    }

    if (text.length > 5000) {
      return res.status(400).json({ error: 'Text too long (max 5000 characters)' })
    }

    const voiceName = voice || 'th-TH-PremwadeeNeural'
    const speedPercent = Math.round((speed - 1) * 100)
    const rateStr = speedPercent >= 0 ? `+${speedPercent}%` : `${speedPercent}%`

    console.log(`[TTS] Slide ${slideId}: "${text.substring(0, 30)}..." voice=${voiceName}`)

    const result = await generateWithEdgeTTS(text, voiceName, rateStr)
    const duration = estimateAudioDuration(result.audio.length)

    console.log(`[TTS] Slide ${slideId}: ${result.audio.length} bytes, ~${duration.toFixed(2)}s, ${result.timings.length} timing entries`)

    res.json({
      slideId,
      audio: result.audio.toString('base64'),
      mimeType: 'audio/mpeg',
      duration,
      size: result.audio.length,
      timings: result.timings
    })
  } catch (error) {
    console.error('[TTS] Slide generation failed:', error)
    res.status(500).json({
      error: 'Failed to generate audio',
      slideId: req.body?.slideId,
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
})

/**
 * Estimate audio duration from MP3 buffer size
 * Edge TTS uses ~48kbps mono MP3
 */
function estimateAudioDuration(bufferSize: number): number {
  return bufferSize / 6000
}

export default router
