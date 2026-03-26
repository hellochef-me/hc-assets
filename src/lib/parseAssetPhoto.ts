import OpenAI from 'openai'
import { SHEET_HEADERS } from '@/types/asset'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

const FIELD_LIST = SHEET_HEADERS
  .filter((h) => !['id', 'createdAt', 'updatedAt'].includes(h))
  .join(', ')

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

export async function parseAssetPhoto(base64Image: string): Promise<ParsedAsset> {
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key is not configured.')
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  })

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You extract IT hardware asset details from photos of device stickers, serial tags, About screens, BIOS screens, or retail boxes. Return ONLY valid JSON with these fields:
{
  "category": "laptop" | "monitor" | "peripheral",
  "assetName": "friendly name e.g. MacBook Pro 14-inch M3",
  "manufacturer": "e.g. Apple, Dell, HP, Lenovo",
  "model": "exact model identifier",
  "serialNumber": "device serial number",
  "cpu": "processor description",
  "ramGb": "RAM in GB as a number string e.g. 16",
  "diskGb": "storage in GB as a number string e.g. 512",
  "modelYear": "year as string e.g. 2024",
  "purchasePrice": "",
  "purchaseCurrency": "",
  "purchaseDate": "",
  "condition": "new" | "good" | "fair" | "damaged",
  "notes": ""
}

Available fields: ${FIELD_LIST}. Use empty string for fields you cannot determine. Never guess wildly — only fill what is clearly visible.`,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Extract the hardware asset details from this photo. Return only the JSON object.',
          },
          {
            type: 'image_url',
            image_url: {
              url: base64Image.startsWith('data:')
                ? base64Image
                : `data:image/jpeg;base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    max_tokens: 800,
    temperature: 0.1,
  })

  const content = response.choices[0]?.message?.content ?? '{}'

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    return JSON.parse(jsonMatch ? jsonMatch[0] : content) as ParsedAsset
  } catch {
    return {}
  }
}
