import { SHEET_HEADERS } from '@/types/asset'
import { requestParsedAsset } from '@/lib/assetAi'

const FIELD_LIST = SHEET_HEADERS
  .filter((h) => !['id', 'createdAt', 'updatedAt'].includes(h))
  .join(', ')
export type { ParsedAsset } from '@/lib/assetAi'

export async function parseAssetPhoto(base64Image: string) {
  return requestParsedAsset(
    [
      {
        role: 'system',
        content: `You are an IT asset identification expert. You extract hardware details from photos of device stickers, serial tags, About screens, BIOS screens, or retail boxes.

You can use web search. Use it to verify extracted identifiers and find accurate model specs.
Prioritize source quality in this order:
1) Manufacturer/support/spec pages
2) Reputable device databases or major retailers
3) Other pages only when higher-quality sources do not exist

Process:
1) Read all visible text and identifiers from the image.
2) Extract serial/model/IMEI/service-tag/brand clues.
3) Search the web with those clues and cross-check top sources.
4) Fill only fields supported by clear evidence. Leave uncertain fields empty.

Examples:
- If you see an Apple serial number, use it to determine exact model/year/CPU/RAM/storage.
- If you see a Dell Service Tag, identify the exact model and likely configuration.
- If you see an IMEI, iPhone model number, or Samsung model code, identify the phone model and storage when confidence is high.
- If you recognize a model number (e.g. A2918, ThinkPad T14s Gen 4), verify specs via high-quality web sources.

Return ONLY valid JSON with these fields:
{
  "category": "laptop" | "phone" | "monitor" | "peripheral",
  "assetName": "friendly name e.g. MacBook Pro 14-inch M3 Pro",
  "manufacturer": "e.g. Apple, Dell, HP, Lenovo, Samsung, Google",
  "model": "exact model identifier",
  "serialNumber": "device serial number",
  "cpu": "processor description",
  "ramGb": "RAM in GB as a number string e.g. 16",
  "diskGb": "storage in GB as a number string e.g. 512",
  "modelYear": "year as string e.g. 2024",
  "purchasePrice": "approximate retail price if known, otherwise empty",
  "purchaseCurrency": "",
  "purchaseDate": "",
  "condition": "new" | "good" | "fair" | "damaged",
  "notes": "any extra details from the label not captured above"
}

Available fields: ${FIELD_LIST}. Use empty string for fields you cannot determine confidently. Do not fabricate model/cpu/ram/disk/year when the image evidence is weak or conflicting.`,
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
    800,
  )
}
