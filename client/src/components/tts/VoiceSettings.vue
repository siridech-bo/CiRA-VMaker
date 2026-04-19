<script setup lang="ts">
import { ref, computed } from 'vue'
import { useTTSStore } from '@/stores/ttsStore'
import { useProjectStore } from '@/stores/projectStore'
import { useTTS } from '@/composables/useTTS'
import { LANGUAGE_LABELS } from '@/types'
import type { TTSLanguage, AudioProcessingPreset } from '@/types'

const ttsStore = useTTSStore()
const projectStore = useProjectStore()
const { switchLanguage, initTTS } = useTTS()

const showConfirmDialog = ref(false)
const pendingVoiceChange = ref<string | null>(null)
const pendingSpeedChange = ref<number | null>(null)
const pendingLanguageChange = ref<TTSLanguage | null>(null)
const isLoadingNewEngine = ref(false)

const hasGeneratedAudio = computed(() => {
  return projectStore.slides.some(s => s.audioGenerated)
})

const generatedAudioCount = computed(() => {
  return projectStore.slides.filter(s => s.audioGenerated).length
})

const voices = computed(() => ttsStore.availableVoices)

const currentLanguage = computed(() => ttsStore.language)

async function handleLanguageChange(lang: TTSLanguage) {
  if (lang === currentLanguage.value) return

  if (hasGeneratedAudio.value) {
    pendingLanguageChange.value = lang
    pendingVoiceChange.value = null
    pendingSpeedChange.value = null
    showConfirmDialog.value = true
  } else {
    await applyLanguageChange(lang)
  }
}

async function applyLanguageChange(lang: TTSLanguage) {
  isLoadingNewEngine.value = true
  try {
    await switchLanguage(lang)
    // Update project voice settings to clear generated audio
    projectStore.updateVoiceSettings({ language: lang })
    // Initialize the new engine if needed
    if (!ttsStore.isModelReady) {
      await initTTS()
    }
  } finally {
    isLoadingNewEngine.value = false
  }
}

const selectedVoice = computed({
  get: () => ttsStore.selectedVoice,
  set: (value) => {
    if (hasGeneratedAudio.value) {
      pendingVoiceChange.value = value
      pendingSpeedChange.value = null
      showConfirmDialog.value = true
    } else {
      applyVoiceChange(value)
    }
  }
})

const speed = computed({
  get: () => ttsStore.speed,
  set: (value) => {
    if (hasGeneratedAudio.value) {
      pendingSpeedChange.value = value
      pendingVoiceChange.value = null
      showConfirmDialog.value = true
    } else {
      applySpeedChange(value)
    }
  }
})

function applyVoiceChange(value: string) {
  ttsStore.selectVoice(value)
  projectStore.updateVoiceSettings({ voice: value })
}

function applySpeedChange(value: number) {
  ttsStore.setSpeed(value)
  projectStore.updateVoiceSettings({ speed: value })
}

async function confirmChange() {
  if (pendingLanguageChange.value !== null) {
    await applyLanguageChange(pendingLanguageChange.value)
    pendingLanguageChange.value = null
  }
  if (pendingVoiceChange.value !== null) {
    applyVoiceChange(pendingVoiceChange.value)
    pendingVoiceChange.value = null
  }
  if (pendingSpeedChange.value !== null) {
    applySpeedChange(pendingSpeedChange.value)
    pendingSpeedChange.value = null
  }
  if (pendingBlendChange.value !== null) {
    if (pendingBlendChange.value.enabled !== undefined) {
      ttsStore.setBlendEnabled(pendingBlendChange.value.enabled)
    }
    if (pendingBlendChange.value.secondaryVoice !== undefined) {
      ttsStore.setSecondaryVoice(pendingBlendChange.value.secondaryVoice)
    }
    if (pendingBlendChange.value.blendRatio !== undefined) {
      ttsStore.setBlendRatio(pendingBlendChange.value.blendRatio)
    }
    pendingBlendChange.value = null
  }
  if (pendingProcessingChange.value !== null) {
    ttsStore.setAudioProcessingPreset(pendingProcessingChange.value)
    pendingProcessingChange.value = null
  }
  showConfirmDialog.value = false
}

function cancelChange() {
  pendingLanguageChange.value = null
  pendingVoiceChange.value = null
  pendingSpeedChange.value = null
  pendingBlendChange.value = null
  pendingProcessingChange.value = null
  showConfirmDialog.value = false
}

const speedLabel = computed(() => {
  if (speed.value < 0.8) return 'Slow'
  if (speed.value > 1.2) return 'Fast'
  return 'Normal'
})

// Voice blending (only for Kokoro/English)
const showBlendOptions = computed(() => currentLanguage.value === 'en')

const blendEnabled = computed({
  get: () => ttsStore.blendEnabled,
  set: (value) => {
    if (hasGeneratedAudio.value && value !== ttsStore.blendEnabled) {
      pendingBlendChange.value = { enabled: value }
      showConfirmDialog.value = true
    } else {
      ttsStore.setBlendEnabled(value)
    }
  }
})

