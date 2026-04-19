import express from 'express'
import cors from 'cors'
import { config } from './config/index.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'

const app = express()

app.use(cors({
  origin: config.nodeEnv === 'development' ? '*' : false,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api', routes)

app.use(notFoundHandler)
app.use(errorHandler)

const port = config.port

app.listen(port, () => {
  console.log(`
  ╔═══════════════════════════════════════════╗
  ║   CiRA VMaker Server                      ║
  ╠═══════════════════════════════════════════╣
  ║   Server running on port ${port}             ║
  ║   Environment: ${config.nodeEnv.padEnd(18)}  ║
  ║                                           ║
  ║   API: http://localhost:${port}/api          ║
  ║   Note: PDF/PPTX processing is client-side║
  ╚═══════════════════════════════════════════╝
  `)
})

export default app
