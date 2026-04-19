/**
 * Audio Post-Processing Utility
 * Applies compression and EQ to TTS audio for a more professional, energetic sound
 */

export interface AudioProcessingSettings {
  enabled: boolean
  // Compression settings
  compression: {
    enabled: boolean
    threshold: number     // dB, -100 to 0 (default: -24)
    ratio: number         // 1 to 20 (default: 4)
    attack: number        // seconds (default: 0.003)
    release: number       // seconds (default: 0.25)
    knee: number          // dB (default: 30)
  }
  // EQ settings for voice clarity
  eq: {
    enabled: boolean
    lowCut: number        // Hz, high-pass filter (default: 80)
    lowShelf: number      // dB, boost/cut below 300Hz (default: -2)
    midBoost: number      // dB, presence at 2-4kHz (default: 3)
    highShelf: number     // dB, air at 8kHz+ (default: 2)
  }
  // Output settings
  normalize: boolean      // Normalize to -1dB
  gain: number            // Final gain in dB (default: 0)
}

export const DEFAULT_PROCESSING_SETTINGS: AudioProcessingSettings = {
  enabled: true,
  compression: {
    enabled: true,
    threshold: -24,
    ratio: 4,
    attack: 0.003,
    release: 0.25,
    knee: 30
  },
  eq: {
    enabled: true,
    lowCut: 80,
    lowShelf: -2,
    midBoost: 3,
    highShelf: 2
  },
  normalize: true,
  gain: 0
}

// Preset configurations - More dramatic for noticeable differences
export const PROCESSING_PRESETS: Record<string, AudioProcessingSettings> = {
  none: {
    enabled: false,
    compression: { enabled: false, threshold: -24, ratio: 4, attack: 0.003, release: 0.25, knee: 30 },
    eq: { enabled: false, lowCut: 80, lowShelf: 0, midBoost: 0, highShelf: 0 },
    normalize: false,
    gain: 0
  },
  natural: {
    // Minimal processing - just normalize
    enabled: true,
    compression: { enabled: false, threshold: -20, ratio: 2.5, attack: 0.005, release: 0.3, knee: 40 },
    eq: { enabled: true, lowCut: 80, lowShelf: 0, midBoost: 0, highShelf: 0 },
    normalize: true,
    gain: 0
  },
  broadcast: {
    // Radio/podcast style - clear and present
    enabled: true,
    compression: { enabled: true, threshold: -20, ratio: 5, attack: 0.002, release: 0.2, knee: 20 },
    eq: { enabled: true, lowCut: 100, lowShelf: -4, midBoost: 5, highShelf: 3 },
    normalize: true,
    gain: 0
  },
  energetic: {
    // Punchy and loud - YouTube/social media style
    enabled: true,
    compression: { enabled: true, threshold: -15, ratio: 8, attack: 0.001, release: 0.1, knee: 10 },
    eq: { enabled: true, lowCut: 120, lowShelf: -6, midBoost: 8, highShelf: 5 },
    normalize: true,
    gain: 4
  },
  warm: {
    // Bass-heavy, smooth - audiobook/meditation style
    enabled: true,
    compression: { enabled: true, threshold: -25, ratio: 3, attack: 0.01, release: 0.4, knee: 40 },
    eq: { enabled: true, lowCut: 40, lowShelf: 4, midBoost: -2, highShelf: -3 },
    normalize: true,
    gain: 0
  }
}

/**
 * Process audio using Web Audio API
 */
