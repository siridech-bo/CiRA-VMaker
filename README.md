# CiRA VMaker - AI Video Generator from Slides

Convert PDF and PowerPoint presentations into narrated videos with AI-powered text-to-speech.

## Features

- **Slide Ingestion**: Upload PDF or PPTX files, automatically converted to high-quality images
- **Caption Management**: Add narration text for each slide with word count and duration estimates
- **AI Voice Generation**: Browser-based TTS using Kokoro (WebGPU/WASM) - no API keys required
- **Video Rendering**: Client-side video generation using Canvas + MediaRecorder
- **Export**: Download final MP4/WebM videos

## Tech Stack

- **Frontend**: Vue 3 + Vite + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **TTS**: Kokoro TTS via Transformers.js (runs in browser)
- **Video**: Canvas API + MediaRecorder

## Prerequisites

- Node.js 18+
- GraphicsMagick and Ghostscript (for PDF conversion)
- LibreOffice (for PowerPoint conversion)

### Installing Dependencies

**Windows:**
```bash
# Install GraphicsMagick
winget install GraphicsMagick.GraphicsMagick

# Install Ghostscript
winget install ArtifexSoftware.GhostScript

# Install LibreOffice
winget install LibreOffice.LibreOffice
```

**macOS:**
```bash
brew install graphicsmagick ghostscript
brew install --cask libreoffice
```

**Ubuntu/Debian:**
```bash
sudo apt-get install graphicsmagick ghostscript libreoffice
```

## Getting Started

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development servers:**
   ```bash
   npm run dev
   ```
   This starts both the frontend (http://localhost:5173) and backend (http://localhost:3000).

3. **Or start individually:**
   ```bash
   npm run dev:client  # Frontend only
   npm run dev:server  # Backend only
   ```

## Usage

1. **Upload**: Drag and drop a PDF or PowerPoint file
2. **Edit**: Add narration text for each slide
3. **Generate Audio**: Click "Generate All Audio" to create voice narration
4. **Export**: Click "Export Video" and download your video

## Project Structure

```
├── client/                 # Vue 3 frontend
│   ├── src/
│   │   ├── components/     # Vue components
│   │   ├── composables/    # Vue composables (useTTS, useVideoRenderer)
│   │   ├── stores/         # Pinia stores
│   │   ├── services/       # API client, IndexedDB storage
│   │   ├── workers/        # TTS Web Worker
│   │   └── views/          # Page components
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── services/       # PDF/PPT conversion
│   │   ├── routes/         # API routes
│   │   └── middleware/     # Express middleware
│   └── package.json
└── package.json           # Root workspace config
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload` | Upload PDF/PPTX file |
| GET | `/api/upload/:id/status` | Get conversion status |
| GET | `/api/slides/:id/image` | Get slide image |
| GET | `/api/slides/:id/thumbnail` | Get slide thumbnail |

## Browser Compatibility

- **Chrome/Edge 113+**: Full WebGPU support for fastest TTS
- **Firefox 114+**: WebGPU support with flags
- **Safari 17+**: Limited WebGPU, falls back to WASM
- **Other browsers**: WASM fallback (slower but works)

## Known Limitations

- PowerPoint conversion requires LibreOffice installed
- Video export creates WebM format (MP4 conversion requires additional processing)
- Large presentations (50+ slides) may require significant memory

## License

MIT
