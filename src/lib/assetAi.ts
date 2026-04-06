import OpenAI from 'openai'
import { ASSET_CATEGORIES } from '@/types/asset'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

export const ASSET_AI_MODEL = 'gpt-5.4-nano'

export interface ParsedAsset {
  category?: string
  assetName?: string
  manufacturer?: string
  model?: string
  serialNumber?: string
  cpu?: string
  ramGb?: string
  diskGb?: string
  modelYear?: string
  purchasePrice?: string
  purchaseCurrency?: string
  purchaseDate?: string
  condition?: string
  assignedTo?: string
  status?: string
  notes?: string
}

const PARSED_ASSET_KEYS = [
  'category',
  'assetName',
  'manufacturer',
  'model',
  'serialNumber',
  'cpu',
  'ramGb',
  'diskGb',
  'modelYear',
  'purchasePrice',
  'purchaseCurrency',
  'purchaseDate',
  'condition',
  'assignedTo',
  'status',
  'notes',
] as const satisfies readonly (keyof ParsedAsset)[]

type ParsedAssetKey = typeof PARSED_ASSET_KEYS[number]
type StructuredParsedAsset = Record<ParsedAssetKey, string>

const EMPTY_PARSED_ASSET: StructuredParsedAsset = {
  category: '',
  assetName: '',
  manufacturer: '',
  model: '',
  serialNumber: '',
  cpu: '',
  ramGb: '',
  diskGb: '',
  modelYear: '',
  purchasePrice: '',
  purchaseCurrency: '',
  purchaseDate: '',
  condition: '',
  assignedTo: '',
  status: '',
  notes: '',
}

const CATEGORY_SET = new Set<string>(ASSET_CATEGORIES)
const CONDITION_SET = new Set(['new', 'good', 'fair', 'damaged'])
const STATUS_SET = new Set(['in_use', 'spare', 'retired'])

const parsedAssetSchema = {
  name: 'parsed_asset',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      category: { type: 'string' },
      assetName: { type: 'string' },
      manufacturer: { type: 'string' },
      model: { type: 'string' },
      serialNumber: { type: 'string' },
      cpu: { type: 'string' },
      ramGb: { type: 'string' },
      diskGb: { type: 'string' },
      modelYear: { type: 'string' },
      purchasePrice: { type: 'string' },
      purchaseCurrency: { type: 'string' },
      purchaseDate: { type: 'string' },
      condition: { type: 'string' },
      assignedTo: { type: 'string' },
      status: { type: 'string' },
      notes: { type: 'string' },
    },
    required: [...PARSED_ASSET_KEYS],
  },
} as const

function getOpenAIClient() {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured.')
  }

  return new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim()
}

function normalizeCategory(value: string, asset: StructuredParsedAsset): string {
  const normalized = value.toLowerCase().replace(/[\s-]+/g, '_')
  if (CATEGORY_SET.has(normalized)) return normalized

  const text = [
    asset.assetName,
    asset.manufacturer,
    asset.model,
    asset.cpu,
    asset.notes,
  ]
    .join(' ')
    .toLowerCase()

  if (/(iphone|pixel|galaxy|imei|phone|android)/.test(text)) return 'phone'
  if (/(monitor|display|screen)/.test(text)) return 'monitor'
  if (/(keyboard|mouse|headset|dock|adapter|charger|peripheral|webcam)/.test(text)) {
    return 'peripheral'
  }
  return normalized === 'tablet' ? 'phone' : 'laptop'
}

function normalizeCondition(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, '')
  return CONDITION_SET.has(normalized) ? normalized : ''
}

function normalizeStatus(value: string): string {
  const normalized = value.toLowerCase().replace(/\s+/g, '_')
  return STATUS_SET.has(normalized) ? normalized : ''
}

function normalizeParsedAsset(input: unknown): ParsedAsset {
  const raw = (input && typeof input === 'object') ? input as Record<string, unknown> : {}
  const asset = { ...EMPTY_PARSED_ASSET }

  for (const key of PARSED_ASSET_KEYS) {
    asset[key] = normalizeString(raw[key])
  }

  asset.category = normalizeCategory(asset.category, asset)
  asset.condition = normalizeCondition(asset.condition)
  asset.status = normalizeStatus(asset.status)

  if (asset.purchasePrice && !asset.purchaseCurrency) {
    asset.purchaseCurrency = 'USD'
  }

  return asset
}

function extractResponseText(content: string | Array<{ type?: string; text?: string }> | null | undefined): string {
  if (typeof content === 'string') return content
  if (!content) return ''

  return content
    .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

export async function requestParsedAsset(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<ParsedAsset> {
  const openai = getOpenAIClient()
  const response = await openai.chat.completions.create({
    model: ASSET_AI_MODEL,
    messages,
    temperature: 0.1,
    max_completion_tokens: maxTokens,
    response_format: {
      type: 'json_schema',
      json_schema: parsedAssetSchema,
    } as never,
  })

  const content = extractResponseText(response.choices[0]?.message?.content)
  if (!content) return { ...EMPTY_PARSED_ASSET }

  return normalizeParsedAsset(JSON.parse(content))
}
