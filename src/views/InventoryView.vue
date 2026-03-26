<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { fetchInventory } from '@/lib/fetchInventory'
import type { Asset } from '@/types/asset'
import dayjs from 'dayjs'

const assets = ref<Asset[]>([])
const loading = ref(true)
const errorMsg = ref('')
const search = ref('')
const statusFilter = ref<string>('all')

onMounted(async () => {
  try {
    assets.value = await fetchInventory()
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load inventory'
  } finally {
    loading.value = false
  }
})

const filteredAssets = computed(() => {
  let result = assets.value

  if (statusFilter.value !== 'all') {
    result = result.filter((a) => a.status === statusFilter.value)
  }

  const q = search.value.toLowerCase().trim()
  if (q) {
    result = result.filter(
      (a) =>
        a.assetName.toLowerCase().includes(q) ||
        a.manufacturer.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.assignedTo.toLowerCase().includes(q),
    )
  }

  return result
})

const statusCounts = computed(() => {
  const counts = { all: assets.value.length, in_use: 0, spare: 0, retired: 0 }
  for (const a of assets.value) {
    if (a.status in counts) counts[a.status as keyof typeof counts]++
  }
  return counts
})

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('MMM DD, YYYY') : '—'
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'in_use': return 'bg-secondary-container/20 text-on-secondary-container'
    case 'spare': return 'bg-tertiary-container/10 text-tertiary-container'
    case 'retired': return 'bg-error-container/20 text-error'
    default: return 'bg-surface-container-high text-on-surface-variant'
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'in_use': return 'In Use'
    case 'spare': return 'Available'
    case 'retired': return 'Retired'
    default: return status
  }
}

