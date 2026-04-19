import { Router, Request, Response } from 'express'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { randomUUID } from 'crypto'

const router = Router()

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
 * Generate audio using Python edge-tts CLI
 * Uses file-based text input to avoid Unicode encoding issues
 */
async function generateWithEdgeTTS(
  text: string,
  voice: string,
  rate: string
): Promise<Buffer> {
  const uuid = randomUUID()
  const tempTextFile = join(tmpdir(), `tts-text-${uuid}.txt`)
  const tempAudioFile = join(tmpdir(), `tts-audio-${uuid}.mp3`)

  // Write text to temp file to avoid command line encoding issues
  await fs.writeFile(tempTextFile, text, 'utf-8')

  return new Promise((resolve, reject) => {
    // Use --rate=VALUE format to avoid issues with negative values like -10%
    const args = [
      '--voice', voice,
      `--rate=${rate}`,
      '--file', tempTextFile,
      '--write-media', tempAudioFile
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
        reject(new Error(`edge-tts failed with code ${code}: ${stderr}`))
        return
      }

      try {
        const audioBuffer = await fs.readFile(tempAudioFile)
        await fs.unlink(tempAudioFile).catch(() => {}) // Clean up audio file
        resolve(audioBuffer)
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

    const audioBuffer = await generateWithEdgeTTS(text, voiceName, rateStr)

    console.log(`[TTS] Generated ${audioBuffer.length} bytes`)

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Cache-Control': 'no-cache'
    })
    res.send(audioBuffer)
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
 * Generate audio for a slide (with slide ID tracking)
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

    const audioBuffer = await generateWithEdgeTTS(text, voiceName, rateStr)
    const duration = estimateAudioDuration(audioBuffer.length)

    console.log(`[TTS] Slide ${slideId}: ${audioBuffer.length} bytes, ~${duration.toFixed(2)}s`)

    res.json({
      slideId,
      audio: audioBuffer.toString('base64'),
      mimeType: 'audio/mpeg',
      duration,
      size: audioBuffer.length
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
