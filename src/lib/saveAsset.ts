import type { Asset } from '@/types/asset'

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

export async function saveAsset(data: Asset): Promise<string> {
  const url = APPS_SCRIPT_URL
  if (!url) {
    throw new Error('Apps Script URL is not configured. Set VITE_APPS_SCRIPT_URL in your .env file.')
  }

  const response = await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(data),
  })

  if (response.type === 'opaque') return data.id

  if (!response.ok) {
    throw new Error(`Submission failed: ${response.statusText}`)
  }

  return data.id
}
