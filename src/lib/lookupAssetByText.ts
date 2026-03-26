import OpenAI from 'openai'
import type { ParsedAsset } from '@/lib/parseAssetPhoto'

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY as string | undefined

export async function lookupAssetByText(query: string): Promise<ParsedAsset> {
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
        content: `You are an IT asset identification assistant. Given partial device info (serial number, model name, brand, or any combination), identify the device and return structured specs.

Return ONLY valid JSON:
{
  "category": "laptop" | "monitor" | "peripheral",
  "assetName": "friendly name e.g. MacBook Pro 14-inch M3",
  "manufacturer": "e.g. Apple, Dell, HP, Lenovo",
  "model": "exact model identifier",
  "serialNumber": "the serial number if provided",
  "cpu": "processor description",
  "ramGb": "RAM in GB as a number string e.g. 16",
  "diskGb": "storage in GB as a number string e.g. 512",
  "modelYear": "year as string e.g. 2024",
  "purchasePrice": "approximate retail price if known, otherwise empty",
  "purchaseCurrency": "USD if price given, otherwise empty",
  "condition": "",
  "notes": ""
}

Use empty string for fields you cannot determine. If the serial number encodes model info (e.g. Apple serials), decode what you can. If only a brand is given, leave model-specific fields empty but fill in the manufacturer. Be accurate — do not fabricate serial numbers or specs you are not confident about.`,
      },
      {
        role: 'user',
        content: `Identify this device and return the JSON:\n\n${query}`,
      },
    ],
    max_tokens: 600,
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
