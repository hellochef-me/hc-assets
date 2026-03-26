const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

export async function deleteAsset(id: string): Promise<void> {
  const url = APPS_SCRIPT_URL
  if (!url) {
    throw new Error('Apps Script URL is not configured. Set VITE_APPS_SCRIPT_URL in your .env file.')
  }

  const response = await fetch(url, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ mode: 'delete', id }),
  })

  if (response.type === 'opaque') return

  if (!response.ok) {
    throw new Error(`Delete failed: ${response.statusText}`)
  }
}
