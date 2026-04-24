<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { fetchInventory } from '@/lib/fetchInventory'
import { deleteAsset } from '@/lib/deleteAsset'
import { fetchAssetHistory } from '@/lib/fetchAssignmentHistory'
import { fetchEmployees } from '@/lib/fetchEmployees'
import { ASSET_CATEGORIES, STATUSES, type Asset, type AssignmentHistoryEvent } from '@/types/asset'
import dayjs from 'dayjs'

const router = useRouter()

const assets = ref<Asset[]>([])
const loading = ref(true)
const errorMsg = ref('')
const search = ref('')
const employees = ref<string[]>([])
const statusFilter = ref<string>('all')
const categoryFilter = ref<string>('all')
const assigneeFilter = ref<string>('all')
const UNASSIGNED_FILTER = '__unassigned__'

const deleteConfirmId = ref<string | null>(null)
const deleting = ref(false)
const historyAsset = ref<Asset | null>(null)
const historyLoading = ref(false)
const historyError = ref('')
const historyEvents = ref<AssignmentHistoryEvent[]>([])

onMounted(async () => {
  try {
    const [inventory, employeeRows] = await Promise.all([
      fetchInventory(),
      fetchEmployees(),
    ])
    assets.value = inventory
    employees.value = employeeRows.map((e) => e.name).filter(Boolean)
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load inventory'
  } finally {
    loading.value = false
  }
})

function editAsset(id: string) {
  router.push(`/edit/${id}`)
}

function confirmDelete(id: string) {
  deleteConfirmId.value = id
}

function cancelDelete() {
  deleteConfirmId.value = null
}

async function openAssetHistory(asset: Asset) {
  historyAsset.value = asset
  historyLoading.value = true
  historyError.value = ''
  historyEvents.value = []

  try {
    const events = await fetchAssetHistory(asset.id)
    historyEvents.value = events.sort((a, b) => dayjs(b.changedAt).valueOf() - dayjs(a.changedAt).valueOf())
  } catch (err: unknown) {
    historyError.value = err instanceof Error ? err.message : 'Failed to load asset history'
  } finally {
    historyLoading.value = false
  }
}

function closeAssetHistory() {
  historyAsset.value = null
  historyError.value = ''
  historyEvents.value = []
}

async function handleDelete() {
  const id = deleteConfirmId.value
  if (!id) return

  deleting.value = true
  try {
    await deleteAsset(id)
    assets.value = assets.value.filter((a) => a.id !== id)
    deleteConfirmId.value = null
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to delete asset'
  } finally {
    deleting.value = false
  }
}

const filteredAssets = computed(() => {
  let result = assets.value

  if (statusFilter.value !== 'all') {
    result = result.filter((a) => a.status === statusFilter.value)
  }

  if (categoryFilter.value !== 'all') {
    result = result.filter((a) => a.category === categoryFilter.value)
  }

  if (assigneeFilter.value !== 'all') {
    if (assigneeFilter.value === UNASSIGNED_FILTER) {
      result = result.filter((a) => !a.assignedTo.trim())
    } else {
      const selectedAssignee = assigneeFilter.value.toLowerCase().trim()
      result = result.filter((a) => a.assignedTo.toLowerCase().trim() === selectedAssignee)
    }
  }

  const q = search.value.toLowerCase().trim()
  if (q) {
    result = result.filter(
      (a) =>
        a.assetName.toLowerCase().includes(q) ||
        a.manufacturer.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        a.assignedTo.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    )
  }

  return result
})

const assigneeOptions = computed(() => {
  const names = new Set<string>()
  for (const name of employees.value) names.add(name)
  for (const asset of assets.value) {
    const assigned = asset.assignedTo.trim()
    if (assigned) names.add(assigned)
  }
  return [...names].sort((a, b) => a.localeCompare(b))
})

const hasActiveFilters = computed(() => {
  return !!search.value.trim()
    || statusFilter.value !== 'all'
    || categoryFilter.value !== 'all'
    || assigneeFilter.value !== 'all'
})

const activeFilterCount = computed(() => {
  let count = 0
  if (search.value.trim()) count++
  if (statusFilter.value !== 'all') count++
  if (categoryFilter.value !== 'all') count++
  if (assigneeFilter.value !== 'all') count++
  return count
})

function clearFilters() {
  search.value = ''
  statusFilter.value = 'all'
  categoryFilter.value = 'all'
  assigneeFilter.value = 'all'
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('MMM DD, YYYY') : '—'
}

