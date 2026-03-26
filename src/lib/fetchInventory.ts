import type { Asset } from '@/types/asset'

const APPS_SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL as string | undefined

function getVal(raw: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = raw[k]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return ''
}

function normalizeRow(raw: Record<string, string>): Asset {
  return {
    id: getVal(raw, 'id', 'ID'),
    category: getVal(raw, 'category', 'Category') || 'laptop',
    assetName: getVal(raw, 'assetName', 'Asset Name'),
    manufacturer: getVal(raw, 'manufacturer', 'Manufacturer'),
    model: getVal(raw, 'model', 'Model'),
    serialNumber: getVal(raw, 'serialNumber', 'Serial Number'),
    cpu: getVal(raw, 'cpu', 'CPU'),
    ramGb: getVal(raw, 'ramGb', 'RAM (GB)'),
    diskGb: getVal(raw, 'diskGb', 'Storage (GB)'),
    modelYear: getVal(raw, 'modelYear', 'Model Year'),
    purchasePrice: getVal(raw, 'purchasePrice', 'Purchase Price'),
    purchaseCurrency: getVal(raw, 'purchaseCurrency', 'Currency'),
    purchaseDate: getVal(raw, 'purchaseDate', 'Purchase Date'),
    condition: getVal(raw, 'condition', 'Condition') || 'good',
    assignedTo: getVal(raw, 'assignedTo', 'Assigned To'),
    status: getVal(raw, 'status', 'Status') || 'spare',
    notes: getVal(raw, 'notes', 'Notes'),
    createdAt: getVal(raw, 'createdAt', 'Created At'),
    updatedAt: getVal(raw, 'updatedAt', 'Updated At'),
  }
}

export async function fetchInventory(): Promise<Asset[]> {
  const url = APPS_SCRIPT_URL
  if (!url) {
    throw new Error('Apps Script URL is not configured. Set VITE_APPS_SCRIPT_URL in your .env file.')
  }

  const response = await fetch(url, { method: 'GET' })

  if (!response.ok) {
    throw new Error(`Failed to fetch inventory: ${response.statusText}`)
  }

  const data = await response.json()

  if (Array.isArray(data)) {
    return data.map((row: Record<string, string>) => normalizeRow(row)).reverse()
  }

  if (data?.error) {
    throw new Error(data.error)
  }

  return []
}
