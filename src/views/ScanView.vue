<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { parseAssetPhoto } from '@/lib/parseAssetPhoto'
import { lookupAssetByText } from '@/lib/lookupAssetByText'
import { saveAsset } from '@/lib/saveAsset'
import { compressImage } from '@/lib/compressImage'
import { fetchEmployees, type Employee } from '@/lib/fetchEmployees'
import { fetchInventory } from '@/lib/fetchInventory'
import type { Asset } from '@/types/asset'
import { CONDITIONS } from '@/types/asset'
import dayjs from 'dayjs'

const router = useRouter()
const route = useRoute()

type ViewState = 'idle' | 'camera' | 'lookup' | 'scanning' | 'form' | 'submitting' | 'success'
const state = ref<ViewState>('idle')
const scanMode = ref<'image' | 'text'>('image')
const previewUrl = ref<string | null>(null)
const errorMsg = ref('')
const validationErrors = reactive<Record<string, string>>({})
const editLoading = ref(false)

const isEditMode = computed(() => route.name === 'edit' && !!route.params.id)
const editingId = ref<string | null>(null)
const originalCreatedAt = ref<string | null>(null)

const form = reactive({
  category: 'laptop',
  assetName: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  cpu: '',
  ramGb: '',
  diskGb: '',
  modelYear: '',
  purchasePrice: '',
  purchaseCurrency: 'AED',
  purchaseDate: '',
  condition: 'good',
  assignedTo: '',
  status: 'in_use',
  notes: '',
})

// --- Employees ---
const employees = ref<Employee[]>([])
const assigneeSearch = ref('')
const assigneeDropdownOpen = ref(false)

onMounted(async () => {
  employees.value = await fetchEmployees()

  if (isEditMode.value) {
    editLoading.value = true
    try {
      const inventory = await fetchInventory()
      const assetId = String(route.params.id)
      const existing = inventory.find((a) => a.id === assetId)
      if (existing) {
        editingId.value = existing.id
        originalCreatedAt.value = existing.createdAt
        Object.entries(existing).forEach(([key, value]) => {
          if (key in form) {
            ;(form as Record<string, string>)[key] = value
          }
        })
        assigneeSearch.value = form.assignedTo
        state.value = 'form'
      } else {
        errorMsg.value = 'Asset not found'
      }
    } catch (err: unknown) {
      errorMsg.value = err instanceof Error ? err.message : 'Failed to load asset'
    } finally {
      editLoading.value = false
    }
  }
})

const filteredEmployees = computed(() => {
  const q = assigneeSearch.value.toLowerCase().trim()
  if (!q) return employees.value
  return employees.value.filter(
    (e) => e.name.toLowerCase().includes(q) || e.department.toLowerCase().includes(q),
  )
})

function selectEmployee(name: string) {
  form.assignedTo = name
  assigneeSearch.value = name
  assigneeDropdownOpen.value = false
  if (name) {
    if (form.status !== 'retired') form.status = 'in_use'
  }
  clearValidation('assignedTo')
}

function selectUnassigned() {
  form.assignedTo = ''
  assigneeSearch.value = ''
  assigneeDropdownOpen.value = false
  if (form.status !== 'retired') form.status = 'spare'
  clearValidation('assignedTo')
}

function onAssigneeBlur() {
  setTimeout(() => { assigneeDropdownOpen.value = false }, 200)
}

// Auto-couple status ↔ assignedTo
watch(() => form.status, (newStatus) => {
  if (newStatus === 'in_use' && !form.assignedTo) {
    // keep — will validate on submit
  } else if (newStatus === 'spare') {
    form.assignedTo = ''
    assigneeSearch.value = ''
  }
})

function clearValidation(field: string) {
  delete validationErrors[field]
}

function validate(): boolean {
  Object.keys(validationErrors).forEach((k) => delete validationErrors[k])

  if (form.status === 'in_use' && !form.assignedTo) {
    validationErrors.assignedTo = 'Required when status is "In Use"'
  }

  return Object.keys(validationErrors).length === 0
}

// --- Camera / Upload ---
const uploadInput = ref<HTMLInputElement | null>(null)
const videoEl = ref<HTMLVideoElement | null>(null)
let mediaStream: MediaStream | null = null

const lookupQuery = ref('')

