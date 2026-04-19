import * as pdfjsLib from 'pdfjs-dist'
import JSZip from 'jszip'
import type { Slide } from '@/types'

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString()

export interface ProcessingProgress {
  current: number
  total: number
  message: string
}

export interface ProcessedSlide {
  index: number
  imageDataUrl: string
  thumbnailDataUrl: string
  width: number
  height: number
}

/**
 * Process a PDF file and extract slides as images (client-side)
 */
export async function processPDF(
  file: File,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessedSlide[]> {
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const numPages = pdf.numPages
  const slides: ProcessedSlide[] = []

  for (let i = 1; i <= numPages; i++) {
    onProgress?.({
      current: i,
      total: numPages,
      message: `Processing page ${i} of ${numPages}...`
    })

    const page = await pdf.getPage(i)

    // Render at high resolution for full image
    const scale = 2.0 // 2x scale for good quality
    const viewport = page.getViewport({ scale })

    // Create canvas for full-size image
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')!
    canvas.width = viewport.width
    canvas.height = viewport.height

    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise

    const imageDataUrl = canvas.toDataURL('image/png', 0.92)

    // Create thumbnail (320px width)
    const thumbScale = 320 / page.getViewport({ scale: 1 }).width
    const thumbViewport = page.getViewport({ scale: thumbScale })

    const thumbCanvas = document.createElement('canvas')
    const thumbContext = thumbCanvas.getContext('2d')!
    thumbCanvas.width = thumbViewport.width
    thumbCanvas.height = thumbViewport.height

    await page.render({
      canvasContext: thumbContext,
      viewport: thumbViewport
    }).promise

    const thumbnailDataUrl = thumbCanvas.toDataURL('image/png', 0.8)

    slides.push({
      index: i - 1,
      imageDataUrl,
      thumbnailDataUrl,
      width: Math.round(viewport.width),
      height: Math.round(viewport.height)
    })

    // Clean up
    page.cleanup()
  }

  return slides
}

/**
 * Process a PPTX file and extract slides as images (client-side)
 * PPTX files contain slide images in ppt/media/ folder
 */
export async function processPPTX(
  file: File,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<ProcessedSlide[]> {
  const arrayBuffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)

  // Find all slide images in the PPTX
  // PPTX stores slides as XML, but we need to render them
  // For now, we'll extract embedded images or use a canvas approach

  // Get slide count from presentation.xml
  const presentationXml = await zip.file('ppt/presentation.xml')?.async('string')
  if (!presentationXml) {
    throw new Error('Invalid PPTX file: missing presentation.xml')
  }

  // Parse slide references
  const slideMatches = presentationXml.match(/r:id="rId\d+"/g) || []
  const slideCount = slideMatches.length

  if (slideCount === 0) {
    throw new Error('No slides found in PPTX file')
  }

  onProgress?.({
    current: 0,
    total: slideCount,
    message: 'Extracting slides from PPTX...'
  })

  // For PPTX, we need to render slides to canvas
  // This is complex because PPTX uses XML/OOXML format
  // A simpler approach: extract slide thumbnails if available

  const slides: ProcessedSlide[] = []

  // Look for slide images in ppt/media
  const mediaFiles = Object.keys(zip.files).filter(
    name => name.startsWith('ppt/media/') && /\.(png|jpg|jpeg|gif)$/i.test(name)
  ).sort()

  if (mediaFiles.length > 0) {
    // Use media files as slides (common for image-heavy presentations)
    for (let i = 0; i < mediaFiles.length; i++) {
      onProgress?.({
        current: i + 1,
        total: mediaFiles.length,
        message: `Processing image ${i + 1} of ${mediaFiles.length}...`
      })

      const mediaFile = zip.file(mediaFiles[i])
      if (!mediaFile) continue

      const blob = await mediaFile.async('blob')
      const imageDataUrl = await blobToDataUrl(blob)
      const dimensions = await getImageDimensions(imageDataUrl)

      // Create thumbnail
      const thumbnailDataUrl = await createThumbnail(imageDataUrl, 320)

      slides.push({
        index: i,
        imageDataUrl,
        thumbnailDataUrl,
        width: dimensions.width,
        height: dimensions.height
      })
    }
  } else {
    // No embedded images found - show error with suggestion
    throw new Error(
      'PPTX slide rendering requires server-side processing. ' +
      'Please export your PowerPoint as PDF and upload the PDF instead.'
    )
  }

  return slides
}

/**
 * Process uploaded file (auto-detect type)
 */
export async function processSlideFile(
  file: File,
  onProgress?: (progress: ProcessingProgress) => void
): Promise<Slide[]> {
  const extension = file.name.toLowerCase().split('.').pop()

  let processedSlides: ProcessedSlide[]

  if (extension === 'pdf') {
    processedSlides = await processPDF(file, onProgress)
  } else if (extension === 'pptx' || extension === 'ppt') {
    processedSlides = await processPPTX(file, onProgress)
  } else {
    throw new Error(`Unsupported file type: ${extension}`)
  }

  // Convert to Slide format
  return processedSlides.map(ps => ({
    id: crypto.randomUUID(),
    index: ps.index,
    imageUrl: ps.imageDataUrl,
    thumbnailUrl: ps.thumbnailDataUrl,
    width: ps.width,
    height: ps.height,
    caption: '',
    audioGenerated: false,
    audioDuration: null
  }))
}

// Helper functions

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.width, height: img.height })
    img.onerror = reject
    img.src = dataUrl
  })
}

async function createThumbnail(dataUrl: string, maxWidth: number): Promise<string> {
  const img = await loadImage(dataUrl)
  const scale = maxWidth / img.width
  const width = maxWidth
  const height = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, width, height)

  return canvas.toDataURL('image/png', 0.8)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export default {
  processPDF,
  processPPTX,
  processSlideFile
}