const secondaryVoice = computed({
  get: () => ttsStore.secondaryVoice,
  set: (value) => {
    if (hasGeneratedAudio.value) {
      pendingBlendChange.value = { secondaryVoice: value }
      showConfirmDialog.value = true
    } else {
      ttsStore.setSecondaryVoice(value)
    }
  }
})

const blendRatio = computed({
  get: () => ttsStore.blendRatio,
  set: (value) => {
    if (hasGeneratedAudio.value) {
      pendingBlendChange.value = { blendRatio: value }
      showConfirmDialog.value = true
    } else {
      ttsStore.setBlendRatio(value)
    }
  }
})

const pendingBlendChange = ref<{ enabled?: boolean; secondaryVoice?: string; blendRatio?: number } | null>(null)

const blendRatioLabel = computed(() => {
  const primary = Math.round((1 - blendRatio.value) * 100)
  const secondary = Math.round(blendRatio.value * 100)
  return `${primary}% / ${secondary}%`
})

// Get voices that can be blended with (exclude currently selected primary voice)
const blendableVoices = computed(() => {
  return voices.value.filter(v => v.id !== selectedVoice.value)
})

// Audio processing presets
const PROCESSING_PRESET_INFO: Record<AudioProcessingPreset, { label: string; description: string }> = {
  none: { label: 'None', description: 'Raw TTS output' },
  natural: { label: 'Natural', description: 'Subtle enhancement' },
  broadcast: { label: 'Broadcast', description: 'Clear & professional' },
  energetic: { label: 'Energetic', description: 'Punchy & dynamic' },
  warm: { label: 'Warm', description: 'Rich & smooth' }
}

const audioProcessingPreset = computed({
  get: () => ttsStore.audioProcessingPreset,
  set: (value: AudioProcessingPreset) => {
    if (hasGeneratedAudio.value) {
      pendingProcessingChange.value = value
      showConfirmDialog.value = true
    } else {
      ttsStore.setAudioProcessingPreset(value)
    }
  }
})

const pendingProcessingChange = ref<AudioProcessingPreset | null>(null)

const deviceTypeLabel = computed(() => {
  switch (ttsStore.deviceType) {
    case 'webgpu': return 'WebGPU'
    case 'wasm': return 'WebAssembly'
    case 'cpu': return 'CPU'
    case 'server': return 'Server (Edge TTS)'
    default: return 'Unknown'
  }
})
</script>

