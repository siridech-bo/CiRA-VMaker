<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useDebounceFn } from '@vueuse/core'

interface Props {
  caption: string
  slideIndex: number
  maxLength?: number
}

const props = withDefaults(defineProps<Props>(), {
  maxLength: 5000
})

const emit = defineEmits<{
  'update:caption': [caption: string]
}>()

const localCaption = ref(props.caption)

const characterCount = computed(() => localCaption.value.length)
const wordCount = computed(() => {
  const trimmed = localCaption.value.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
})
const estimatedDuration = computed(() => {
  const wordsPerMinute = 150
  const minutes = wordCount.value / wordsPerMinute
  return Math.ceil(minutes * 60)
})

const debouncedEmit = useDebounceFn((value: string) => {
  emit('update:caption', value)
}, 300)

watch(() => props.caption, (newCaption) => {
  localCaption.value = newCaption
})

watch(localCaption, (newValue) => {
  debouncedEmit(newValue)
})

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return mins > 0 ? `~${mins}m ${secs}s` : `~${secs}s`
}
</script>

<template>
  <div class="space-y-2">
    <textarea
      v-model="localCaption"
      :maxlength="maxLength"
      :placeholder="`Enter narration for slide ${slideIndex + 1}...`"
      class="textarea h-40 text-sm"
      rows="6"
    />

    <div class="flex items-center justify-between text-xs text-dark-400">
      <div class="flex items-center gap-4">
        <span>{{ wordCount }} words</span>
        <span>{{ characterCount }}/{{ maxLength }}</span>
      </div>
      <span v-if="wordCount > 0" class="text-dark-300">
        {{ formatDuration(estimatedDuration) }}
      </span>
    </div>

    <div v-if="!localCaption.trim()" class="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
      <p class="text-xs text-yellow-400">
        Add narration text to enable audio generation for this slide.
      </p>
    </div>
  </div>
</template>
