<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProjectStore } from '@/stores/projectStore'

const projectStore = useProjectStore()

const showImportDialog = ref(false)
const showFormatHelp = ref(false)
const showPromptDialog = ref(false)
const importError = ref<string | null>(null)
const importPreview = ref<{ slideIndex: number; caption: string }[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const promptLanguage = ref<'en' | 'th'>('en')
const promptCopied = ref(false)

const hasUnsavedCaptions = computed(() => {
  return projectStore.slides.some(s => s.caption.trim().length > 0)
})

const captionCount = computed(() => {
  return projectStore.slides.filter(s => s.caption.trim().length > 0).length
})

function triggerFileInput() {
  fileInputRef.value?.click()
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  if (!file.name.endsWith('.md') && !file.name.endsWith('.txt')) {
    importError.value = 'Please upload a .md or .txt file'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    parseNarrative(content)
    showImportDialog.value = true
  }
  reader.onerror = () => {
    importError.value = 'Failed to read file'
  }
  reader.readAsText(file)

  // Reset input
  input.value = ''
}

function cleanCaption(text: string): string {
  return text
    // Remove markdown headers (## Slide N, ## Slide N — Title, etc.)
    .replace(/^#{1,3}\s*Slide\s*\d+[^\n]*\n?/gmi, '')
    // Remove duration lines (> Duration: 0:26)
    .replace(/^>\s*Duration:[^\n]*\n?/gmi, '')
    // Remove horizontal rules
    .replace(/^---+\s*$/gm, '')
    // Remove "_No narration_" placeholder
    .replace(/^_No narration_\s*$/gmi, '')
    // Trim whitespace
    .trim()
}

function parseNarrative(content: string) {
  importError.value = null
  importPreview.value = []

  const slides = projectStore.slides
  const parsed: { slideIndex: number; caption: string }[] = []

  // Try different parsing strategies

  // Strategy 1: ## Slide N format (with optional title like "## Slide 1 — Title")
  const slideHeaderRegex = /^#{1,2}\s*Slide\s*(\d+)[^\n]*/gmi
  let matches = [...content.matchAll(slideHeaderRegex)]

  if (matches.length > 0) {
    // Parse by slide headers
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i]
      const slideNum = parseInt(match[1], 10)
      const startIndex = match.index! + match[0].length
      const endIndex = matches[i + 1]?.index ?? content.length
      const rawCaption = content.slice(startIndex, endIndex)
      const caption = cleanCaption(rawCaption)

      if (slideNum >= 1 && slideNum <= slides.length && caption) {
        parsed.push({ slideIndex: slideNum - 1, caption })
      }
    }
  } else {
    // Strategy 2: --- delimiter format (like YAML front matter)
    const sections = content.split(/^---+$/gm).filter(s => s.trim())

    if (sections.length > 1) {
      let currentSlide = 0
      for (const section of sections) {
        const slideMatch = section.match(/slide:\s*(\d+)/i)
        if (slideMatch) {
          currentSlide = parseInt(slideMatch[1], 10) - 1
          const caption = cleanCaption(section.replace(/slide:\s*\d+/i, ''))
          if (currentSlide >= 0 && currentSlide < slides.length && caption) {
            parsed.push({ slideIndex: currentSlide, caption })
          }
        } else if (currentSlide >= 0 && currentSlide < slides.length) {
          const caption = cleanCaption(section)
          if (caption) {
            parsed.push({ slideIndex: currentSlide, caption })
            currentSlide++
          }
        }
      }
    } else {
      // Strategy 3: Simple line-by-line or paragraph-by-paragraph
      // Split by double newlines (paragraphs)
      const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim())

      for (let i = 0; i < Math.min(paragraphs.length, slides.length); i++) {
        const caption = cleanCaption(paragraphs[i])
        if (caption) {
          parsed.push({ slideIndex: i, caption })
        }
      }
    }
  }

  if (parsed.length === 0) {
    importError.value = 'Could not parse any narration from the file. Check the format help for supported formats.'
  } else {
    importPreview.value = parsed
  }
}

