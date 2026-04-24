<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="min-h-screen bg-surface font-body text-on-surface pb-20 md:pb-0">
    <router-view />

    <!-- Mobile Bottom Nav -->
    <nav
      class="fixed bottom-0 left-0 w-full z-50 md:hidden flex justify-around items-center px-2 pt-3 bg-surface/80 backdrop-blur-xl border-t border-stone-200/15 shadow-[0_-4px_24px_rgba(29,27,22,0.04)]"
      style="padding-bottom: calc(0.5rem + env(safe-area-inset-bottom, 0.5rem))"
    >
      <router-link
        to="/"
        class="flex flex-col items-center justify-center px-4 py-1.5 transition-all"
        :class="route.name === 'scan'
          ? 'bg-primary text-white rounded-xl'
          : 'text-stone-500 hover:text-secondary'"
      >
        <span
          class="material-symbols-outlined"
          :style="route.name === 'scan' ? `font-variation-settings: 'FILL' 1` : ''"
        >center_focus_strong</span>
        <span class="text-[11px] font-medium mt-1">Scan</span>
      </router-link>

      <router-link
        to="/inventory"
        class="flex flex-col items-center justify-center px-4 py-1.5 transition-all"
        :class="route.name === 'inventory'
          ? 'bg-primary text-white rounded-xl'
          : 'text-stone-500 hover:text-secondary'"
      >
        <span
          class="material-symbols-outlined"
          :style="route.name === 'inventory' ? `font-variation-settings: 'FILL' 1` : ''"
        >inventory_2</span>
        <span class="text-[11px] font-medium mt-1">Inventory</span>
      </router-link>

      <router-link
        to="/history"
        class="flex flex-col items-center justify-center px-4 py-1.5 transition-all"
        :class="route.name === 'history'
          ? 'bg-primary text-white rounded-xl'
          : 'text-stone-500 hover:text-secondary'"
      >
        <span
          class="material-symbols-outlined"
          :style="route.name === 'history' ? `font-variation-settings: 'FILL' 1` : ''"
        >history</span>
        <span class="text-[11px] font-medium mt-1">History</span>
      </router-link>
    </nav>
  </div>
</template>
