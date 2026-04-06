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

IMPORTANT: First read everything visible in the image. Then USE YOUR KNOWLEDGE to fill in remaining specs. For example:
- If you see an Apple serial number, use it to determine the exact model, year, CPU, RAM, and storage configuration.
- If you see a Dell Service Tag, infer the model line and typical specs.
- If you see an IMEI, iPhone model number, or Samsung model code, identify the exact phone model and storage capacity when possible.
- If you recognize a model number (e.g. A2918, ThinkPad T14s Gen 4), fill in the known default specs for that model.
- Cross-reference manufacturer + model + serial to be as complete as possible.

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

Available fields: ${FIELD_LIST}. Use empty string ONLY for fields you truly cannot determine even with your knowledge. Prefer filling fields with your best informed answer over leaving them blank.`,
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
