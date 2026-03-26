export interface Asset {
  id: string
  category: string
  assetName: string
  manufacturer: string
  model: string
  serialNumber: string
  cpu: string
  ramGb: string
  diskGb: string
  modelYear: string
  purchasePrice: string
  purchaseCurrency: string
  purchaseDate: string
  condition: string
  assignedTo: string
  status: string
  notes: string
  createdAt: string
  updatedAt: string
}

export const ASSET_CATEGORIES = ['laptop', 'monitor', 'peripheral'] as const
export const CONDITIONS = ['new', 'good', 'fair', 'damaged'] as const
export const STATUSES = ['in_use', 'spare', 'retired'] as const

export const SHEET_HEADERS: (keyof Asset)[] = [
  'id', 'category', 'assetName', 'manufacturer', 'model', 'serialNumber',
  'cpu', 'ramGb', 'diskGb', 'modelYear',
  'purchasePrice', 'purchaseCurrency', 'purchaseDate', 'condition',
  'assignedTo', 'status', 'notes', 'createdAt', 'updatedAt',
]