function applyImport() {
  for (const item of importPreview.value) {
    const slide = projectStore.slides[item.slideIndex]
    if (slide) {
      projectStore.updateCaption(slide.id, item.caption)
    }
  }
  showImportDialog.value = false
  importPreview.value = []
}

function cancelImport() {
  showImportDialog.value = false
  importPreview.value = []
  importError.value = null
}

function exportNarrative() {
  const slides = projectStore.slides
  const projectName = projectStore.project?.name || 'presentation'

  let content = `# ${projectName} - Narration Script\n\n`
  content += `Generated: ${new Date().toLocaleString()}\n\n`
  content += `---\n\n`

  for (const slide of slides) {
    content += `## Slide ${slide.index + 1}\n\n`
    content += slide.caption || '_No narration_'
    content += '\n\n'

    if (slide.audioDuration) {
      content += `> Duration: ${formatDuration(slide.audioDuration)}\n\n`
    }

    content += '---\n\n'
  }

  // Add summary
  const totalDuration = slides.reduce((sum, s) => sum + (s.audioDuration || 0), 0)
  const completedSlides = slides.filter(s => s.caption.trim()).length

  content += `## Summary\n\n`
  content += `- Total Slides: ${slides.length}\n`
  content += `- Slides with Narration: ${completedSlides}\n`
  content += `- Total Duration: ${formatDuration(totalDuration)}\n`

  // Download
  const blob = new Blob([content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${projectName.replace(/\s+/g, '-').toLowerCase()}-narration.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Generate AI prompt for narrative generation
const generatedPrompt = computed(() => {
  const slides = projectStore.slides
  const lang = promptLanguage.value

  if (lang === 'th') {
    return generateThaiPrompt(slides)
  } else {
    return generateEnglishPrompt(slides)
  }
})

function generateThaiPrompt(slides: typeof projectStore.slides) {
  let prompt = `# AI Video Narration Generator

## Task
Generate professional narration text for a presentation video.
Generate narration in **Thai language** (ภาษาไทย).

---

## Pointer Marker Syntax
Include pointer markers to indicate where an animated pointer should appear on screen.
Place markers on their **own line**, BEFORE the sentence that discusses that area.

**Syntax:**
- \`{@x,y:circle}\` — Draw attention to a specific element หรือพื้นที่สำคัญ
- \`{@x,y:arrow}\` — Point directionally at a label, component, or flow direction
- \`{@hide}\` — Hide the pointer when no specific area is being referenced

> ⚠️ **ห้ามใช้ \`spotlight\`** เด็ดขาด เพราะทำให้จอมืดเกินไปเวลา render เป็นวิดีโอ ให้ใช้ \`circle\` แทนในทุกกรณี

**Coordinates:** x,y are percentages (0–100), where 0,0 is top-left and 100,100 is bottom-right.

**Example:**
\`\`\`
{@75,20:circle} นี่คือส่วนประกอบหลักของระบบ — สังเกตดูให้ดี!

{@30,55:circle} จุดนี้สำคัญมาก — อย่าพลาดเด็ดขาด!

{@hide} ก่อนจะไปต่อ ขอทำความเข้าใจพื้นฐานก่อนสักนิด...
\`\`\`

---

## Output Format

For each slide, output using this exact format — with a **blank line between each pointer block** for readability:

\`\`\`
## Slide N

{@x,y:style} ประโยคแรกที่อธิบายพื้นที่นั้น

{@x,y:style} ประโยคถัดไปสำหรับพื้นที่อื่น

{@hide} ส่วนที่ไม่ต้องชี้จุดเฉพาะ
\`\`\`

---

## Language Guidelines

### Thai Transliteration of English Technical Terms
เขียนทับศัพท์ภาษาอังกฤษด้วยอักษรไทย เพื่อให้ TTS ออกเสียงได้ถูกต้อง ใช้เครื่องหมายยัติภังค์ (-) เชื่อมคำที่เป็นชื่อเฉพาะหรือคำประสม

| อังกฤษ | ทับศัพท์ไทยที่ถูกต้อง |
|---|---|
| Surface Code | ซอฟต์แฟซ-โค้ด |
| Shor's Algorithm | ชอร์ส-อัลกอริทึม |
| Fault-Tolerance | ฟอลต์-โทเลอแรนซ์ |
| QLDPC | คิวแอลดีพีซี |
| Neutral-Atom | นิวทรัล-แอตอม |
| Optical Tweezers | ออปติคัล-ทวีเซอร์ |
| Cryo-CMOS | ไครโอ-ซีมอส |
| Quantum Dot | ควอนตัมดอต |
| Spin Qubit | สปินคิวบิต |
| Heterostructure | เฮเทอโรสตรักเชอร์ |
| Entanglement Zone | เอนแทงเกิลเมนต์-โซน |
| Storage Zone | สตอเรจ-โซน |
| Through-Silicon Via (TSV) | ทรู-ซิลิกอน-เวีย |

สำหรับคำย่อ เช่น CMOS, RSA, SET — ให้สะกดออกมาเป็นพยัญชนะไทยตัวต่อตัว เช่น ซี-มอส, อาร์-เอส-เอ, เอส-อี-ที

---

## Voice & Energy Guidelines (สำคัญมากสำหรับ TTS)

เครื่อง TTS ตีความเครื่องหมายวรรคตอนเพื่อสร้างอารมณ์ในเสียง เขียนบทพูดให้มีพลังงาน สนุก และน่าติดตาม ตามแนวทางต่อไปนี้:

### ใช้เครื่องหมายวรรคตอนเพื่อสร้างอารมณ์
- \`!\` สำหรับความตื่นเต้น → "นี่แหละคือคำตอบ!" / "เจ๋งมากเลย!"
- \`?\` สำหรับการดึงดูดความสนใจ → "แต่มันทำงานยังไงล่ะ?" / "พร้อมดูต่อไหม?"
- \`...\` สำหรับการหยุดเพื่อสร้างความตื่นเต้น → "และผลลัพธ์ที่ได้คือ... น่าทึ่งมาก!"
- \`—\` สำหรับการเน้นย้ำ → "สิ่งนี้ — สิ่งที่สำคัญที่สุด — เปลี่ยนทุกอย่างไปเลย"

### สร้างพลังงานในการเล่าเรื่อง
- เปิดแต่ละสไลด์ด้วยความตื่นเต้น → "โอเค! มาดูส่วนที่น่าสนใจที่สุดกัน!"
- พูดตรงกับผู้ชม → "สังเกตดูนะ..." / "ส่วนนี้ต้องชอบแน่เลย"
- สร้างความคาดหวัง → "รอดูสิ่งที่จะเกิดขึ้น..." / "เตรียมพร้อมได้เลย!"
- ฉลองการค้นพบ → "ใช่แล้ว!" / "เยี่ยมมาก!" / "เจ๋งสุด ๆ!"

### จังหวะและความยาวประโยค
- สลับระหว่าง ประโยคสั้นกระชับ กับ คำอธิบายที่ยาวกว่า เพื่อให้มีจังหวะที่น่าฟัง
- ใช้คำถามเชิงวาทศิลป์ → "ฟังดูคุ้น ๆ ไหม?" / "สมเหตุสมผลใช่ไหม?"
- ใช้ประโยคเชื่อมที่สร้างโมเมนตัม → "แต่นั่นยังไม่ใช่ทั้งหมด..." / "และนี่คือส่วนที่ดีที่สุด..."

### ตัวอย่าง: เปรียบเทียบแบบแบนกับแบบมีพลัง

❌ **แบบแบน:**
"สไลด์นี้แสดงคุณสมบัติหลัก คุณสมบัติแรกมีความสำคัญมาก"

✅ **แบบมีพลัง:**
\`\`\`
{@75,25:circle} ดูนี่สิ! นี่คือคุณสมบัติหลักทั้งหมด — และเชื่อเลย คุณสมบัติแรกนี่?

{@75,35:circle} มันเปลี่ยนเกมไปเลยครับ!
\`\`\`

---

## Structure Guidelines

### ความยาวต่อสไลด์
- สั้น: 30–45 วินาที → สำหรับสไลด์แนะนำหรือสรุป
- ปกติ: 45–90 วินาที → สำหรับสไลด์เนื้อหาหลัก
- ยาว: 90–120 วินาที → สำหรับสไลด์ที่มีหลายองค์ประกอบซับซ้อน

### เมื่อไหร่ควรใช้ \`circle\` และ \`arrow\`
- ใช้ \`circle\` — เพื่อวงล้อมรอบองค์ประกอบ, ไฮไลต์จุดสำคัญ, หรือชี้พื้นที่กว้าง ๆ
- ใช้ \`arrow\` — เพื่อชี้ทิศทางตามลำดับขั้นตอน, เส้นทางการไหล, หรือป้ายกำกับที่เชื่อมโยงกัน
- ใช้ \`{@hide}\` — เมื่ออธิบายแนวคิดที่ไม่เกี่ยวกับพื้นที่เฉพาะบนสไลด์

### จำนวน Pointer ต่อสไลด์
- ขั้นต่ำ 3 จุด ต่อสไลด์
- สูงสุด 6–7 จุด สำหรับสไลด์ที่มีองค์ประกอบหลายชิ้น

### ลำดับการชี้จุด
ชี้จุดตามลำดับที่สมเหตุสมผลทางสายตา เช่น:
- บนลงล่าง สำหรับแผนภาพสแตกชั้น
- ซ้ายไปขวา สำหรับกระบวนการหรือไทม์ไลน์
- ศูนย์กลางออกนอก สำหรับแผนภาพรัศมี
- ตามลำดับของตาราง แถวต่อแถว

---

## Slide-Opening Phrase Bank (วลีเปิดสไลด์)
หมุนเวียนใช้วลีเปิดสไลด์ต่อไปนี้เพื่อไม่ให้ซ้ำซาก:

- "โอเค! มาดูกันต่อเลย..."
- "เยี่ยมมาก! ต่อไป..."
- "ว้าว! นี่คือส่วนที่น่าตื่นเต้นที่สุด..."
- "ตอนนี้มาถึงส่วนสำคัญแล้ว..."
- "และนี่แหละคือจุดพลิกเกม..."
- "รอแล้วรอเล่า — นี่คือสิ่งที่ทุกคนรอ!"
- "มาดูกันว่า..."
- "ถึงเวลาแล้ว..."
- "เตรียมพร้อมได้เลย เพราะ..."
- "นี่คือสไลด์ที่ชอบที่สุด..."

---

## Output Example (ตัวอย่างผลลัพธ์ที่ถูกต้อง)

\`\`\`
## Slide 3

{@50,15:circle} โอเค! ก่อนจะสร้างคิวบิตได้ ต้องเลือกวัสดุที่ใช่ก่อน — และนี่คือการแข่งขันสามทางที่ดุเดือดมาก!

{@20,55:circle} ผู้แข่งขันคนแรกทางซ้าย — แกลเลียมอาร์เซไนด์ หรือ GaAs! ดูดีนะ แต่ภายในนั้นวุ่นวายสุด ๆ — ทุกอะตอมมีสปินนิวเคลียส ทำให้เกิดสัญญาณรบกวนแม่เหล็กตลอดเวลา ตกรอบเลย!

{@50,55:circle} ผู้แข่งขันคนที่สอง — ซิลิกอนธรรมชาติ ดีกว่ามาก แต่มีซิลิกอน-29 อยู่ถึง 4.7 เปอร์เซ็นต์...

{@80,45:circle} และแชมเปี้ยนที่ชนะตั้งแต่ต้น — ซิลิกอน-28 เสริมสมบัติ! สปินนิวเคลียสเป็นศูนย์ เงียบสงบทางแม่เหล็กอย่างสมบูรณ์แบบ! นี่แหละคือวัสดุที่ถูกต้อง!
\`\`\`

---

## Slides to Generate

`

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    prompt += `### Slide ${i + 1}\n`
    prompt += `- Image: [Slide ${i + 1} of the presentation]\n`
    if (slide.caption.trim()) {
      prompt += `- Current caption: "${slide.caption.slice(0, 100)}${slide.caption.length > 100 ? '...' : ''}"\n`
    }
    prompt += `\n`
  }

  prompt += `---

Now generate engaging, energetic Thai narration for all ${slides.length} slides following the guidelines above.`

  return prompt
}

function generateEnglishPrompt(slides: typeof projectStore.slides) {
  let prompt = `# AI Video Narration Generator

## Task
Generate professional narration text for a presentation video with ${slides.length} slides.
Generate narration in **English**.

## Pointer Marker Syntax
Include pointer markers to indicate where an animated pointer should appear on screen.
Place markers on their **own line**, BEFORE the sentence that discusses that area.

**Syntax:**
- \`{@x,y:circle}\` — Draw attention to a specific element or important area
- \`{@x,y:arrow}\` — Point directionally at a label, component, or flow direction
- \`{@hide}\` — Hide the pointer when no specific area is being referenced

> ⚠️ **Do NOT use \`spotlight\`** — it makes the screen too dark when rendering to video. Use \`circle\` instead in all cases.

**Coordinates:** x,y are percentages (0–100), where 0,0 is top-left and 100,100 is bottom-right.

**Example:**
\`\`\`
{@75,20:circle} This is the main component of the system — pay close attention!

{@30,55:circle} This point is crucial — don't miss it!

{@hide} Before we continue, let me explain the underlying concept...
\`\`\`

---

## Output Format

For each slide, output using this exact format — with a **blank line between each pointer block** for readability:

\`\`\`
## Slide N

{@x,y:style} First sentence explaining that area

{@x,y:style} Next sentence for another area

{@hide} Part that doesn't reference a specific area
\`\`\`

---

## Voice & Energy Guidelines (IMPORTANT for TTS)

The TTS engine interprets punctuation to create emotion. Write narration that sounds **energetic, engaging, and fun**:

### Use Punctuation for Emotion
- \`!\` for excitement → "This is the answer!" / "How cool is that!"
- \`?\` for engagement → "But how does it work?" / "Ready for more?"
- \`...\` for dramatic pauses → "And the result is... incredible!"
- \`—\` for emphasis → "This — the most important part — changes everything."

### Build Energy in Storytelling
- Open each slide with excitement → "Okay! Let's look at the most interesting part!"
- Speak directly to the audience → "Notice this..." / "You'll love this part"
- Build anticipation → "Wait until you see..." / "Get ready!"
- Celebrate discoveries → "That's right!" / "Excellent!" / "So cool!"

### Rhythm and Sentence Length
- Alternate between short punchy sentences and longer explanations
- Use rhetorical questions → "Sound familiar?" / "Makes sense, right?"
- Use momentum-building transitions → "But that's not all..." / "Here's the best part..."

### Example: Flat vs Energetic

❌ **Flat:**
"This slide shows the main features. The first feature is important."

✅ **Energetic:**
\`\`\`
{@75,25:circle} Look at this! These are all the main features — and trust me, the first one?

{@75,35:circle} It's a total game-changer!
\`\`\`

---

## Structure Guidelines

### Duration per Slide
- Short: 30–45 seconds → for intro or summary slides
- Normal: 45–90 seconds → for main content slides
- Long: 90–120 seconds → for slides with multiple complex elements

### When to use \`circle\` and \`arrow\`
- Use \`circle\` — to encircle elements, highlight key points, or indicate broad areas
- Use \`arrow\` — to point directionally for sequences, flow paths, or connected labels
- Use \`{@hide}\` — when explaining concepts not tied to a specific area on the slide

### Pointer Count per Slide
- Minimum 3 points per slide
- Maximum 6–7 points for slides with many elements

---

## Slides to Generate

`

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i]
    prompt += `### Slide ${i + 1}\n`
    prompt += `- Image: [Slide ${i + 1} of the presentation]\n`
    if (slide.caption.trim()) {
      prompt += `- Current caption: "${slide.caption.slice(0, 100)}${slide.caption.length > 100 ? '...' : ''}"\n`
    }
    prompt += `\n`
  }

  prompt += `---

Now generate engaging, energetic English narration for all ${slides.length} slides following the guidelines above.`

  return prompt
}