function formatDateTime(iso: string): string {
  if (!iso) return '—'
  const d = dayjs(iso)
  return d.isValid() ? d.format('MMM DD, YYYY h:mm A') : '—'
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

function categoryLabel(category: string): string {
  switch (category) {
    case 'phone': return 'Phones'
    case 'monitor': return 'Monitors'
    case 'peripheral': return 'Peripherals'
    case 'laptop': return 'Laptops'
    default: return category
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

function assetIcon(category: string, manufacturer: string): string {
  switch (category.toLowerCase()) {
    case 'phone':
      return 'smartphone'
    case 'monitor':
      return 'monitor'
    case 'peripheral':
      return 'keyboard'
  }

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
      <span class="text-xl md:text-2xl font-bold text-primary">Asset Concierge</span>
      <nav class="hidden md:flex items-center gap-6">
        <router-link to="/" class="text-stone-600 font-medium hover:text-primary transition-colors text-sm">Scanner</router-link>
        <router-link to="/inventory" class="text-primary font-bold border-b-2 border-primary text-sm">Inventory</router-link>
        <router-link to="/history" class="text-stone-600 font-medium hover:text-primary transition-colors text-sm">History</router-link>
      </nav>
    </div>
    <div class="hidden md:block"></div>
  </header>

  <main class="flex-1 px-4 md:px-8 pb-24 md:pb-8">
    <!-- Page header -->
    <div class="max-w-7xl mx-auto">
      <header class="py-6 md:py-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight text-on-surface font-headline">Inventory</h1>
          <p class="text-tertiary-container font-body mt-1 max-w-xl text-sm md:text-base">Your organization's IT assets at a glance.</p>
        </div>
        <div class="flex items-center gap-3">
          <a
            href="https://docs.google.com/spreadsheets/d/1ZeV0krMc_ZeH2e-iOd9ft5jMvGwNcCtu4SPYYXI0x_A/edit?gid=0#gid=0"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center gap-2 bg-surface-container-high text-on-surface-variant py-3 px-5 rounded-lg font-bold hover:translate-y-[-1px] transition-all text-sm active:scale-95"
          >
            <span class="material-symbols-outlined text-sm">table_chart</span>
            Edit in Sheet
          </a>
          <router-link
            to="/"
            class="inline-flex items-center gap-2 bg-gradient-to-r from-primary to-primary-container text-white py-3 px-5 rounded-lg font-bold shadow-lg shadow-primary/20 hover:translate-y-[-1px] transition-all text-sm active:scale-95"
          >
            <span class="material-symbols-outlined text-sm">add</span>
            Add Asset
          </router-link>
        </div>
      </header>

      <section class="mb-6 bg-surface-container-low rounded-2xl p-4 md:p-5 space-y-4">
        <div class="flex items-center bg-white px-4 py-3 rounded-xl gap-3">
          <span class="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            v-model="search"
            type="text"
            placeholder="Search by name, serial, assignee, category..."
            class="bg-transparent border-none focus:ring-0 text-sm w-full font-body focus:shadow-none"
          />
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label class="space-y-1.5">
            <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Status</span>
            <select
              v-model="statusFilter"
              class="w-full h-11 bg-white border-none rounded-lg px-3 py-2 text-sm text-on-surface font-medium"
            >
              <option value="all">All statuses</option>
              <option v-for="status in STATUSES" :key="status" :value="status">
                {{ statusLabel(status) }}
              </option>
            </select>
          </label>

          <label class="space-y-1.5">
            <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Category</span>
            <select
              v-model="categoryFilter"
              class="w-full h-11 bg-white border-none rounded-lg px-3 py-2 text-sm text-on-surface font-medium"
            >
              <option value="all">All categories</option>
              <option v-for="category in ASSET_CATEGORIES" :key="category" :value="category">
                {{ categoryLabel(category) }}
              </option>
            </select>
          </label>

          <label class="space-y-1.5">
            <span class="text-[11px] font-bold uppercase tracking-widest text-on-surface-variant ml-1">Assigned To</span>
            <select
              v-model="assigneeFilter"
              class="w-full h-11 bg-white border-none rounded-lg px-3 py-2 text-sm text-on-surface font-medium"
            >
              <option value="all">All assignees</option>
              <option :value="UNASSIGNED_FILTER">Unassigned</option>
              <option v-for="name in assigneeOptions" :key="name" :value="name">{{ name }}</option>
            </select>
          </label>
        </div>

        <div class="flex items-center justify-between">
          <p class="text-xs text-on-surface-variant">
            {{ activeFilterCount > 0 ? `${activeFilterCount} filter groups active` : 'No filters applied' }}
          </p>
          <button
            type="button"
            class="text-xs font-semibold text-secondary hover:text-primary transition-colors disabled:opacity-40"
            :disabled="!hasActiveFilters"
            @click="clearFilters"
          >
            Clear filters
          </button>
        </div>
      </section>

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
          <h3 class="font-headline font-bold text-lg text-on-surface">{{ hasActiveFilters ? 'No matching assets' : 'No assets yet' }}</h3>
          <p class="text-on-surface-variant text-sm mt-1">
            {{ hasActiveFilters ? 'Try adjusting your search or filters.' : 'Scan your first device to get started.' }}
          </p>
        </div>
        <router-link
          v-if="!hasActiveFilters"
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
              <th class="px-6 py-5 text-[10px] uppercase tracking-[0.2em] font-bold text-on-surface-variant/70 text-right">Actions</th>
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
                    <span class="material-symbols-outlined text-secondary">{{ assetIcon(asset.category, asset.manufacturer) }}</span>
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
              <td class="px-6 py-5 text-right">
                <div class="flex items-center justify-end gap-1">
                  <button
                    class="p-2 rounded-lg text-on-surface-variant hover:text-secondary hover:bg-secondary/5 transition-colors"
                    title="View assignment history"
                    @click="openAssetHistory(asset)"
                  >
                    <span class="material-symbols-outlined text-lg">history</span>
                  </button>
                  <button
                    class="p-2 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                    title="Edit asset"
                    @click="editAsset(asset.id)"
                  >
                    <span class="material-symbols-outlined text-lg">edit</span>
                  </button>
                  <button
                    class="p-2 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors"
                    title="Delete asset"
                    @click="confirmDelete(asset.id)"
                  >
                    <span class="material-symbols-outlined text-lg">delete</span>
                  </button>
                </div>
              </td>
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
              <span class="material-symbols-outlined text-secondary text-xl">{{ assetIcon(asset.category, asset.manufacturer) }}</span>
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

          <div class="flex items-center justify-end gap-1 pt-1 border-t border-surface-container-high/30">
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-secondary hover:bg-secondary/5 transition-colors"
              @click="openAssetHistory(asset)"
            >
              <span class="material-symbols-outlined text-sm">history</span>
              History
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-secondary hover:bg-secondary/5 transition-colors"
              @click="editAsset(asset.id)"
            >
              <span class="material-symbols-outlined text-sm">edit</span>
              Edit
            </button>
            <button
              class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-error hover:bg-error/5 transition-colors"
              @click="confirmDelete(asset.id)"
            >
              <span class="material-symbols-outlined text-sm">delete</span>
              Delete
            </button>
          </div>
        </div>

        <p class="text-center text-xs text-on-surface-variant pt-2">
          {{ filteredAssets.length }} of {{ assets.length }} assets
        </p>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <Teleport to="body">
      <div v-if="deleteConfirmId" class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4" @click.self="cancelDelete">
        <div class="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-error/10 flex items-center justify-center">
              <span class="material-symbols-outlined text-error">warning</span>
            </div>
            <h3 class="font-headline font-bold text-lg text-on-surface">Delete Asset?</h3>
          </div>
          <p class="text-sm text-on-surface-variant">This will permanently remove the asset from inventory. This action cannot be undone.</p>
          <div class="flex gap-3 pt-2">
            <button
              class="flex-1 bg-surface-container-high text-on-surface-variant py-3 rounded-xl font-bold active:scale-95 transition-transform"
              :disabled="deleting"
              @click="cancelDelete"
            >
              Cancel
            </button>
            <button
              class="flex-1 bg-error text-white py-3 rounded-xl font-bold active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-60"
              :disabled="deleting"
              @click="handleDelete"
            >
              <span v-if="deleting" class="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              {{ deleting ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Asset assignment history modal -->
    <Teleport to="body">
      <div
        v-if="historyAsset"
        class="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        @click.self="closeAssetHistory"
      >
        <div class="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-2xl space-y-4 max-h-[85vh] overflow-hidden flex flex-col">
          <div class="flex items-start justify-between gap-4">
            <div>
              <h3 class="font-headline font-bold text-lg text-on-surface">Assignment History</h3>
              <p class="text-xs text-on-surface-variant mt-1">
                {{ historyAsset.assetName || `${historyAsset.manufacturer} ${historyAsset.model}` }}
                <span class="font-mono">({{ historyAsset.serialNumber || 'No serial' }})</span>
              </p>
            </div>
            <button
              class="text-on-surface-variant hover:text-primary transition-colors"
              @click="closeAssetHistory"
            >
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <div v-if="historyLoading" class="py-10 text-center text-sm text-on-surface-variant">
            Loading timeline...
          </div>

          <div v-else-if="historyError" class="bg-error-container text-on-error-container rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-3">
            <span class="material-symbols-outlined text-error">error</span>
            {{ historyError }}
          </div>

          <div v-else-if="historyEvents.length === 0" class="py-10 text-center text-sm text-on-surface-variant">
            No assignment transfers recorded yet.
          </div>

          <div v-else class="space-y-3 overflow-y-auto pr-1">
            <article
              v-for="event in historyEvents"
              :key="event.id"
              class="rounded-xl border border-surface-container-high/40 p-3"
            >
              <p class="text-xs text-on-surface-variant">{{ formatDateTime(event.changedAt) }}</p>
              <div class="mt-2 flex items-center gap-2 text-sm">
                <span class="px-2 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
                  {{ event.fromAssignedTo || 'Unassigned' }}
                </span>
                <span class="material-symbols-outlined text-on-surface-variant text-base">arrow_forward</span>
                <span class="px-2 py-1 rounded-full bg-secondary-container/20 text-on-secondary-container font-semibold">
                  {{ event.toAssignedTo || 'Unassigned' }}
                </span>
              </div>
            </article>
          </div>
        </div>
      </div>
    </Teleport>
  </main>
</template>