<template>
  <div class="space-y-4">
    <!-- Language Selector -->
    <div>
      <label class="label">Language</label>
      <div class="flex gap-2">
        <button
          v-for="lang in (['en', 'th'] as TTSLanguage[])"
          :key="lang"
          @click="handleLanguageChange(lang)"
          :disabled="isLoadingNewEngine"
          class="flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          :class="[
            currentLanguage === lang
              ? 'bg-primary-600 text-white'
              : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
          ]"
        >
          {{ LANGUAGE_LABELS[lang] }}
        </button>
      </div>
    </div>

    <!-- Loading new engine indicator -->
    <div v-if="isLoadingNewEngine" class="p-3 bg-dark-700 rounded-lg">
      <div class="flex items-center gap-2 text-sm text-dark-300">
        <svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Loading {{ currentLanguage === 'th' ? 'Thai' : 'English' }} TTS engine...</span>
      </div>
    </div>

    <div v-else-if="!ttsStore.isModelReady" class="p-3 bg-dark-700 rounded-lg">
      <div v-if="ttsStore.isModelLoading" class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-dark-300">Loading TTS model...</span>
          <span class="text-primary-400">{{ Math.round(ttsStore.loadProgress * 100) }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-bar-fill"
            :style="{ width: `${ttsStore.loadProgress * 100}%` }"
          />
        </div>
      </div>

      <div v-else-if="ttsStore.error" class="text-sm text-red-400">
        {{ ttsStore.error }}
      </div>

      <div v-else class="text-sm text-dark-400">
        TTS model not loaded
      </div>
    </div>

    <template v-else>
      <div>
        <label class="label">Voice</label>
        <select v-model="selectedVoice" class="input">
          <option v-for="voice in voices" :key="voice.id" :value="voice.id">
            {{ voice.name }} ({{ voice.gender }})
          </option>
        </select>
      </div>

      <div>
        <label class="label">
          Speed: {{ speed.toFixed(1) }}x
          <span class="text-dark-500 ml-1">({{ speedLabel }})</span>
        </label>
        <input
          v-model.number="speed"
          type="range"
          min="0.5"
          max="2"
          step="0.1"
          class="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer"
        />
        <div class="flex justify-between text-xs text-dark-500 mt-1">
          <span>0.5x</span>
          <span>1.0x</span>
          <span>2.0x</span>
        </div>
      </div>

      <!-- Dual Voice (English/Kokoro only) -->
      <div v-if="showBlendOptions" class="space-y-3 pt-2 border-t border-dark-700">
        <div class="flex items-center justify-between">
          <label class="label mb-0">Dual Voice</label>
          <button
            @click="blendEnabled = !blendEnabled"
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
            :class="blendEnabled ? 'bg-primary-600' : 'bg-dark-600'"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
              :class="blendEnabled ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>

        <template v-if="blendEnabled">
          <div>
            <label class="label text-xs">Second Voice</label>
            <select v-model="secondaryVoice" class="input text-sm">
              <option v-for="voice in blendableVoices" :key="voice.id" :value="voice.id">
                {{ voice.name }} ({{ voice.gender }})
              </option>
            </select>
          </div>

          <div class="bg-dark-700/50 rounded-lg p-3 space-y-2">
            <div class="flex items-center gap-2">
              <svg class="w-4 h-4 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span class="text-xs font-medium text-dark-200">How to use</span>
            </div>
            <p class="text-xs text-dark-400 leading-relaxed">
              Use <code class="px-1 py-0.5 bg-dark-600 rounded text-primary-300">[1]</code> and <code class="px-1 py-0.5 bg-dark-600 rounded text-primary-300">[2]</code> markers in your narration to switch speakers:
            </p>
            <div class="text-xs text-dark-500 bg-dark-800 rounded p-2 font-mono">
              <span class="text-primary-400">[1]</span>Hello there!<br/>
              <span class="text-primary-400">[2]</span>How are you?<br/>
              <span class="text-primary-400">[1]</span>I'm doing great!
            </div>
          </div>

          <div class="flex items-center gap-2 text-xs text-dark-400">
            <span class="px-1.5 py-0.5 bg-primary-600/30 rounded text-primary-300">[1]</span>
            <span>{{ ttsStore.currentVoice?.name || 'Primary' }}</span>
            <span class="text-dark-600 mx-1">|</span>
            <span class="px-1.5 py-0.5 bg-primary-600/30 rounded text-primary-300">[2]</span>
            <span>{{ blendableVoices.find(v => v.id === secondaryVoice)?.name || 'Secondary' }}</span>
          </div>
        </template>
      </div>

      <!-- Audio Post-Processing -->
      <div class="space-y-2 pt-2 border-t border-dark-700">
        <label class="label">Audio Enhancement</label>
        <div class="grid grid-cols-5 gap-1">
          <button
            v-for="preset in (['none', 'natural', 'broadcast', 'energetic', 'warm'] as const)"
            :key="preset"
            @click="audioProcessingPreset = preset"
            class="px-2 py-1.5 rounded text-xs font-medium transition-all text-center"
            :class="[
              audioProcessingPreset === preset
                ? 'bg-primary-600 text-white'
                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
            ]"
            :title="PROCESSING_PRESET_INFO[preset].description"
          >
            {{ PROCESSING_PRESET_INFO[preset].label }}
          </button>
        </div>
        <p class="text-xs text-dark-500">
          {{ PROCESSING_PRESET_INFO[audioProcessingPreset].description }}
        </p>
      </div>

      <div class="flex items-center gap-2 text-xs text-dark-400">
        <div
          class="w-2 h-2 rounded-full"
          :class="ttsStore.deviceType === 'webgpu' || ttsStore.deviceType === 'server' ? 'bg-green-500' : 'bg-yellow-500'"
        />
        <span>Running on {{ deviceTypeLabel }}</span>
      </div>
    </template>

    <!-- Confirmation Dialog -->
    <Teleport to="body">
      <div
        v-if="showConfirmDialog"
        class="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
        @click.self="cancelChange"
      >
        <div class="bg-dark-800 rounded-xl p-6 max-w-md mx-4 shadow-2xl border border-dark-600">
          <div class="flex items-start gap-4">
            <div class="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-lg font-semibold text-white">
                Change Voice Settings?
              </h3>
              <p class="text-dark-300 text-sm mt-2">
                You have <span class="text-yellow-400 font-medium">{{ generatedAudioCount }} audio file(s)</span> already generated.
                Changing voice settings will <span class="text-red-400 font-medium">clear all generated audio</span> because the new settings would sound different.
              </p>
              <p class="text-dark-400 text-xs mt-2">
                You'll need to regenerate audio for all slides.
              </p>
            </div>
          </div>

          <div class="flex gap-3 mt-6">
            <button
              class="flex-1 btn bg-dark-600 hover:bg-dark-500 text-dark-200"
              @click="cancelChange"
            >
              Cancel
            </button>
            <button
              class="flex-1 btn bg-yellow-600 hover:bg-yellow-500 text-white"
              @click="confirmChange"
            >
              Change & Clear Audio
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0ea5e9;
  cursor: pointer;
}

input[type="range"]::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #0ea5e9;
  cursor: pointer;
  border: none;
}
</style>
