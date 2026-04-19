import { Router } from 'express'
import ttsRoutes from './tts.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'Server is running. PDF/PPTX processing happens client-side.'
  })
})

// TTS routes for Thai language support
router.use('/tts', ttsRoutes)

export default router