async function copyPromptToClipboard() {
  try {
    await navigator.clipboard.writeText(generatedPrompt.value)
    promptCopied.value = true
    setTimeout(() => {
      promptCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}

function openPromptDialog() {
  showPromptDialog.value = true
  promptCopied.value = false
}

function closePromptDialog() {
  showPromptDialog.value = false
}
</script>

<template>
  <div class="flex gap-2">
    <input
      ref="fileInputRef"
      type="file"
      accept=".md,.txt"
      class="hidden"
      @change="handleFileSelect"
    />

    <button
      class="btn btn-ghost text-xs flex items-center gap-1.5"
      title="Generate AI prompt for narrative"
      @click="openPromptDialog"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      AI Prompt
    </button>

    <button
      class="btn btn-ghost text-xs flex items-center gap-1.5"
      title="Import narration from .md file"
      @click="triggerFileInput"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
      </svg>
      Import
    </button>

    <button
      class="btn btn-ghost text-xs flex items-center gap-1.5"
      title="Export narration as .md file"
      @click="exportNarrative"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Export
    </button>
  </div>

  <!-- Import Preview Dialog -->
  <Teleport to="body">
    <div
      v-if="showImportDialog"
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      @click.self="cancelImport"
    >
      <div class="bg-dark-800 rounded-xl max-w-2xl w-full max-h-[80vh] flex flex-col shadow-2xl border border-dark-600">
        <div class="p-4 border-b border-dark-700 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">Import Narration</h3>
            <p class="text-sm text-dark-400 mt-1">
              Preview and confirm the imported narration
            </p>
          </div>
          <button
            class="text-dark-400 hover:text-white"
            @click="showFormatHelp = !showFormatHelp"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        <!-- Format Help -->
        <div v-if="showFormatHelp" class="p-4 bg-dark-700/50 border-b border-dark-700">
          <h4 class="text-sm font-medium text-dark-200 mb-2">Supported Formats:</h4>
          <div class="text-xs text-dark-400 space-y-2">
            <div>
              <p class="font-medium text-dark-300">Format 1: Slide Headers</p>
              <pre class="bg-dark-800 p-2 rounded mt-1 overflow-x-auto">## Slide 1
Your narration text here...

## Slide 2
Another narration...</pre>
            </div>
            <div>
              <p class="font-medium text-dark-300">Format 2: Paragraphs (one per slide)</p>
              <pre class="bg-dark-800 p-2 rounded mt-1 overflow-x-auto">First slide narration goes here.

Second slide narration goes here.

Third slide narration...</pre>
            </div>
          </div>
        </div>

        <!-- Error -->
        <div v-if="importError" class="p-4 bg-red-500/10 border-b border-red-500/30">
          <p class="text-sm text-red-400">{{ importError }}</p>
        </div>

        <!-- Preview List -->
        <div class="flex-1 overflow-y-auto p-4">
          <div v-if="importPreview.length > 0" class="space-y-3">
            <div v-if="hasUnsavedCaptions" class="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p class="text-sm text-yellow-400">
                This will replace {{ captionCount }} existing caption(s).
              </p>
            </div>

            <div
              v-for="item in importPreview"
              :key="item.slideIndex"
              class="p-3 bg-dark-700/50 rounded-lg"
            >
              <div class="flex items-center gap-2 mb-2">
                <span class="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded">
                  Slide {{ item.slideIndex + 1 }}
                </span>
              </div>
              <p class="text-sm text-dark-200 whitespace-pre-wrap line-clamp-3">
                {{ item.caption }}
              </p>
            </div>
          </div>

          <div v-else-if="!importError" class="text-center text-dark-400 py-8">
            No narration parsed from file
          </div>
        </div>

        <!-- Actions -->
        <div class="p-4 border-t border-dark-700 flex gap-3">
          <button
            class="flex-1 btn bg-dark-600 hover:bg-dark-500 text-dark-200"
            @click="cancelImport"
          >
            Cancel
          </button>
          <button
            class="flex-1 btn btn-primary"
            :disabled="importPreview.length === 0"
            @click="applyImport"
          >
            Apply to {{ importPreview.length }} Slide(s)
          </button>
        </div>
      </div>
    </div>

    <!-- AI Prompt Dialog -->
    <div
      v-if="showPromptDialog"
      class="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      @click.self="closePromptDialog"
    >
      <div class="bg-dark-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-dark-600">
        <div class="p-4 border-b border-dark-700 flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold text-white">AI Narrative Prompt</h3>
            <p class="text-sm text-dark-400 mt-1">
              Copy this prompt to your AI assistant (Claude, ChatGPT, etc.)
            </p>
          </div>
          <button
            class="text-dark-400 hover:text-white"
            @click="closePromptDialog"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Language Selection -->
        <div class="p-4 border-b border-dark-700 flex items-center gap-4">
          <span class="text-sm text-dark-300">Language:</span>
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-sm rounded-lg transition-colors"
              :class="promptLanguage === 'en'
                ? 'bg-primary-500 text-white'
                : 'bg-dark-600 text-dark-300 hover:bg-dark-500'"
              @click="promptLanguage = 'en'"
            >
              English
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-lg transition-colors"
              :class="promptLanguage === 'th'
                ? 'bg-primary-500 text-white'
                : 'bg-dark-600 text-dark-300 hover:bg-dark-500'"
              @click="promptLanguage = 'th'"
            >
              ภาษาไทย
            </button>
          </div>
        </div>

        <!-- Prompt Content -->
        <div class="flex-1 overflow-y-auto p-4">
          <pre class="text-sm text-dark-200 whitespace-pre-wrap font-mono bg-dark-900 p-4 rounded-lg border border-dark-600 max-h-[50vh] overflow-y-auto">{{ generatedPrompt }}</pre>
        </div>

        <!-- Pointer Syntax Help -->
        <div class="p-4 border-t border-dark-700 bg-dark-700/30">
          <details class="text-sm">
            <summary class="text-dark-300 cursor-pointer hover:text-white">
              Pointer Syntax Reference
            </summary>
            <div class="mt-3 text-dark-400 space-y-2">
              <p><code class="bg-dark-800 px-1.5 py-0.5 rounded">{@50,30:circle}</code> - Circle highlight (recommended)</p>
              <p><code class="bg-dark-800 px-1.5 py-0.5 rounded">{@50,30:arrow}</code> - Arrow pointer for direction/flow</p>
              <p><code class="bg-dark-800 px-1.5 py-0.5 rounded">{@hide}</code> - Hide pointer</p>
              <p class="text-yellow-500/80 text-xs mt-2">⚠️ Don't use spotlight - it makes video too dark</p>
            </div>
          </details>
        </div>

        <!-- Actions -->
        <div class="p-4 border-t border-dark-700 flex gap-3">
          <button
            class="flex-1 btn bg-dark-600 hover:bg-dark-500 text-dark-200"
            @click="closePromptDialog"
          >
            Close
          </button>
          <button
            class="flex-1 btn btn-primary flex items-center justify-center gap-2"
            @click="copyPromptToClipboard"
          >
            <svg v-if="!promptCopied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
            </svg>
            <svg v-else class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            {{ promptCopied ? 'Copied!' : 'Copy to Clipboard' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
