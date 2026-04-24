import type { AssignmentHistoryEvent } from '@/types/asset'

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

function withAction(url: string, action: string, assetId?: string): string {
  const separator = url.includes('?') ? '&' : '?'
  const base = `${url}${separator}action=${encodeURIComponent(action)}`
  if (!assetId) return base
  return `${base}&assetId=${encodeURIComponent(assetId)}`
}

function normalizeEvent(raw: Record<string, unknown>): AssignmentHistoryEvent {
  return {
    id: String(raw.id || ''),
    assetId: String(raw.assetId || ''),
    assetName: String(raw.assetName || ''),
    serialNumber: String(raw.serialNumber || ''),
    fromAssignedTo: String(raw.fromAssignedTo || ''),
    toAssignedTo: String(raw.toAssignedTo || ''),
    changedAt: String(raw.changedAt || ''),
    changedBy: String(raw.changedBy || ''),
    source: String(raw.source || ''),
  }
}

async function requestHistory(url: string): Promise<AssignmentHistoryEvent[]> {
  const response = await fetch(url, { method: 'GET' })

  if (!response.ok) {
    throw new Error(`Failed to fetch assignment history: ${response.statusText}`)
  }

  const data = await response.json()
  if (Array.isArray(data)) {
    return data.map((row: Record<string, unknown>) => normalizeEvent(row))
  }

  if (data?.error) {
    throw new Error(String(data.error))
  }

  return []
}

export async function fetchAssignmentHistory(): Promise<AssignmentHistoryEvent[]> {
  const url = APPS_SCRIPT_URL
  if (!url) {
    throw new Error('Apps Script URL is not configured. Set VITE_APPS_SCRIPT_URL in your .env file.')
  }

  return requestHistory(withAction(url, 'assignmentHistory'))
}

export async function fetchAssetHistory(assetId: string): Promise<AssignmentHistoryEvent[]> {
  const url = APPS_SCRIPT_URL
  if (!url) {
    throw new Error('Apps Script URL is not configured. Set VITE_APPS_SCRIPT_URL in your .env file.')
  }

  return requestHistory(withAction(url, 'assetHistory', assetId))
}