function openUpload() { uploadInput.value?.click() }
function openLookup() { state.value = 'lookup'; lookupQuery.value = '' }

async function handleLookup() {
  const q = lookupQuery.value.trim()
  if (!q) return

  scanMode.value = 'text'
  state.value = 'scanning'
  errorMsg.value = ''
  previewUrl.value = null

  try {
    const result = await lookupAssetByText(q)
    mergeResult(result)
    state.value = 'form'
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to look up device'
    state.value = 'lookup'
  }
}

async function openCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    })
    mediaStream = stream
    state.value = 'camera'
    await new Promise(requestAnimationFrame)
    if (videoEl.value) {
      videoEl.value.srcObject = stream
      videoEl.value.play()
    }
  } catch {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.capture = 'environment'
    input.onchange = (e) => handleFile(e)
    input.click()
  }
}

function captureFrame() {
  if (!videoEl.value) return
  const video = videoEl.value
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(video, 0, 0)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

  stopCamera()
  processDataUrl(dataUrl)
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop())
    mediaStream = null
  }
  if (state.value === 'camera') state.value = 'idle'
}

onBeforeUnmount(() => stopCamera())

function enterManual() {
  state.value = 'form'
  previewUrl.value = null
}

function mergeResult(result: object) {
  Object.entries(result).forEach(([key, value]) => {
    if (value && key in form && key !== 'purchaseCurrency') {
      ;(form as Record<string, string>)[key] = String(value)
    }
  })
  assigneeSearch.value = form.assignedTo
}

async function processDataUrl(dataUrl: string) {
  scanMode.value = 'image'
  state.value = 'scanning'
  errorMsg.value = ''
  previewUrl.value = dataUrl

  try {
    const result = await parseAssetPhoto(dataUrl)
    mergeResult(result)
    state.value = 'form'
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to analyze image'
    state.value = 'idle'
  }
}

async function handleFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  try {
    const dataUrl = await compressImage(file)
    await processDataUrl(dataUrl)
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to analyze image'
    state.value = 'idle'
  }

  input.value = ''
}

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

async function handleSubmit() {
  if (!validate()) return

  state.value = 'submitting'
  errorMsg.value = ''

  try {
    const now = dayjs().toISOString()
    const payload: Asset = {
      ...form,
      purchaseCurrency: 'AED',
      id: editingId.value || generateId(),
      createdAt: originalCreatedAt.value || now,
      updatedAt: now,
    }
    await saveAsset(payload)
    state.value = 'success'
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to save asset'
    state.value = 'form'
  }
}

function resetForm() {
  stopCamera()
  previewUrl.value = null
  errorMsg.value = ''
  assigneeSearch.value = ''
  assigneeDropdownOpen.value = false
  editingId.value = null
  originalCreatedAt.value = null
  Object.keys(validationErrors).forEach((k) => delete validationErrors[k])
  Object.assign(form, {
    category: 'laptop', assetName: '', manufacturer: '', model: '',
    serialNumber: '', cpu: '', ramGb: '', diskGb: '', modelYear: '',
    purchasePrice: '', purchaseCurrency: 'AED', purchaseDate: '',
    condition: 'good', assignedTo: '', status: 'in_use', notes: '',
  })
  if (isEditMode.value) {
    router.push('/')
  } else {
    state.value = 'idle'
  }
}

function conditionLabel(c: string) {
  return c.charAt(0).toUpperCase() + c.slice(1)
}
</script>