export async function processAudio(
  audioBlob: Blob,
  settings: AudioProcessingSettings
): Promise<Blob> {
  if (!settings.enabled) {
    return audioBlob
  }

  const audioContext = new OfflineAudioContext(1, 1, 44100) // Temporary for decoding
  const arrayBuffer = await audioBlob.arrayBuffer()
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

  // Create offline context with actual duration
  const sampleRate = audioBuffer.sampleRate
  const duration = audioBuffer.duration
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil(duration * sampleRate),
    sampleRate
  )

  // Create source
  const source = offlineCtx.createBufferSource()
  source.buffer = audioBuffer

  // Build processing chain
  let currentNode: AudioNode = source

  // High-pass filter (low cut)
  if (settings.eq.enabled && settings.eq.lowCut > 0) {
    const highpass = offlineCtx.createBiquadFilter()
    highpass.type = 'highpass'
    highpass.frequency.value = settings.eq.lowCut
    highpass.Q.value = 0.7
    currentNode.connect(highpass)
    currentNode = highpass
  }

  // Low shelf EQ
  if (settings.eq.enabled && settings.eq.lowShelf !== 0) {
    const lowShelf = offlineCtx.createBiquadFilter()
    lowShelf.type = 'lowshelf'
    lowShelf.frequency.value = 300
    lowShelf.gain.value = settings.eq.lowShelf
    currentNode.connect(lowShelf)
    currentNode = lowShelf
  }

  // Mid boost (peaking EQ at 2.5kHz for presence)
  if (settings.eq.enabled && settings.eq.midBoost !== 0) {
    const midBoost = offlineCtx.createBiquadFilter()
    midBoost.type = 'peaking'
    midBoost.frequency.value = 2500
    midBoost.Q.value = 1.5
    midBoost.gain.value = settings.eq.midBoost
    currentNode.connect(midBoost)
    currentNode = midBoost
  }

  // High shelf EQ (air)
  if (settings.eq.enabled && settings.eq.highShelf !== 0) {
    const highShelf = offlineCtx.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 8000
    highShelf.gain.value = settings.eq.highShelf
    currentNode.connect(highShelf)
    currentNode = highShelf
  }

  // Compressor
  if (settings.compression.enabled) {
    const compressor = offlineCtx.createDynamicsCompressor()
    compressor.threshold.value = settings.compression.threshold
    compressor.ratio.value = settings.compression.ratio
    compressor.attack.value = settings.compression.attack
    compressor.release.value = settings.compression.release
    compressor.knee.value = settings.compression.knee
    currentNode.connect(compressor)
    currentNode = compressor
  }

  // Output gain
  if (settings.gain !== 0) {
    const gainNode = offlineCtx.createGain()
    gainNode.gain.value = Math.pow(10, settings.gain / 20) // Convert dB to linear
    currentNode.connect(gainNode)
    currentNode = gainNode
  }

  // Connect to destination
  currentNode.connect(offlineCtx.destination)

  // Start and render
  source.start(0)
  const renderedBuffer = await offlineCtx.startRendering()

  // Normalize if requested
  let finalBuffer = renderedBuffer
  if (settings.normalize) {
    finalBuffer = normalizeAudio(renderedBuffer, -1) // Normalize to -1dB
  }

  // Convert back to WAV blob
  return audioBufferToWav(finalBuffer)
}

/**
 * Normalize audio to target peak level
 */
function normalizeAudio(buffer: AudioBuffer, targetDb: number): AudioBuffer {
  const targetLinear = Math.pow(10, targetDb / 20)
  const channels = buffer.numberOfChannels
  const length = buffer.length

  // Find peak
  let peak = 0
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      const abs = Math.abs(data[i])
      if (abs > peak) peak = abs
    }
  }

  if (peak === 0) return buffer

  const gain = targetLinear / peak

  // Create new buffer with normalized data
  const ctx = new OfflineAudioContext(channels, length, buffer.sampleRate)
  const normalizedBuffer = ctx.createBuffer(channels, length, buffer.sampleRate)

  for (let c = 0; c < channels; c++) {
    const input = buffer.getChannelData(c)
    const output = normalizedBuffer.getChannelData(c)
    for (let i = 0; i < length; i++) {
      output[i] = Math.max(-1, Math.min(1, input[i] * gain))
    }
  }

  return normalizedBuffer
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const bitsPerSample = 16
  const bytesPerSample = bitsPerSample / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = buffer.length * blockAlign
  const bufferSize = 44 + dataSize

  const arrayBuffer = new ArrayBuffer(bufferSize)
  const view = new DataView(arrayBuffer)

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i))
    }
  }

  // WAV header
  writeString(0, 'RIFF')
  view.setUint32(4, bufferSize - 8, true)
  writeString(8, 'WAVE')
  writeString(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, bitsPerSample, true)
  writeString(36, 'data')
  view.setUint32(40, dataSize, true)

  // Interleave channels and write samples
  let offset = 44
  const channelData: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c))
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channelData[c][i]))
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF
      view.setInt16(offset, intSample, true)
      offset += 2
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' })
}
