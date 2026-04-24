<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { fetchAssignmentHistory } from '@/lib/fetchAssignmentHistory'
import type { AssignmentHistoryEvent } from '@/types/asset'
import dayjs from 'dayjs'

const loading = ref(true)
const errorMsg = ref('')
const search = ref('')
const events = ref<AssignmentHistoryEvent[]>([])

onMounted(async () => {
  try {
    const history = await fetchAssignmentHistory()
    events.value = history.sort((a, b) => dayjs(b.changedAt).valueOf() - dayjs(a.changedAt).valueOf())
  } catch (err: unknown) {
    errorMsg.value = err instanceof Error ? err.message : 'Failed to load assignment history'
  } finally {
    loading.value = false
  }
})

const filteredEvents = computed(() => {
  const q = search.value.toLowerCase().trim()
  if (!q) return events.value

  return events.value.filter((event) =>
    event.assetName.toLowerCase().includes(q)
    || event.serialNumber.toLowerCase().includes(q)
    || event.fromAssignedTo.toLowerCase().includes(q)
    || event.toAssignedTo.toLowerCase().includes(q),
  )
})

function formatWhen(iso: string): string {
  if (!iso) return 'Unknown date'
  const d = dayjs(iso)
  if (!d.isValid()) return 'Unknown date'
  return d.format('MMM DD, YYYY h:mm A')
}
</script>

<template>
  <header class="sticky top-0 z-50 bg-surface flex items-center justify-between px-6 md:px-8 h-16 md:h-20 font-headline tracking-tight">
    <div class="flex items-center gap-6">
      <span class="text-xl md:text-2xl font-bold text-primary">Asset Concierge</span>
      <nav class="hidden md:flex items-center gap-6">
        <router-link to="/" class="text-stone-600 font-medium hover:text-primary transition-colors text-sm">Scanner</router-link>
        <router-link to="/inventory" class="text-stone-600 font-medium hover:text-primary transition-colors text-sm">Inventory</router-link>
        <router-link to="/history" class="text-primary font-bold border-b-2 border-primary text-sm">History</router-link>
      </nav>
    </div>
  </header>

  <main class="flex-1 px-4 md:px-8 pb-24 md:pb-8">
    <div class="max-w-7xl mx-auto">
      <header class="py-6 md:py-10 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 class="text-3xl md:text-5xl font-extrabold tracking-tight text-on-surface font-headline">Assignment History</h1>
          <p class="text-tertiary-container font-body mt-1 max-w-xl text-sm md:text-base">Track transfers between team members and find laptops quickly.</p>
        </div>
      </header>

      <div class="mb-6">
        <div class="flex items-center bg-surface-container-low px-4 py-3 rounded-xl gap-3">
          <span class="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            v-model="search"
            type="text"
            placeholder="Search by asset name, serial, from, or to..."
            class="bg-transparent border-none focus:ring-0 text-sm w-full font-body focus:shadow-none"
          />
        </div>
      </div>

      <div v-if="loading" class="flex flex-col items-center justify-center py-20 space-y-4">
        <div class="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center animate-pulse">
          <span class="material-symbols-outlined text-primary">history</span>
        </div>
        <p class="text-on-surface-variant text-sm">Loading assignment history...</p>
      </div>

      <div v-else-if="errorMsg" class="bg-error-container text-on-error-container rounded-xl px-5 py-4 text-sm font-medium flex items-center gap-3">
        <span class="material-symbols-outlined text-error">error</span>
        {{ errorMsg }}
      </div>

      <div v-else-if="filteredEvents.length === 0" class="flex flex-col items-center justify-center py-20 space-y-4 text-center">
        <div class="w-16 h-16 rounded-2xl bg-surface-container-high flex items-center justify-center">
          <span class="material-symbols-outlined text-on-surface-variant !text-3xl">history_toggle_off</span>
        </div>
        <div>
          <h3 class="font-headline font-bold text-lg text-on-surface">No transfer history found</h3>
          <p class="text-on-surface-variant text-sm mt-1">Reassign an asset to start tracking movement history.</p>
        </div>
      </div>

      <div v-else class="space-y-3">
        <article
          v-for="event in filteredEvents"
          :key="event.id"
          class="bg-white rounded-xl p-4 md:p-5 shadow-sm border border-surface-container-high/30"
        >
          <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div>
              <h3 class="font-headline font-bold text-on-surface text-sm md:text-base">
                {{ event.assetName || 'Unnamed asset' }}
              </h3>
              <p class="text-xs text-on-surface-variant font-mono">
                {{ event.serialNumber || 'No serial number' }}
              </p>
            </div>
            <p class="text-xs text-on-surface-variant">{{ formatWhen(event.changedAt) }}</p>
          </div>

          <div class="mt-3 flex items-center gap-3 text-sm">
            <span class="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant">
              {{ event.fromAssignedTo || 'Unassigned' }}
            </span>
            <span class="material-symbols-outlined text-on-surface-variant text-base">arrow_forward</span>
            <span class="px-2.5 py-1 rounded-full bg-secondary-container/20 text-on-secondary-container font-semibold">
              {{ event.toAssignedTo || 'Unassigned' }}
            </span>
          </div>
        </article>
      </div>
    </div>
  </main>
</template>
