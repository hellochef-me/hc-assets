import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'scan',
      component: () => import('@/views/ScanView.vue'),
    },
    {
      path: '/edit/:id',
      name: 'edit',
      component: () => import('@/views/ScanView.vue'),
      props: true,
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: () => import('@/views/InventoryView.vue'),
    },
  ],
})

export default router