<template>
  <!-- Hidden file input for upload only -->
  <input ref="uploadInput" type="file" accept="image/*" class="hidden" @change="handleFile" />

  <!-- ==================== LIVE CAMERA OVERLAY ==================== -->
  <div v-if="state === 'camera'" class="fixed inset-0 z-[100] bg-black flex flex-col">
    <div class="flex items-center justify-between px-4 py-3 bg-black/80">
      <button class="text-white active:scale-95 transition-transform" @click="stopCamera">
        <span class="material-symbols-outlined">close</span>
      </button>
      <span class="text-white text-sm font-semibold font-headline">Point at serial tag or label</span>
      <div class="w-10"></div>
    </div>
    <div class="flex-1 flex items-center justify-center overflow-hidden relative">
      <video ref="videoEl" autoplay playsinline muted class="w-full h-full object-cover"></video>
      <!-- Viewfinder overlay -->
      <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div class="w-72 h-44 border-2 border-white/50 rounded-2xl"></div>
      </div>
    </div>
    <div class="flex items-center justify-center py-6 bg-black/80">
      <button
        class="w-16 h-16 rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform shadow-lg ring-4 ring-white/30"
        @click="captureFrame"
      >
        <span class="material-symbols-outlined text-primary !text-3xl">photo_camera</span>
      </button>
    </div>
  </div>

  <!-- Header -->
  <header class="sticky top-0 z-50 bg-surface flex justify-between items-center w-full px-6 py-4">
    <div class="flex items-center gap-4">
      <button v-if="state !== 'idle' || isEditMode" class="text-primary active:scale-95 transition-transform" @click="isEditMode ? router.push('/inventory') : resetForm()">
        <span class="material-symbols-outlined">arrow_back</span>
      </button>
      <h1 class="text-xl font-bold text-primary font-headline tracking-tight">
        {{ state === 'success' ? (isEditMode ? 'Updated!' : 'Saved!') : (isEditMode ? 'Edit Asset' : 'Asset Entry') }}
      </h1>
    </div>
    <router-link to="/inventory" class="hidden md:flex items-center gap-2 text-sm font-semibold text-secondary hover:text-primary transition-colors">
      <span class="material-symbols-outlined text-lg">inventory_2</span>
      View Inventory
    </router-link>
  </header>

  <main class="max-w-2xl mx-auto px-5 pt-4 space-y-8">
    <!-- Error Banner -->
    <div v-if="errorMsg" class="bg-error-container text-on-error-container rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-3">
      <span class="material-symbols-outlined text-error">error</span>
      {{ errorMsg }}
      <button class="ml-auto text-error hover:underline text-xs" @click="errorMsg = ''">Dismiss</button>
    </div>

    <!-- ==================== EDIT LOADING STATE ==================== -->
    <template v-if="editLoading">
      <section class="flex flex-col items-center justify-center py-16 space-y-6">
        <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <span class="material-symbols-outlined text-primary !text-4xl">edit_note</span>
        </div>
        <div class="text-center">
          <h2 class="font-headline font-bold text-lg text-on-surface">Loading asset...</h2>
          <p class="text-on-surface-variant text-sm mt-1">Fetching details from inventory</p>
        </div>
      </section>
    </template>

    <!-- ==================== IDLE STATE ==================== -->
    <template v-if="state === 'idle' && !isEditMode && !editLoading">
      <section class="relative group">
        <div class="bg-surface-container-low rounded-xl p-6 border-2 border-dashed border-outline-variant/30 flex flex-col items-center justify-center text-center space-y-4 overflow-hidden relative">
          <div class="absolute -top-12 -right-12 w-32 h-32 bg-secondary-container/10 rounded-full blur-3xl"></div>
          <div class="absolute -bottom-8 -left-8 w-24 h-24 bg-primary/5 rounded-full blur-2xl"></div>
          <div class="w-16 h-16 bg-white shadow-xl rounded-2xl flex items-center justify-center text-primary mb-2 transition-transform group-hover:scale-110">
            <span class="material-symbols-outlined !text-4xl">center_focus_strong</span>
          </div>
          <div>
            <h2 class="font-headline font-bold text-lg text-on-surface tracking-tight">AI Spec Scanner</h2>
            <p class="text-on-surface-variant text-sm mt-1 px-4">Snap a photo of the serial tag or retail box to auto-populate hardware details.</p>
          </div>
          <div class="flex gap-3 w-full pt-2">
            <button
              class="flex-1 bg-white border border-outline-variant/20 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-secondary hover:bg-surface transition-colors shadow-sm active:scale-95"
              @click="openCamera"
            >
              <span class="material-symbols-outlined text-[20px]">photo_camera</span>
              Scan Tag
            </button>
            <button
              class="flex-1 bg-white border border-outline-variant/20 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-semibold text-secondary hover:bg-surface transition-colors shadow-sm active:scale-95"
              @click="openUpload"
            >
              <span class="material-symbols-outlined text-[20px]">upload_file</span>
              Upload
            </button>
          </div>
        </div>
      </section>

      <!-- Text lookup -->
      <button
        class="w-full bg-surface-container-low rounded-xl p-4 flex items-center gap-4 text-left hover:bg-surface-container transition-colors active:scale-[0.98]"
        @click="openLookup"
      >
        <div class="w-10 h-10 bg-white shadow rounded-lg flex items-center justify-center text-secondary">
          <span class="material-symbols-outlined">search</span>
        </div>
        <div>
          <p class="text-sm font-semibold text-on-surface">Search by serial or model</p>
          <p class="text-xs text-on-surface-variant">Type what you know — GPT fills in the rest</p>
        </div>
        <span class="material-symbols-outlined text-on-surface-variant/40 ml-auto">chevron_right</span>
      </button>

      <!-- Manual entry shortcut -->
      <button
        class="w-full py-3 text-sm font-semibold text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center gap-2"
        @click="enterManual"
      >
        <span class="material-symbols-outlined text-lg">edit_note</span>
        Or enter details manually
      </button>
    </template>

    <!-- ==================== LOOKUP STATE ==================== -->
    <template v-if="state === 'lookup'">
      <section class="space-y-5">
        <div class="flex items-center gap-2 border-l-4 border-secondary pl-3">
          <h3 class="font-headline font-bold text-xl text-on-surface">Search Device</h3>
        </div>
        <p class="text-on-surface-variant text-sm">Enter any combination of serial number, model name, or brand. GPT will identify the device and prefill specs.</p>

        <div class="space-y-3">
          <textarea
            v-model="lookupQuery"
            rows="3"
            placeholder="e.g.&#10;Serial: C02FN1XXMD6T&#10;MacBook Pro M3 Max&#10;Dell Latitude 5540"
            class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium resize-none font-mono text-sm"
            @keydown.meta.enter="handleLookup"
            @keydown.ctrl.enter="handleLookup"
          ></textarea>

          <div class="flex gap-3">
            <button
              class="flex-1 bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-bold active:scale-95 transition-transform"
              @click="state = 'idle'"
            >
              Back
            </button>
            <button
              :disabled="!lookupQuery.trim()"
              class="flex-[2] bg-gradient-to-r from-primary to-primary-container text-white py-3 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40"
              @click="handleLookup"
            >
              <span class="material-symbols-outlined text-lg">search</span>
              Look Up Device
            </button>
          </div>
        </div>

        <div class="bg-secondary-container/10 rounded-xl p-4 space-y-2">
          <p class="text-xs font-bold uppercase tracking-widest text-secondary">Tips</p>
          <ul class="space-y-1.5 text-xs text-on-surface-variant">
            <li class="flex gap-2"><span class="material-symbols-outlined text-secondary text-sm">check_circle</span> Apple serials encode model, year, and config</li>
            <li class="flex gap-2"><span class="material-symbols-outlined text-secondary text-sm">check_circle</span> Include brand + model for best results</li>
            <li class="flex gap-2"><span class="material-symbols-outlined text-secondary text-sm">check_circle</span> You can always edit after lookup</li>
          </ul>
        </div>
      </section>
    </template>

    <!-- ==================== SCANNING STATE ==================== -->
    <template v-if="state === 'scanning'">
      <section class="flex flex-col items-center justify-center py-16 space-y-6">
        <div class="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center animate-pulse">
          <span class="material-symbols-outlined text-primary !text-4xl">{{ scanMode === 'text' ? 'search' : 'document_scanner' }}</span>
        </div>
        <div class="text-center">
          <h2 class="font-headline font-bold text-lg text-on-surface">{{ scanMode === 'text' ? 'Looking up device...' : 'Analyzing image...' }}</h2>
          <p class="text-on-surface-variant text-sm mt-1">{{ scanMode === 'text' ? 'GPT-4o is searching for specs' : 'GPT-4o is reading your device specs' }}</p>
        </div>
        <div class="w-48 h-1 bg-surface-container-highest rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full animate-[shimmer_1.5s_ease-in-out_infinite]" style="width: 60%"></div>
        </div>
      </section>
    </template>

    <!-- ==================== FORM STATE ==================== -->
    <template v-if="state === 'form' || state === 'submitting'">
      <!-- Scanned image preview -->
      <div v-if="previewUrl" class="flex items-center gap-4 bg-surface-container-low rounded-xl p-3">
        <img :src="previewUrl" alt="Scanned asset" class="w-16 h-16 object-cover rounded-lg" />
        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold uppercase tracking-widest text-secondary">AI Scanned</p>
          <p class="text-sm text-on-surface-variant truncate">Review and edit details below</p>
        </div>
        <button class="text-on-surface-variant hover:text-primary transition-colors" @click="resetForm">
          <span class="material-symbols-outlined">refresh</span>
        </button>
      </div>

      <form class="space-y-8" @submit.prevent="handleSubmit">
        <!-- Hardware Details -->
        <section class="space-y-6">
          <div class="flex items-center gap-2 border-l-4 border-secondary pl-3">
            <h3 class="font-headline font-bold text-xl text-on-surface">Hardware Details</h3>
          </div>

          <div class="space-y-5">
            <!-- Category -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Category</label>
              <select v-model="form.category" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface font-medium">
                <option value="laptop">Laptop</option>
                <option value="monitor">Monitor</option>
                <option value="peripheral">Peripheral</option>
              </select>
            </div>

            <!-- Asset Name -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Asset Name</label>
              <input v-model="form.assetName" type="text" placeholder="e.g. MacBook Pro 14-inch M3" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium" />
            </div>

            <!-- Manufacturer + Model row -->
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Manufacturer</label>
                <input v-model="form.manufacturer" type="text" placeholder="e.g. Apple" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Model</label>
                <input v-model="form.model" type="text" placeholder="e.g. A2918" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium" />
              </div>
            </div>

            <!-- Serial Number -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Serial Number</label>
              <input v-model="form.serialNumber" type="text" placeholder="SN-XXXX-XXXX" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium font-mono" />
            </div>

            <!-- Specs grid: CPU, RAM, Storage -->
            <div class="grid grid-cols-3 gap-4">
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Processor</label>
                <input v-model="form.cpu" type="text" placeholder="M3 Pro" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium text-sm" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">RAM (GB)</label>
                <input v-model="form.ramGb" type="text" placeholder="16" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium text-sm" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Storage (GB)</label>
                <input v-model="form.diskGb" type="text" placeholder="512" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium text-sm" />
              </div>
            </div>

            <!-- Condition -->
            <div class="space-y-3">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Condition</label>
              <div class="grid grid-cols-4 gap-3">
                <label
                  v-for="c in CONDITIONS"
                  :key="c"
                  class="relative flex items-center justify-center p-3 bg-surface-container-lowest rounded-xl shadow-sm cursor-pointer border-2 transition-all text-sm font-semibold"
                  :class="form.condition === c ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-on-surface'"
                >
                  <input v-model="form.condition" type="radio" name="condition" :value="c" class="hidden" />
                  {{ conditionLabel(c) }}
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Asset Information -->
        <section class="space-y-6">
          <div class="flex items-center gap-2 border-l-4 border-primary pl-3">
            <h3 class="font-headline font-bold text-xl text-on-surface">Asset Information</h3>
          </div>

          <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Model Year</label>
                <input v-model="form.modelYear" type="text" placeholder="2024" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium" />
              </div>
              <div class="space-y-1.5">
                <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Status</label>
                <select v-model="form.status" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface font-medium">
                  <option value="in_use">In Use</option>
                  <option value="spare">Spare</option>
                  <option value="retired">Retired</option>
                </select>
              </div>
            </div>

            <!-- Purchase Price (AED) -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Purchase Price (AED)</label>
              <input v-model="form.purchasePrice" type="text" inputmode="decimal" placeholder="0.00" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium" />
            </div>

            <!-- Purchase Date -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Purchase Date</label>
              <div class="overflow-hidden rounded-lg">
                <input v-model="form.purchaseDate" type="date" class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface font-medium appearance-none text-sm" style="min-width: 0; max-width: 100%;" />
              </div>
            </div>

            <!-- Assigned To (employee dropdown) -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">
                Assigned To
                <span v-if="form.status === 'in_use'" class="text-error">*</span>
              </label>
              <div class="relative">
                <div class="relative">
                  <input
                    v-model="assigneeSearch"
                    type="text"
                    placeholder="Search employee..."
                    class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium pr-10"
                    :class="validationErrors.assignedTo ? 'ring-2 ring-error' : ''"
                    @focus="assigneeDropdownOpen = true"
                    @blur="onAssigneeBlur"
                    @input="assigneeDropdownOpen = true; clearValidation('assignedTo')"
                  />
                  <span class="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant/50 text-lg">person_search</span>
                </div>

                <!-- Dropdown -->
                <div
                  v-if="assigneeDropdownOpen"
                  class="absolute z-30 w-full mt-1 bg-white rounded-xl shadow-lg border border-outline-variant/20 max-h-52 overflow-y-auto"
                >
                  <!-- Unassigned option -->
                  <button
                    type="button"
                    class="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex items-center gap-3 border-b border-surface-container-high"
                    @mousedown.prevent="selectUnassigned"
                  >
                    <span class="material-symbols-outlined text-on-surface-variant text-lg">person_off</span>
                    <span class="text-sm text-on-surface-variant italic">Unassigned</span>
                  </button>

                  <button
                    v-for="emp in filteredEmployees"
                    :key="emp.name"
                    type="button"
                    class="w-full text-left px-4 py-3 hover:bg-surface-container-low transition-colors flex items-center gap-3"
                    @mousedown.prevent="selectEmployee(emp.name)"
                  >
                    <div class="w-7 h-7 rounded-full bg-secondary-container/20 flex items-center justify-center text-[10px] font-bold text-on-secondary-container">
                      {{ emp.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) }}
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-on-surface truncate">{{ emp.name }}</p>
                      <p v-if="emp.department" class="text-[10px] text-on-surface-variant truncate">{{ emp.department }}</p>
                    </div>
                  </button>

                  <div v-if="filteredEmployees.length === 0" class="px-4 py-3 text-sm text-on-surface-variant text-center">
                    No employees found
                  </div>
                </div>
              </div>
              <p v-if="validationErrors.assignedTo" class="text-xs text-error ml-1 mt-1">{{ validationErrors.assignedTo }}</p>
            </div>

            <!-- Notes -->
            <div class="space-y-1.5">
              <label class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Notes</label>
              <textarea v-model="form.notes" rows="3" placeholder="Any additional details..." class="w-full bg-surface-container-highest border-none rounded-lg px-4 py-3.5 text-on-surface placeholder:text-on-surface-variant/40 font-medium resize-none"></textarea>
            </div>
          </div>
        </section>

        <!-- Actions -->
        <div class="flex flex-col gap-3 pt-4">
          <button
            type="submit"
            :disabled="state === 'submitting'"
            class="w-full bg-gradient-to-r from-primary to-primary-container text-white py-4 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <span v-if="state === 'submitting'" class="material-symbols-outlined animate-spin">progress_activity</span>
            <span v-else class="material-symbols-outlined">save</span>
            {{ state === 'submitting' ? 'Saving...' : (isEditMode ? 'Update Asset' : 'Submit Asset') }}
          </button>
          <button
            type="button"
            class="w-full bg-surface-container-high text-on-surface-variant py-4 rounded-xl font-bold active:scale-95 transition-transform"
            @click="resetForm"
          >
            Clear Form
          </button>
        </div>
      </form>
    </template>

    <!-- ==================== SUCCESS STATE ==================== -->
    <template v-if="state === 'success'">
      <section class="flex flex-col items-center justify-center py-16 space-y-6 text-center">
        <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <span class="material-symbols-outlined text-green-600 !text-4xl">check_circle</span>
        </div>
        <div>
          <h2 class="font-headline font-bold text-2xl text-on-surface">{{ isEditMode ? 'Asset Updated!' : 'Asset Saved!' }}</h2>
          <p class="text-on-surface-variant text-sm mt-2">{{ form.assetName || 'Asset' }} has been {{ isEditMode ? 'updated in' : 'added to' }} inventory.</p>
        </div>
        <div class="flex gap-3 w-full max-w-sm">
          <button
            v-if="!isEditMode"
            class="flex-1 bg-primary text-white py-3 rounded-xl font-bold active:scale-95 transition-transform"
            @click="resetForm"
          >
            Scan Another
          </button>
          <router-link
            to="/inventory"
            class="flex-1 bg-surface-container-high text-on-surface py-3 rounded-xl font-bold text-center active:scale-95 transition-transform"
            :class="isEditMode ? 'bg-primary text-white' : ''"
          >
            View Inventory
          </router-link>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped>
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}
</style>