function initials(name: string): string {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function laptopIcon(manufacturer: string): string {
  const m = manufacturer.toLowerCase()
  if (m.includes('apple') || m.includes('mac')) return 'laptop_mac'
  if (m.includes('chrome')) return 'laptop_chromebook'
  return 'laptop_windows'
}
</script>

<template>
  <!-- Desktop Header -->
  <header class="sticky top-0 z-50 bg-surface flex items-center justify-between px-6 md:px-8 h-16 md:h-20 font-headline tracking-tight">
    <div class="flex items-center gap-6">
      <span class="text-xl md:text-2xl font-bold text-primary">AssetConcierge</span>
      <nav class="hidden md:flex items-center gap-6">
        <router-link to="/" class="text-stone-600 font-medium hover:text-primary transition-colors text-sm">Scanner</router-link>
        <router-link to="/inventory" class="text-primary font-bold border-b-2 border-primary text-sm">Inventory</router-link>
      </nav>
    </div>
    <!-- Desktop search -->
    <div class="hidden md:flex items-center bg-surface-container-low px-4 py-2 rounded-lg gap-3">
      <span class="material-symbols-outlined text-on-surface-variant text-sm">search</span>
      <input
        v-model="search"
        type="text"
        placeholder="Search assets..."
        class="bg-transparent border-none focus:ring-0 text-sm w-48 font-body focus:shadow-none"
      />
    </div>
  </header>

  <main class="flex-1 px-4 md:px-8 pb-24 md:pb-8">
    <!-- Page header -->
    <div class="max-w-7xl mx-auto">
      <header class="py-6 md:py-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight text-on-surface font-headline">Inventory</h1>
          <p class="text-tertiary-container font-body mt-1 max-w-xl text-sm md:text-base">Your organization's IT assets at a glance.</p>
        </div>
        <router-link
          to="/"
          class="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-container text-white py-3 px-5 rounded-lg font-bold shadow-lg shadow-primary/20 hover:translate-y-[-1px] transition-all text-sm active:scale-95"
        >
          <span class="material-symbols-outlined text-sm">add</span>
          Add Asset
        </router-link>
      </header>

      <!-- Mobile search -->
      <div class="md:hidden mb-4">
        <div class="flex items-center bg-surface-container-low px-4 py-3 rounded-xl gap-3">
          <span class="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            v-model="search"
            type="text"
            placeholder="Search by name, serial, assignee..."
            class="bg-transparent border-none focus:ring-0 text-sm w-full font-body focus:shadow-none"
          />
        </div>
      </div>

      <!-- Filter pills -->
      <div class="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 mb-6">
        <button
          v-for="s in (['all', 'in_use', 'spare', 'retired'] as const)"
          :key="s"
          class="px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-colors"
          :class="statusFilter === s
            ? 'bg-secondary text-white'
            : 'bg-surface-container-high text-on-surface hover:bg-secondary-container/20'"
          @click="statusFilter = s"
        >
          {{ s === 'all' ? 'All' : statusLabel(s) }}
          <span class="ml-1 opacity-70">({{ statusCounts[s] }})</span>
        </button>
      </div>

      <!-- Loading -->
      <div v-if="loading" class="flex flex-col items-center justify-center py-20 space-y-4">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
          <span class="material-symbols-outlined text-primary">inventory_2</span>
        </div>
        <p class="text-on-surface-variant text-sm">Loading inventory...</p>
      </div>

      <!-- Error -->
      <div v-else-if="errorMsg" class="bg-error-container text-on-error-container rounded-xl px-5 py-4 text-sm font-medium flex items-center gap-3">
        <span class="material-symbols-outlined text-error">error</span>
        {{ errorMsg }}
      </div>

      <!-- Empty -->
      <div v-else-if="filteredAssets.length === 0" class="flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center">
          <span class="material-symbols-outlined text-on-surface-variant !text-3xl">devices</span>
        </div>
        <div>
          <h3 class="font-headline font-bold text-lg text-on-surface">{{ search || statusFilter !== 'all' ? 'No matching assets' : 'No assets yet' }}</h3>
          <p class="text-on-surface-variant text-sm mt-1">
            {{ search || statusFilter !== 'all' ? 'Try adjusting your search or filter.' : 'Scan your first device to get started.' }}
          </p>
        </div>
        <router-link
          v-if="!search && statusFilter === 'all'"
          to="/"
          class="mt-2 inline-flex items-center gap-2 bg-primary text-white py-3 px-6 rounded-xl font-bold text-sm active:scale-95 transition-transform"
        >
          <span class="material-symbols-outlined text-sm">center_focus_strong</span>
          Scan First Asset
        </router-link>
      </div>

      <!-- ==================== DESKTOP TABLE ==================== -->
      <div v-else class="hidden md:block bg-surface-container-low rounded-2xl overflow-hidden">
        <table class="w-full text-left border-collapse">
          <thead>
            <tr class="bg-surface-container-high/50">
              <th class="px-8 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70">Asset</th>
              <th class="px-6 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70">Serial Number</th>
              <th class="px-6 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70">Assigned To</th>
              <th class="px-6 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70">Status</th>
              <th class="px-6 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70">Date Added</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-high/30">
            <tr
              v-for="asset in filteredAssets"
              :key="asset.id"
              class="bg-surface-container-lowest hover:bg-white transition-colors"
            >
              <td class="px-8 py-5">
                <div class="flex items-center gap-4">
                  <div class="w-11 h-11 bg-surface-container-low rounded-lg flex items-center justify-center">
                    <span class="material-symbols-outlined text-secondary">{{ laptopIcon(asset.manufacturer) }}</span>
                  </div>
                  <div>
                    <p class="font-headline font-bold text-on-surface text-sm">{{ asset.assetName || `${asset.manufacturer} ${asset.model}` }}</p>
                    <p class="text-xs text-on-surface-variant">{{ [asset.manufacturer, asset.ramGb ? `${asset.ramGb}GB RAM` : '', asset.diskGb ? `${asset.diskGb}GB` : ''].filter(Boolean).join(' · ') }}</p>
                  </div>
                </div>
              </td>
              <td class="px-6 py-5 font-mono text-sm text-on-surface-variant">{{ asset.serialNumber || '—' }}</td>
              <td class="px-6 py-5">
                <div v-if="asset.assignedTo" class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-secondary-container/20 flex items-center justify-center text-[10px] font-bold text-on-secondary-container">{{ initials(asset.assignedTo) }}</div>
                  <span class="text-sm font-medium">{{ asset.assignedTo }}</span>
                </div>
                <span v-else class="text-sm text-on-surface-variant italic">— Unassigned</span>
              </td>
              <td class="px-6 py-5">
                <span class="px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider rounded-full" :class="statusBadgeClass(asset.status)">
                  {{ statusLabel(asset.status) }}
                </span>
              </td>
              <td class="px-6 py-5 text-sm text-on-surface-variant">{{ formatDate(asset.createdAt) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="bg-surface-container-low px-8 py-4 text-xs text-on-surface-variant font-medium">
          Showing {{ filteredAssets.length }} of {{ assets.length }} assets
        </div>
      </div>

      <!-- ==================== MOBILE CARDS ==================== -->
      <div class="md:hidden space-y-3">
        <div
          v-for="asset in filteredAssets"
          :key="asset.id"
          class="bg-white rounded-xl p-4 shadow-sm space-y-3"
        >
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-surface-container-low rounded-lg flex items-center justify-center">
              <span class="material-symbols-outlined text-secondary text-xl">{{ laptopIcon(asset.manufacturer) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="font-headline font-bold text-on-surface text-sm truncate">{{ asset.assetName || `${asset.manufacturer} ${asset.model}` }}</p>
              <p class="text-xs text-on-surface-variant">{{ asset.manufacturer }}</p>
            </div>
            <span class="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider rounded-full" :class="statusBadgeClass(asset.status)">
              {{ statusLabel(asset.status) }}
            </span>
          </div>

          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <div class="flex justify-between">
              <span class="text-on-surface-variant">Serial</span>
              <span class="font-mono font-medium text-on-surface">{{ asset.serialNumber || '—' }}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-on-surface-variant">Specs</span>
              <span class="font-medium text-on-surface">{{ [asset.ramGb ? `${asset.ramGb}GB` : '', asset.diskGb ? `${asset.diskGb}GB` : ''].filter(Boolean).join(' / ') || '—' }}</span>
            </div>
            <div class="col-span-2 flex justify-between pt-1">
              <span class="text-on-surface-variant">Assigned</span>
              <span class="font-medium text-on-surface">{{ asset.assignedTo || 'Unassigned' }}</span>
            </div>
          </div>
        </div>

        <p class="text-center text-xs text-on-surface-variant pt-2">
          {{ filteredAssets.length }} of {{ assets.length }} assets
        </p>
      </div>
    </div>
  </main>
</template>
