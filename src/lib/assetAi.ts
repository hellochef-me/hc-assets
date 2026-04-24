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
  asset.cpu = asset.cpu.replace(/\s+/g, ' ').trim()
  asset.ramGb = asset.ramGb.replace(/[^\d]/g, '')
  asset.diskGb = asset.diskGb.replace(/[^\d]/g, '')

  // If model is unknown, suppress inferred specs to avoid fabricated detail.
  if (!asset.model) {
    asset.cpu = ''
    asset.ramGb = ''
    asset.diskGb = ''
    asset.modelYear = ''
  }

  if (asset.purchasePrice && !asset.purchaseCurrency) {
    asset.purchaseCurrency = 'USD'
  }

  return asset
}

function mapRole(role: string | undefined): 'system' | 'user' | 'assistant' {
  if (role === 'assistant' || role === 'system') return role
  return 'user'
}

function toResponsesInput(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
): Array<{
  role: 'system' | 'user' | 'assistant'
  content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }>
}> {
  const items: Array<{
    role: 'system' | 'user' | 'assistant'
    content: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }>
  }> = []

  for (const message of messages) {
    const role = mapRole((message as { role?: string }).role)
    const parts: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = []
    const content = message.content

    if (typeof content === 'string') {
      const text = content.trim()
      if (text) parts.push({ type: 'input_text', text })
    } else if (Array.isArray(content)) {
      for (const rawPart of content as unknown[]) {
        if (!rawPart || typeof rawPart !== 'object') continue
        const part = rawPart as Record<string, unknown>

        if (part.type === 'text' && typeof part.text === 'string') {
          const text = part.text.trim()
          if (text) parts.push({ type: 'input_text', text })
        }

        if (
          part.type === 'image_url'
          && typeof part.image_url === 'object'
          && part.image_url !== null
          && typeof (part.image_url as { url?: unknown }).url === 'string'
        ) {
          parts.push({
            type: 'input_image',
            image_url: (part.image_url as { url: string }).url,
          })
        }
      }
    }

    if (parts.length > 0) items.push({ role, content: parts })
  }

  return items
}

function extractResponsesOutputText(response: unknown): string {
  const outputText = (response as { output_text?: unknown })?.output_text
  if (typeof outputText === 'string' && outputText.trim()) return outputText.trim()

  const output = (response as { output?: unknown })?.output
  if (!Array.isArray(output)) return ''

  const chunks: string[] = []
  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type !== 'message' || !Array.isArray(item.content)) continue
    for (const part of item.content as Array<Record<string, unknown>>) {
      if (typeof part.text === 'string' && part.text.trim()) chunks.push(part.text.trim())
    }
  }

  return chunks.join('\n').trim()
}

function parseJsonResponse(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    // Handle fenced output or accidental wrapper text gracefully.
    const fenced = content.replace(/^```json\s*/i, '').replace(/```$/i, '').trim()
    try {
      return JSON.parse(fenced)
    } catch {
      const start = fenced.indexOf('{')
      const end = fenced.lastIndexOf('}')
      if (start >= 0 && end > start) {
        return JSON.parse(fenced.slice(start, end + 1))
      }
      throw new Error('Model did not return valid JSON.')
    }
  }
}

export async function requestParsedAsset(
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  maxTokens: number,
): Promise<ParsedAsset> {
  const openai = getOpenAIClient()
  const response = await openai.responses.create({
    model: ASSET_AI_MODEL,
    input: toResponsesInput(messages) as never,
    temperature: 0.1,
    max_output_tokens: maxTokens,
    tools: [{ type: 'web_search', search_context_size: 'medium' }] as never,
    text: {
      format: {
        type: 'json_schema',
        name: parsedAssetSchema.name,
        strict: parsedAssetSchema.strict,
        schema: parsedAssetSchema.schema,
      },
    },
  } as never)

  const content = extractResponsesOutputText(response)
  if (!content) return { ...EMPTY_PARSED_ASSET }

  return normalizeParsedAsset(parseJsonResponse(content))
}
